import type { ChatMessage } from '../models/types.js';
import type { ModelGateway } from '../models/gateway.js';
import type { AuthedUser } from '../policy/types.js';
import { verifyGroundedness, type CitedChunk } from './groundedness.js';

export interface AnswerWithVerificationResult {
  answer: string;
  confidence: 'high' | 'low';
  revisions: number;
}

// Initial attempt + up to 2 revisions, confirmed with the user as the
// accepted latency cost on this CPU-only dev machine (each attempt is a
// full non-streaming completion plus a groundedness-check completion).
const MAX_ATTEMPTS = 3;

/**
 * B3b's revise-with-feedback loop, kept beside docQa.ts rather than
 * folded into executor.ts's tool-call loop — this is a plain
 * generate-then-check cycle over a single completion, not tool calls.
 * Non-streaming throughout: groundedness checking needs the complete
 * answer before it can run.
 */
export async function answerWithVerification(
  deps: { gateway: ModelGateway; user: AuthedUser; traceId: string },
  systemPrompt: string,
  messages: ChatMessage[],
  citedChunks: CitedChunk[],
  validMarkers: Set<number>,
): Promise<AnswerWithVerificationResult> {
  let currentMessages = messages;
  let lastAnswer = '';

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const result = await deps.gateway.chat({
      role: 'general',
      messages: [{ role: 'system', content: systemPrompt }, ...currentMessages],
      user: deps.user,
      traceId: deps.traceId,
    });
    lastAnswer = result.content;

    const groundedness = await verifyGroundedness(deps, lastAnswer, citedChunks, validMarkers);
    if (groundedness.ok) {
      return { answer: lastAnswer, confidence: 'high', revisions: attempt };
    }
    if (attempt < MAX_ATTEMPTS - 1) {
      currentMessages = [
        ...currentMessages,
        { role: 'assistant', content: lastAnswer },
        {
          role: 'user',
          content:
            `These claims from your answer aren't supported by the retrieved chunks: ` +
            `${groundedness.unsupportedSentences.map((s) => `"${s}"`).join(' ')} ` +
            'Revise your answer to only state what the retrieved_chunk blocks actually support, with correct [n] citations.',
        },
      ];
    }
  }

  return { answer: lastAnswer, confidence: 'low', revisions: MAX_ATTEMPTS - 1 };
}
