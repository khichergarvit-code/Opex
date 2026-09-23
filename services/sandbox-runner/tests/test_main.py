import os
from unittest.mock import patch

from fastapi.testclient import TestClient

from sandbox_runner.docker_exec import RunResult
from sandbox_runner.main import app

os.environ["SANDBOX_SHARED_SECRET"] = "test-secret"
client = TestClient(app)


def test_health() -> None:
    res = client.get("/health")
    assert res.status_code == 200


def test_run_rejects_missing_secret() -> None:
    res = client.post("/run", json={"image_id": "python-3.12-datasci", "code": "print(1)"})
    assert res.status_code == 401


def test_run_rejects_wrong_secret() -> None:
    res = client.post(
        "/run",
        json={"image_id": "python-3.12-datasci", "code": "print(1)"},
        headers={"x-opex-sandbox-secret": "wrong"},
    )
    assert res.status_code == 401


def test_run_rejects_persist_true_without_project_id() -> None:
    res = client.post(
        "/run",
        json={"image_id": "python-3.12-datasci", "code": "print(1)", "persist": True},
        headers={"x-opex-sandbox-secret": "test-secret"},
    )
    assert res.status_code == 400


def test_run_accepts_persist_true_with_project_id() -> None:
    # B4: the approval gate already happened one layer up (executor.ts) —
    # this service trusts the caller once persist=true + project_id arrive.
    fake_result = RunResult(exit_code=0, stdout="", stderr="", stdout_truncated=False, stderr_truncated=False, files=[])
    with patch("sandbox_runner.main.run_in_sandbox", return_value=fake_result) as mock_run:
        res = client.post(
            "/run",
            json={
                "image_id": "python-3.12-datasci",
                "code": "print(1)",
                "persist": True,
                "project_id": "11111111-1111-1111-1111-111111111111",
            },
            headers={"x-opex-sandbox-secret": "test-secret"},
        )
    assert res.status_code == 200
    assert mock_run.call_args.kwargs["persist"] is True
    assert mock_run.call_args.kwargs["project_id"] == "11111111-1111-1111-1111-111111111111"


def test_run_rejects_unknown_image_id() -> None:
    res = client.post(
        "/run",
        json={"image_id": "not-a-real-image", "code": "print(1)"},
        headers={"x-opex-sandbox-secret": "test-secret"},
    )
    assert res.status_code == 400


def test_run_succeeds_with_valid_request() -> None:
    fake_result = RunResult(exit_code=0, stdout="hi\n", stderr="", stdout_truncated=False, stderr_truncated=False, files=[])
    with patch("sandbox_runner.main.run_in_sandbox", return_value=fake_result):
        res = client.post(
            "/run",
            json={"image_id": "python-3.12-datasci", "code": "print('hi')"},
            headers={"x-opex-sandbox-secret": "test-secret"},
        )
    assert res.status_code == 200
    body = res.json()
    assert body["exit_code"] == 0
    assert body["stdout"] == "hi\n"
