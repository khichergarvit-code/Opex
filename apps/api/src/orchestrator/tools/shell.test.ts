import { describe, expect, it } from 'vitest';
import { checkShellCommand } from './shell.js';

describe('checkShellCommand', () => {
  it.each(['wc -l notes.txt', "grep -c error app.log | sort | uniq -c", "python3 -c 'print(2+2)'", "awk -F, '{s+=$2} END {print s}' data.csv"])('allows %s', (c) => {
    expect(checkShellCommand(c)).toBeNull();
  });
  it.each(['rm -rf /', 'rm -rf ~', 'rm -fr *', ':(){ :|:& };:', 'mkfs.ext4 /dev/sda', 'dd if=/dev/zero of=/dev/sda', 'shutdown now', 'cat ../../etc/passwd'])('refuses %s', (c) => {
    expect(checkShellCommand(c)).not.toBeNull();
  });
  it('refuses empty and oversized commands', () => {
    expect(checkShellCommand('  ')).toMatch(/empty/);
    expect(checkShellCommand('x'.repeat(2001))).toMatch(/too long/);
  });
});
