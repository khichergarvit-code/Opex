import { describe, expect, it } from 'vitest';
import { isWriteCodeOnlyRequest } from './codeIntent.js';

describe('isWriteCodeOnlyRequest', () => {
  it('is true for a plain write-me-code request', () => {
    expect(isWriteCodeOnlyRequest('write a python code for hello world')).toBe(true);
    expect(isWriteCodeOnlyRequest('write code for printing 2 numbers in python')).toBe(true);
    expect(isWriteCodeOnlyRequest('give me some code that sorts a list')).toBe(true);
    expect(isWriteCodeOnlyRequest('create code to reverse a string')).toBe(true);
  });

  it('recognises "program"/"script"/"function"/"snippet" as synonyms for code', () => {
    expect(isWriteCodeOnlyRequest('write program to print 1 to 100 in python')).toBe(true);
    expect(isWriteCodeOnlyRequest('write a script that prints hello world')).toBe(true);
    expect(isWriteCodeOnlyRequest('give me a function to add two numbers')).toBe(true);
  });

  it('does not treat "print" in the code description itself as a run request', () => {
    expect(isWriteCodeOnlyRequest('write code that prints the sum of 5 and 3')).toBe(true);
  });

  it('is false when the person also asks to run/execute/test it', () => {
    expect(isWriteCodeOnlyRequest('write code and run it')).toBe(false);
    expect(isWriteCodeOnlyRequest('write python code and show me the output')).toBe(false);
    expect(isWriteCodeOnlyRequest('write code to test this and print the result')).toBe(false);
  });

  it('is false for a computed-answer question, not a code request', () => {
    expect(isWriteCodeOnlyRequest('what is 47 times 89')).toBe(false);
    expect(isWriteCodeOnlyRequest('run this snippet for me')).toBe(false);
  });
});
