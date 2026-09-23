import json
from unittest.mock import MagicMock, patch

import pytest

from sandbox_runner import docker_exec
from sandbox_runner.docker_exec import FileInput, InvalidProjectIdError, run_in_sandbox


def _fake_client(container: MagicMock, runtimes: dict | None = None) -> MagicMock:
    client = MagicMock()
    client.containers.create.return_value = container
    # Matches this dev machine's real `docker info` (only runc registered)
    # unless a test explicitly wants to simulate runsc being available.
    client.info.return_value = {"Runtimes": runtimes if runtimes is not None else {"runc": {}}}
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
    # This dev machine only registers runc — never hard-requires gVisor.
    assert "runtime" not in kwargs


def test_uses_runsc_when_the_docker_daemon_reports_it_available() -> None:
    container = MagicMock()
    container.wait.return_value = {"StatusCode": 0}
    container.logs.return_value = _logs_json(
        {"exit_code": 0, "stdout": "", "stderr": "", "timed_out": False, "files": []}
    )
    client = _fake_client(container, runtimes={"runc": {}, "runsc": {"path": "/usr/bin/runsc"}})

    with patch("docker.from_env", return_value=client):
        run_in_sandbox(image="img", code="pass", command=None, files=[], timeout_s=10)

    assert client.containers.create.call_args.kwargs["runtime"] == "runsc"


def test_resolve_runtime_degrades_gracefully_when_info_call_fails() -> None:
    client = MagicMock()
    client.info.side_effect = Exception("daemon unreachable")
    assert docker_exec._resolve_runtime(client) is None


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


def test_persist_mounts_the_projects_own_directory(tmp_path, monkeypatch) -> None:
    # This container's own view and the host's view happen to coincide
    # here (both point at tmp_path) — the real, differing case is covered
    # by test_persist_uses_the_host_path_not_the_containers_own_view below.
    monkeypatch.setattr(docker_exec, "PERSIST_BASE_DIR", str(tmp_path))
    monkeypatch.setattr(docker_exec, "PERSIST_HOST_BASE_DIR", str(tmp_path))
    container = MagicMock()
    container.wait.return_value = {"StatusCode": 0}
    container.logs.return_value = _logs_json(
        {"exit_code": 0, "stdout": "", "stderr": "", "timed_out": False, "files": []}
    )
    client = _fake_client(container)
    project_id = "11111111-1111-1111-1111-111111111111"

    with patch("docker.from_env", return_value=client):
        run_in_sandbox(
            image="img", code="pass", command=None, files=[], timeout_s=10, persist=True, project_id=project_id
        )

    volumes = client.containers.create.call_args.kwargs["volumes"]
    expected_host_path = str(tmp_path / project_id)
    assert volumes == {expected_host_path: {"bind": "/persist", "mode": "rw"}}
    assert (tmp_path / project_id).is_dir()


def test_persist_uses_the_host_path_not_the_containers_own_view(tmp_path, monkeypatch) -> None:
    # Docker-outside-of-Docker: the bind-mount source docker-py sends must
    # be the path as the *host* daemon sees it, not sandbox-runner's own
    # container-internal view — even when the directory needs creating
    # via that container-internal view first.
    monkeypatch.setattr(docker_exec, "PERSIST_BASE_DIR", str(tmp_path))
    monkeypatch.setattr(docker_exec, "PERSIST_HOST_BASE_DIR", "/Users/dev/opex/data/projects")
    container = MagicMock()
    container.wait.return_value = {"StatusCode": 0}
    container.logs.return_value = _logs_json(
        {"exit_code": 0, "stdout": "", "stderr": "", "timed_out": False, "files": []}
    )
    client = _fake_client(container)
    project_id = "11111111-1111-1111-1111-111111111111"

    with patch("docker.from_env", return_value=client):
        run_in_sandbox(
            image="img", code="pass", command=None, files=[], timeout_s=10, persist=True, project_id=project_id
        )

    volumes = client.containers.create.call_args.kwargs["volumes"]
    assert volumes == {f"/Users/dev/opex/data/projects/{project_id}": {"bind": "/persist", "mode": "rw"}}
    # Still created for real, via this container's own (different) view.
    assert (tmp_path / project_id).is_dir()


def test_persist_rejects_a_non_uuid_project_id(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(docker_exec, "PERSIST_BASE_DIR", str(tmp_path))
    with pytest.raises(InvalidProjectIdError):
        run_in_sandbox(
            image="img", code="pass", command=None, files=[], timeout_s=10, persist=True, project_id="../../etc"
        )


def test_persist_requires_a_project_id() -> None:
    with pytest.raises(ValueError):
        run_in_sandbox(image="img", code="pass", command=None, files=[], timeout_s=10, persist=True, project_id=None)


def test_no_persist_means_no_extra_volumes() -> None:
    container = MagicMock()
    container.wait.return_value = {"StatusCode": 0}
    container.logs.return_value = _logs_json(
        {"exit_code": 0, "stdout": "", "stderr": "", "timed_out": False, "files": []}
    )
    client = _fake_client(container)

    with patch("docker.from_env", return_value=client):
        run_in_sandbox(image="img", code="pass", command=None, files=[], timeout_s=10)

    assert client.containers.create.call_args.kwargs["volumes"] == {}
