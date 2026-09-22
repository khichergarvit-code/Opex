import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractAnswerText } from './apiClient.js';

test('extractAnswerText concatenates token deltas from a raw SSE response', () => {
  const sse = [
    'event: token',
    'data: {"delta":"Hello"}',
    '',
    'event: token',
    'data: {"delta":" world"}',
    '',
    'event: done',
    'data: {"messageId":"m1","traceId":"t1"}',
    '',
  ].join('\n');
  assert.equal(extractAnswerText(sse), 'Hello world');
});

test('extractAnswerText ignores non-token events', () => {
  const sse = ['event: status', 'data: {"state":"cold_start","model":"llm-main"}', '', 'event: token', 'data: {"delta":"hi"}', ''].join('\n');
  assert.equal(extractAnswerText(sse), 'hi');
});

test('extractAnswerText returns empty string when there are no token events', () => {
  assert.equal(extractAnswerText('event: error\ndata: {"message":"boom"}\n'), '');
});
