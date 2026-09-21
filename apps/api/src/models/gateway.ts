import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { models as modelsTable } from '../db/schema/index.js';
import { can } from '../policy/can.js';
import type { PolicyRules } from '../policy/rules.js';
import { DEFAULT_POLICY_RULES } from '../policy/rules.js';
import { CircuitBreaker } from './circuitBreaker.js';
import { llamaChat, llamaChatStream, llamaEmbed, llamaTokenize } from './llamaClient.js';
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

export class ModelGateway {
  private readonly breakers = new Map<string, CircuitBreaker>();
  private readonly coldStarted = new Set<string>();
  private readonly fns: ChatFns;

  constructor(private readonly deps: GatewayDeps) {
    this.fns = {
      chat: llamaChat,
      chatStream: llamaChatStream,
      embed: llamaEmbed,
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

  private async resolveEndpoint(role: ModelRole): Promise<{ id: string; endpoint: string }> {
    const rows = await this.deps.db
      .select()
      .from(modelsTable)
      .where(eq(modelsTable.role, role))
      .limit(1);
    const row = rows[0];
    if (!row || !row.enabled) {
      throw new Error(`No enabled model configured for role "${role}"`);
    }
    if (!this.coldStarted.has(row.id)) {
      this.coldStarted.add(row.id);
      this.deps.statusEmitter?.emitStatus('cold_start', row.id);
    }
    return { id: row.id, endpoint: row.endpoint };
  }

  async chat(req: ChatRequest): Promise<{ content: string; tokensIn: number; tokensOut: number }> {
    const decision = can(
      req.user,
      'model:invoke',
      { modelRole: req.role },
      this.deps.policyRules ?? DEFAULT_POLICY_RULES,
    );
    if (!decision.allowed) {
      throw new PolicyDeniedError(decision.reason ?? 'denied');
    }

    const { id: modelId, endpoint } = await this.resolveEndpoint(req.role);
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
    const decision = can(
      req.user,
      'model:invoke',
      { modelRole: req.role },
      this.deps.policyRules ?? DEFAULT_POLICY_RULES,
    );
    if (!decision.allowed) {
      throw new PolicyDeniedError(decision.reason ?? 'denied');
    }

    const { id: modelId, endpoint } = await this.resolveEndpoint(req.role);
    const breaker = this.breakerFor(endpoint);
    if (!breaker.canAttempt()) {
      throw new Error(`Circuit open for model "${modelId}"`);
    }

    const started = Date.now();
    let tokensOut = 0;
    try {
      for await (const delta of this.fns.chatStream({ endpoint, messages: req.messages })) {
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

  /** Reranking is not exercised until A2 retrieval exists; stubbed for interface completeness. */
  async rerank(_req: RerankRequest): Promise<number[]> {
    throw new Error('rerank is not implemented until A2 (retrieval)');
  }

  async tokenize(req: TokenizeRequest): Promise<number[]> {
    const { endpoint } = await this.resolveEndpoint(req.role);
    return this.fns.tokenize(endpoint, req.text);
  }
}
