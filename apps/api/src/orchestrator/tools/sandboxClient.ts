export interface SandboxFileInput {
  path: string;
  contentBase64: string;
}
export interface SandboxFileOutput {
  path: string;
  contentBase64: string;
}
export interface SandboxRunRequest {
  imageId: string;
  code?: string;
  command?: string[];
  files?: SandboxFileInput[];
  timeoutS?: number;
  /** B4: mounts the project's persisted data volume at /persist — only ever reached via executor.ts's approval gate. */
  persist?: boolean;
  /** Required when persist is true — the caller-known project this run belongs to. */
  projectId?: string;
}
export interface SandboxRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  timedOut: boolean;
  files: SandboxFileOutput[];
}

/**
 * Calls sandbox-runner's POST /run. B4: persist=true is now a real,
 * approval-gated feature — the gate already happened one layer up in
 * executor.ts (needsApproval pauses any persist=true call), so
 * sandbox-runner trusts the already-authenticated caller once the flag
 * reaches it, per tools.md's approvals flow.
 */
export async function callSandbox(
  baseUrl: string,
  sharedSecret: string,
  req: SandboxRunRequest,
): Promise<SandboxRunResult> {
  const res = await fetch(`${baseUrl}/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-opex-sandbox-secret': sharedSecret },
    body: JSON.stringify({
      image_id: req.imageId,
      code: req.code,
      command: req.command,
      files: (req.files ?? []).map((f) => ({ path: f.path, content_base64: f.contentBase64 })),
      timeout_s: req.timeoutS ?? 15,
      persist: req.persist ?? false,
      project_id: req.projectId,
    }),
  });
  if (!res.ok) {
    throw new Error(`sandbox-runner /run ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    exit_code: number;
    stdout: string;
    stderr: string;
    stdout_truncated: boolean;
    stderr_truncated: boolean;
    timed_out: boolean;
    files: Array<{ path: string; content_base64: string }>;
  };
  return {
    exitCode: json.exit_code,
    stdout: json.stdout,
    stderr: json.stderr,
    stdoutTruncated: json.stdout_truncated,
    stderrTruncated: json.stderr_truncated,
    timedOut: json.timed_out,
    files: json.files.map((f) => ({ path: f.path, contentBase64: f.content_base64 })),
  };
}
