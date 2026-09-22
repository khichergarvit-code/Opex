"""The only Docker-socket touchpoint in the system (invariant #8). Builds
the exact container flags from tools.md — never accepts raw Docker args
from a caller, only a resolved image tag, a code/command, input files, and
a timeout.

File I/O design note: Docker's `put_archive`/`get_archive` refuse to
operate at all when a container's rootfs is `--read-only` — even when the
target path is a writable `tmpfs` mount (confirmed empirically: dockerd
checks the container-level ReadonlyRootfs flag before it looks at the
target mount type, so this isn't tmpfs-specific, it's a blanket refusal).
Since `--read-only` is one of tools.md's required hardening flags, we never
use put_archive/get_archive at all — instead a small bootstrap script runs
as the container's actual command, writes input files into /work itself
(that's just the process writing to its own tmpfs mount, which IS allowed),
runs the caller's code/command as a subprocess with output captured, walks
/work for new files afterward, and prints one JSON blob to its own stdout.
The host side reads that single JSON blob from `container.logs()` — no
archive API calls anywhere in this file.
"""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass, field

import docker

MAX_OUTPUT_BYTES = 64 * 1024

_BOOTSTRAP_SCRIPT = r"""
import base64, json, os, subprocess, sys

payload = json.loads(base64.b64decode(sys.argv[1]))
input_files = payload["input_files"]
code = payload.get("code")
command = payload.get("command")
timeout_s = payload["timeout_s"]

timed_out = False
try:
    for f in input_files:
        path = os.path.join("/work", f["path"])
        os.makedirs(os.path.dirname(path) or "/work", exist_ok=True)
        with open(path, "wb") as fh:
            fh.write(base64.b64decode(f["content_base64"]))

    # HOME/MPLCONFIGDIR: the rootfs is read-only outside /work, so any
    # library that wants a writable home/cache dir (matplotlib's font
    # cache, notably) needs to be pointed at /work instead of the default
    # (unwritable) /home/<user>.
    child_env = dict(os.environ)
    child_env["HOME"] = "/work"
    child_env["MPLCONFIGDIR"] = "/work/.config/matplotlib"

    if code is not None:
        proc = subprocess.run(
            ["python3", "-c", code], cwd="/work", capture_output=True, timeout=timeout_s, env=child_env
        )
    else:
        proc = subprocess.run(command, cwd="/work", capture_output=True, timeout=timeout_s, env=child_env)
    exit_code = proc.returncode
    stdout = proc.stdout.decode("utf-8", errors="replace")
    stderr = proc.stderr.decode("utf-8", errors="replace")
except subprocess.TimeoutExpired as e:
    timed_out = True
    exit_code = -1
    stdout = (e.stdout or b"").decode("utf-8", errors="replace") if isinstance(e.stdout, (bytes, bytearray)) else ""
    stderr = "timed out after {}s".format(timeout_s)
except Exception as e:
    exit_code = -1
    stdout = ""
    stderr = "bootstrap error: {}".format(e)

input_paths = {f["path"] for f in input_files}
output_files = []
for root, _dirs, files in os.walk("/work"):
    for name in files:
        full = os.path.join(root, name)
        rel = os.path.relpath(full, "/work")
        if rel in input_paths or any(part.startswith(".") for part in rel.split(os.sep)):
            continue
        try:
            with open(full, "rb") as fh:
                content = fh.read()
        except OSError:
            continue
        output_files.append({"path": rel, "content_base64": base64.b64encode(content).decode("ascii")})

print(json.dumps({
    "exit_code": exit_code,
    "stdout": stdout,
    "stderr": stderr,
    "timed_out": timed_out,
    "files": output_files,
}))
"""


@dataclass
class FileInput:
    path: str
    content_base64: str


@dataclass
class FileOutput:
    path: str
    content_base64: str


@dataclass
class RunResult:
    exit_code: int
    stdout: str
    stderr: str
    stdout_truncated: bool
    stderr_truncated: bool
    files: list[FileOutput] = field(default_factory=list)
    timed_out: bool = False


def _truncate_text(text: str, limit: int) -> tuple[str, bool]:
    data = text.encode("utf-8", errors="replace")
    truncated = len(data) > limit
    return data[:limit].decode("utf-8", errors="replace"), truncated


def run_in_sandbox(
    image: str,
    code: str | None,
    command: list[str] | None,
    files: list[FileInput],
    timeout_s: int,
) -> RunResult:
    if code is None and command is None:
        raise ValueError("either code or command must be provided")

    client = docker.from_env()

    payload = {
        "input_files": [{"path": f.path, "content_base64": f.content_base64} for f in files],
        "code": code,
        "command": command,
        "timeout_s": timeout_s,
    }
    payload_b64 = base64.b64encode(json.dumps(payload).encode()).decode("ascii")

    container = client.containers.create(
        image=image,
        command=["python3", "-c", _BOOTSTRAP_SCRIPT, payload_b64],
        network_mode="none",
        read_only=True,
        # mode=1777: Docker's tmpfs mount otherwise defaults to root
        # ownership, which the non-root --user 10001 process can't write
        # into (confirmed empirically) — 1777 matches /tmp's usual mode.
        tmpfs={"/work": "size=256m,mode=1777"},
        mem_limit="1g",
        nano_cpus=1_000_000_000,
        pids_limit=128,
        cap_drop=["ALL"],
        security_opt=["no-new-privileges"],
        user="10001",
        working_dir="/work",
    )
    try:
        container.start()
        # Generous outer bound — the bootstrap enforces the real timeout_s
        # internally via subprocess.run(timeout=...); this just guards
        # against the bootstrap itself (not the user code) hanging.
        outer_timeout = timeout_s + 10
        try:
            container.wait(timeout=outer_timeout)
        except Exception:
            container.kill()
            return RunResult(
                exit_code=-1,
                stdout="",
                stderr="sandbox container did not respond within the outer timeout",
                stdout_truncated=False,
                stderr_truncated=False,
                timed_out=True,
            )

        raw_logs = container.logs(stdout=True, stderr=False).decode("utf-8", errors="replace")
        try:
            result = json.loads(raw_logs.strip().splitlines()[-1]) if raw_logs.strip() else {}
        except (json.JSONDecodeError, IndexError):
            result = {}

        stdout, stdout_trunc = _truncate_text(result.get("stdout", ""), MAX_OUTPUT_BYTES)
        stderr_text = result.get("stderr", "")
        if not result:
            stderr_text = f"bootstrap produced no parseable output; raw logs: {raw_logs[:500]}"
        stderr, stderr_trunc = _truncate_text(stderr_text, MAX_OUTPUT_BYTES)

        return RunResult(
            exit_code=result.get("exit_code", -1),
            stdout=stdout,
            stderr=stderr,
            stdout_truncated=stdout_trunc,
            stderr_truncated=stderr_trunc,
            files=[FileOutput(**f) for f in result.get("files", [])],
            timed_out=result.get("timed_out", False),
        )
    finally:
        container.remove(force=True)
