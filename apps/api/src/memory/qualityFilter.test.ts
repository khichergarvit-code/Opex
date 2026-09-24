import { describe, expect, it } from 'vitest';
import { isExplicitRemember, isRefusalOrError, isWorthKeeping, looksLikeSelfStatement } from './qualityFilter.js';

describe('isWorthKeeping', () => {
  it('keeps a short statement about the user', () => {
    expect(isWorthKeeping('The user works as a DevOps engineer.')).toBe(true);
  });
  it.each(['Paris', 'ok thanks', "I couldn't find any documents in this project that support an answer", 'Who is the president?', '⚠️ The answer model isn\'t reachable'])(
    'rejects %s',
    (t) => expect(isWorthKeeping(t)).toBe(false),
  );
});

describe('isRefusalOrError', () => {
  it('spots the refusal and error texts that must never become memories', () => {
    expect(isRefusalOrError('I only answer from retrieved document content, not general knowledge')).toBe(true);
    expect(isRefusalOrError('The user likes tea.')).toBe(false);
  });
});

describe('looksLikeSelfStatement', () => {
  it.each(['i am working as a devops engineer', 'My name is Hardik', 'call me Hardik', 'remember that our cluster is atlas', 'actually I moved to data science'])(
    'matches %s',
    (m) => expect(looksLikeSelfStatement(m)).toBe(true),
  );
  it.each(['who is pm of india', 'what is 13 factorial', 'explain the tower of hanoi'])('ignores %s', (m) => expect(looksLikeSelfStatement(m)).toBe(false));
});

describe('isExplicitRemember', () => {
  it('detects an instruction to remember', () => {
    expect(isExplicitRemember('Please remember that I use vim')).toBe(true);
    expect(isExplicitRemember('I remember that day')).toBe(false);
  });
});
