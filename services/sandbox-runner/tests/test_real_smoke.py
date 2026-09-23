"""Real containment smoke test — actually spins up a container via Docker,
no mocks. Gated behind RUN_SANDBOX_SMOKE_TEST=1 (needs a real Docker socket
and the opex/sandbox-python:latest image built), same gating pattern as
A1's RUN_LLM_SMOKE_TEST."""

import base64
import os

import pytest

from sandbox_runner.docker_exec import FileInput, run_in_sandbox

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_SANDBOX_SMOKE_TEST") != "1",
    reason="set RUN_SANDBOX_SMOKE_TEST=1 to run (needs real Docker + opex/sandbox-python:latest built)",
)

IMAGE = "opex/sandbox-python:latest"


def test_runs_real_python_code_and_captures_stdout() -> None:
    result = run_in_sandbox(image=IMAGE, code="print(2 + 2)", command=None, files=[], timeout_s=15)
    assert result.exit_code == 0
    assert result.stdout.strip() == "4"


def test_network_is_actually_blocked() -> None:
    code = (
        "import socket\n"
        "s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)\n"
        "s.settimeout(3)\n"
        "try:\n"
        "    s.connect(('1.1.1.1', 443))\n"
        "    print('REACHED')\n"
        "except OSError as e:\n"
        "    print('BLOCKED', type(e).__name__)\n"
    )
    result = run_in_sandbox(image=IMAGE, code=code, command=None, files=[], timeout_s=15)
    assert "REACHED" not in result.stdout
    assert "BLOCKED" in result.stdout


def test_reading_a_host_path_outside_work_fails() -> None:
    code = "open('/etc/shadow').read()"
    result = run_in_sandbox(image=IMAGE, code=code, command=None, files=[], timeout_s=15)
    assert result.exit_code != 0


def test_writing_outside_work_fails_due_to_read_only_root() -> None:
    code = "open('/etc/pwned', 'w').write('x')"
    result = run_in_sandbox(image=IMAGE, code=code, command=None, files=[], timeout_s=15)
    assert result.exit_code != 0


def test_input_file_is_available_and_output_file_is_captured() -> None:
    csv_content = b"a,b\n1,2\n"
    code = (
        "with open('/work/in.csv') as f: data = f.read()\n"
        "with open('/work/out.txt', 'w') as f: f.write('processed:' + data)\n"
    )
    result = run_in_sandbox(
        image=IMAGE,
        code=code,
        command=None,
        files=[FileInput(path="in.csv", content_base64=base64.b64encode(csv_content).decode())],
        timeout_s=15,
    )
    assert result.exit_code == 0
    out_files = {f.path: f.content_base64 for f in result.files}
    assert "out.txt" in out_files
    assert base64.b64decode(out_files["out.txt"]).startswith(b"processed:a,b")


def test_make_chart_style_matplotlib_run_produces_a_png_artifact() -> None:
    code = (
        "import matplotlib\n"
        "matplotlib.use('Agg')\n"
        "import matplotlib.pyplot as plt\n"
        "plt.bar(['a', 'b', 'c'], [3, 1, 2])\n"
        "plt.savefig('/work/chart.png')\n"
    )
    result = run_in_sandbox(image=IMAGE, code=code, command=None, files=[], timeout_s=20)
    assert result.exit_code == 0, result.stderr
    out_files = {f.path: f.content_base64 for f in result.files}
    assert "chart.png" in out_files
    png_bytes = base64.b64decode(out_files["chart.png"])
    assert png_bytes[:8] == b"\x89PNG\r\n\x1a\n"


def test_fork_bomb_is_contained_by_pids_limit() -> None:
    code = "import os\nfor _ in range(10000):\n    os.fork()\n"
    result = run_in_sandbox(image=IMAGE, code=code, command=None, files=[], timeout_s=10)
    # pids_limit=128 should make fork() start failing with EAGAIN/BlockingIOError
    # well before the sandbox or host is meaningfully impacted.
    assert result.exit_code != 0


def test_memory_bomb_is_contained_by_mem_limit() -> None:
    # A real allocation well past mem_limit=1g, not a mocked OOM — the
    # kernel's cgroup OOM killer should terminate the process before it
    # can grow unbounded.
    code = "x = bytearray(4 * 1024 * 1024 * 1024)\nprint('REACHED', len(x))\n"
    result = run_in_sandbox(image=IMAGE, code=code, command=None, files=[], timeout_s=15)
    assert result.exit_code != 0
    assert "REACHED" not in result.stdout


def test_real_infinite_loop_is_stopped_by_the_real_timeout() -> None:
    # A genuine `while True: pass`, not the mocked-TimeoutError version —
    # the bootstrap's own subprocess.run(timeout=timeout_s) must actually
    # kill it, not just report a timeout that never really happened.
    code = "while True:\n    pass\n"
    result = run_in_sandbox(image=IMAGE, code=code, command=None, files=[], timeout_s=3)
    assert result.timed_out is True
    assert result.exit_code != 0


def test_symlink_input_file_path_cannot_escape_work() -> None:
    # A ".." component in an input file's path must never let the write
    # land outside /work, even though read_only=True would also catch a
    # write to most such destinations — this is the bootstrap's own
    # os.path.realpath containment check, checked directly.
    result = run_in_sandbox(
        image=IMAGE,
        code="print('should not run')",
        command=None,
        files=[FileInput(path="../../etc/escaped.txt", content_base64=base64.b64encode(b"pwned").decode())],
        timeout_s=15,
    )
    assert result.exit_code != 0
    assert "escapes /work" in result.stderr
