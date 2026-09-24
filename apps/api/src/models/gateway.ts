import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { models as modelsTable } from '../db/schema/index.js';
import { can } from '../policy/can.js';
import type { PolicyRules } from '../policy/rules.js';
import { DEFAULT_POLICY_RULES } from '../policy/rules.js';
import { CircuitBreaker } from './circuitBreaker.js';
import { llamaChat, llamaChatStream, llamaEmbed, llamaRerank, llamaTokenize } from './llamaClient.js';
import type { LlamaToolCall } from './llamaClient.js';
import type {
  ChatRequest,
  EmbedRequest,
  ModelRole,
  RerankRequest,
  TokenizeRequest,
} from './types.js';

export interface SpanWriter {
  writeSpan(span: {
    traceId: string;
    kind: 'llm' | 'retrieval' | 'memory' | 'tool' | 'policy';
    name: string;
    model?: string;
    tokensIn?: number;
    tokensOut?: number;
    latencyMs: number;
    status: 'ok' | 'error';
    attrs?: Record<string, unknown>;
  }): Promise<void>;
}

export interface StatusEmitter {
  emitStatus(state: 'cold_start' | 'model_swap', model: string): void;
}

export interface ChatFns {
  chat: typeof llamaChat;
  chatStream: typeof llamaChatStream;
  embed: typeof llamaEmbed;
  rerank: typeof llamaRerank;
  tokenize: typeof llamaTokenize;
}

export interface GatewayDeps {
  db: Db;
  spanWriter: SpanWriter;
  statusEmitter?: StatusEmitter;
  policyRules?: PolicyRules;
  fns?: Partial<ChatFns>;
}

export class PolicyDeniedError extends Error {}

const CHAT_MODEL_ROLES = new Set<ModelRole>(['router', 'general', 'coder', 'vision']);

export class ModelGateway {
  private readonly breakers = new Map<string, CircuitBreaker>();
  private readonly coldStarted = new Set<string>();
  private readonly fns: ChatFns;

  constructor(private readonly deps: GatewayDeps) {
    this.fns = {
      chat: llamaChat,
      chatStream: llamaChatStream,
      embed: llamaEmbed,
      rerank: llamaRerank,
      tokenize: llamaTokenize,
      ...deps.fns,
    };
  }

  private breakerFor(endpoint: string): CircuitBreaker {
    let b = this.breakers.get(endpoint);
    if (!b) {
      b = new CircuitBreaker();
      this.breakers.set(endpoint, b);
    }
    return b;
  }

  private async resolveEndpoint(
    role: ModelRole,
    modelId?: string,
  ): Promise<{ id: string; endpoint: string; role: ModelRole }> {
    const rows = await this.deps.db
      .select()
      .from(modelsTable)
      .where(modelId ? eq(modelsTable.id, modelId) : and(eq(modelsTable.role, role), eq(modelsTable.enabled, true)))
      .limit(1);
    const row = rows[0];
    if (!row || !row.enabled) {
      throw new Error(modelId ? `Model "${modelId}" is not available` : `No enabled model configured for role "${role}"`);
    }
    if (modelId && !CHAT_MODEL_ROLES.has(row.role as ModelRole)) {
      throw new Error(`Model "${modelId}" cannot be used for chat`);
    }
    if (!this.coldStarted.has(row.id)) {
      this.coldStarted.add(row.id);
      this.deps.statusEmitter?.emitStatus('cold_start', row.id);
    }
    return { id: row.id, endpoint: row.endpoint, role: row.role as ModelRole };
  }

  async chat(req: ChatRequest): Promise<{
    content: string;
    tokensIn: number;
    tokensOut: number;
    toolCalls: LlamaToolCall[];
  }> {
    const { id: modelId, endpoint, role: resolvedRole } = await this.resolveEndpoint(req.role, req.modelId);
    const decision = can(
      req.user,
      'model:invoke',
      { modelRole: resolvedRole },
      this.deps.policyRules ?? DEFAULT_POLICY_RULES,
    );
    if (!decision.allowed) {
      throw new PolicyDeniedError(decision.reason ?? 'denied');
    }
    const breaker = this.breakerFor(endpoint);
    if (!breaker.canAttempt()) {
      throw new Error(`Circuit open for model "${modelId}"`);
    }

    const started = Date.now();
    try {
      const result = await this.fns.chat({
        endpoint,
        messages: req.messages,
        tools: req.tools,
        jsonSchema: req.jsonSchema,
        maxTokens: req.budget?.maxTokens,
        signal: req.signal,
        onToken: req.onToken,
      });
      breaker.onSuccess();
      await this.deps.spanWriter.writeSpan({
        traceId: req.traceId,
        kind: 'llm',
        name: 'gateway.chat',
        model: modelId,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        latencyMs: Date.now() - started,
        status: 'ok',
      });
      return result;
    } catch (err) {
      breaker.onFailure();
      await this.deps.spanWriter.writeSpan({
        traceId: req.traceId,
        kind: 'llm',
        name: 'gateway.chat',
        model: modelId,
        latencyMs: Date.now() - started,
        status: 'error',
        attrs: { error: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
  }

  async *chatStream(req: ChatRequest): AsyncGenerator<string> {
    const { id: modelId, endpoint, role: resolvedRole } = await this.resolveEndpoint(req.role, req.modelId);
    const decision = can(
      req.user,
      'model:invoke',
      { modelRole: resolvedRole },
      this.deps.policyRules ?? DEFAULT_POLICY_RULES,
    );
    if (!decision.allowed) {
      throw new PolicyDeniedError(decision.reason ?? 'denied');
    }
    const breaker = this.breakerFor(endpoint);
    if (!breaker.canAttempt()) {
      throw new Error(`Circuit open for model "${modelId}"`);
    }

    const started = Date.now();
    let tokensOut = 0;
    try {
      for await (const delta of this.fns.chatStream({ endpoint, messages: req.messages, signal: req.signal })) {
        tokensOut += 1; // A1 approximation; real token counts come from /tokenize in A2+
        yield delta;
      }
      breaker.onSuccess();
      await this.deps.spanWriter.writeSpan({
        traceId: req.traceId,
        kind: 'llm',
        name: 'gateway.chatStream',
        model: modelId,
        tokensOut,
        latencyMs: Date.now() - started,
        status: 'ok',
      });
    } catch (err) {
      breaker.onFailure();
      await this.deps.spanWriter.writeSpan({
        traceId: req.traceId,
        kind: 'llm',
        name: 'gateway.chatStream',
        model: modelId,
        tokensOut,
        latencyMs: Date.now() - started,
        status: 'error',
        attrs: { error: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
  }

  async embed(req: EmbedRequest): Promise<number[][]> {
    const decision = can(
      req.user,
      'model:invoke',
      { modelRole: 'embed' },
      this.deps.policyRules ?? DEFAULT_POLICY_RULES,
    );
    if (!decision.allowed) {
      throw new PolicyDeniedError(decision.reason ?? 'denied');
    }
    const { id: modelId, endpoint } = await this.resolveEndpoint('embed');
    const started = Date.now();
    try {
      const result = await this.fns.embed(endpoint, req.texts);
      await this.deps.spanWriter.writeSpan({
        traceId: req.traceId,
        kind: 'llm',
        name: 'gateway.embed',
        model: modelId,
        latencyMs: Date.now() - started,
        status: 'ok',
      });
      return result;
    } catch (err) {
      await this.deps.spanWriter.writeSpan({
        traceId: req.traceId,
        kind: 'llm',
        name: 'gateway.embed',
        model: modelId,
        latencyMs: Date.now() - started,
        status: 'error',
        attrs: { error: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
  }

  /** True when an enabled model is registered for the role (e.g. rerank is optional). */
  async hasRole(role: ModelRole): Promise<boolean> {
    const rows = await this.deps.db.select({ enabled: modelsTable.enabled }).from(modelsTable).where(eq(modelsTable.role, role)).limit(1);
    return rows[0]?.enabled === true;
  }

  async rerank(req: RerankRequest): Promise<number[]> {
    const decision = can(
      req.user,
      'model:invoke',
      { modelRole: 'rerank' },
      this.deps.policyRules ?? DEFAULT_POLICY_RULES,
    );
    if (!decision.allowed) {
      throw new PolicyDeniedError(decision.reason ?? 'denied');
    }
    const { id: modelId, endpoint } = await this.resolveEndpoint('rerank');
    const started = Date.now();
    try {
      const scores = await this.fns.rerank(endpoint, req.query, req.documents);
      await this.deps.spanWriter.writeSpan({
        traceId: req.traceId,
        kind: 'llm',
        name: 'gateway.rerank',
        model: modelId,
        latencyMs: Date.now() - started,
        status: 'ok',
      });
      return scores;
    } catch (err) {
      await this.deps.spanWriter.writeSpan({
        traceId: req.traceId,
        kind: 'llm',
        name: 'gateway.rerank',
        model: modelId,
        latencyMs: Date.now() - started,
        status: 'error',
        attrs: { error: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
  }

  async tokenize(req: TokenizeRequest): Promise<number[]> {
    const { endpoint } = await this.resolveEndpoint(req.role);
    return this.fns.tokenize(endpoint, req.text);
  }
}
