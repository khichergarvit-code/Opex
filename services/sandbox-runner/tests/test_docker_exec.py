import json
from unittest.mock import MagicMock, patch

from sandbox_runner.docker_exec import FileInput, run_in_sandbox


def _fake_client(container: MagicMock) -> MagicMock:
    client = MagicMock()
    client.containers.create.return_value = container
    return client


def _logs_json(payload: dict) -> bytes:
    return (json.dumps(payload) + "\n").encode()


def test_container_is_created_with_the_exact_hardening_flags() -> None:
    container = MagicMock()
    container.wait.return_value = {"StatusCode": 0}
    container.logs.return_value = _logs_json(
        {"exit_code": 0, "stdout": "hi\n", "stderr": "", "timed_out": False, "files": []}
    )
    client = _fake_client(container)

    with patch("docker.from_env", return_value=client):
        result = run_in_sandbox(
            image="opex/sandbox-python:latest",
            code="print('hi')",
            command=None,
            files=[],
            timeout_s=10,
        )

    assert result.exit_code == 0
    assert result.stdout == "hi\n"
    kwargs = client.containers.create.call_args.kwargs
    assert kwargs["network_mode"] == "none"
    assert kwargs["read_only"] is True
    assert kwargs["tmpfs"] == {"/work": "size=256m,mode=1777"}
    assert kwargs["mem_limit"] == "1g"
    assert kwargs["nano_cpus"] == 1_000_000_000
    assert kwargs["pids_limit"] == 128
    assert kwargs["cap_drop"] == ["ALL"]
    assert kwargs["security_opt"] == ["no-new-privileges"]
    assert kwargs["user"] == "10001"
    assert kwargs["image"] == "opex/sandbox-python:latest"
    assert container.remove.called


def test_raises_when_neither_code_nor_command_given() -> None:
    try:
        run_in_sandbox(image="x", code=None, command=None, files=[], timeout_s=10)
        raise AssertionError("expected ValueError")
    except ValueError:
        pass


def test_truncates_long_stdout() -> None:
    container = MagicMock()
    container.wait.return_value = {"StatusCode": 0}
    big = "x" * (70 * 1024)
    container.logs.return_value = _logs_json(
        {"exit_code": 0, "stdout": big, "stderr": "", "timed_out": False, "files": []}
    )

    with patch("docker.from_env", return_value=_fake_client(container)):
        result = run_in_sandbox(image="img", code="pass", command=None, files=[], timeout_s=10)

    assert result.stdout_truncated is True
    assert len(result.stdout.encode("utf-8")) <= 64 * 1024


def test_passes_input_files_via_the_bootstrap_payload_not_put_archive() -> None:
    container = MagicMock()
    container.wait.return_value = {"StatusCode": 0}
    container.logs.return_value = _logs_json(
        {"exit_code": 0, "stdout": "", "stderr": "", "timed_out": False, "files": []}
    )
    client = _fake_client(container)

    with patch("docker.from_env", return_value=client):
        run_in_sandbox(
            image="img",
            code="pass",
            command=None,
            files=[FileInput(path="data.csv", content_base64="aGVsbG8=")],
            timeout_s=10,
        )

    # No archive API calls — file I/O goes through the bootstrap's own argv payload.
    assert not container.put_archive.called
    assert not container.get_archive.called
    command = client.containers.create.call_args.kwargs["command"]
    assert command[0] == "python3"
    assert command[1] == "-c"


def test_reports_output_files_from_the_bootstrap_json() -> None:
    container = MagicMock()
    container.wait.return_value = {"StatusCode": 0}
    container.logs.return_value = _logs_json(
        {
            "exit_code": 0,
            "stdout": "",
            "stderr": "",
            "timed_out": False,
            "files": [{"path": "chart.png", "content_base64": "aGVsbG8="}],
        }
    )

    with patch("docker.from_env", return_value=_fake_client(container)):
        result = run_in_sandbox(image="img", code="pass", command=None, files=[], timeout_s=10)

    assert len(result.files) == 1
    assert result.files[0].path == "chart.png"


def test_kills_the_container_when_the_outer_wait_times_out() -> None:
    container = MagicMock()
    container.wait.side_effect = TimeoutError("timed out")

    with patch("docker.from_env", return_value=_fake_client(container)):
        result = run_in_sandbox(image="img", code="while True: pass", command=None, files=[], timeout_s=1)

    assert result.timed_out is True
    assert container.kill.called


def test_malformed_bootstrap_output_is_reported_not_raised() -> None:
    container = MagicMock()
    container.wait.return_value = {"StatusCode": 1}
    container.logs.return_value = b"not json at all"

    with patch("docker.from_env", return_value=_fake_client(container)):
        result = run_in_sandbox(image="img", code="pass", command=None, files=[], timeout_s=10)

    assert result.exit_code == -1
    assert "raw logs" in result.stderr
