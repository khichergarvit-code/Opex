"""sandbox-runner — the only service that touches the Docker socket
(invariant #8). Input comes from api over `core`, authenticated with a
shared secret (see tools.md's §sandbox-runner). The request shape is fixed
`{image_id, code|command, files[], timeout_s, persist}` — raw Docker args
are never accepted."""

from __future__ import annotations

from typing import Literal

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field

from .allowlist import UnknownImageError, resolve_image
from .auth import require_shared_secret
from .docker_exec import FileInput, FileOutput, run_in_sandbox

app = FastAPI(title="opex-sandbox-runner")


class FileInputModel(BaseModel):
    path: str
    content_base64: str


class FileOutputModel(BaseModel):
    path: str
    content_base64: str


class RunRequest(BaseModel):
    image_id: str
    code: str | None = None
    command: list[str] | None = None
    files: list[FileInputModel] = Field(default_factory=list)
    timeout_s: int = Field(default=15, ge=1, le=120)
    persist: bool = False


class RunResponse(BaseModel):
    exit_code: int
    stdout: str
    stderr: str
    stdout_truncated: bool
    stderr_truncated: bool
    timed_out: bool
    files: list[FileOutputModel]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/run", response_model=RunResponse, dependencies=[Depends(require_shared_secret)])
def run(req: RunRequest) -> RunResponse:
    # persist=true needs B4's approval flow, which doesn't exist yet — hard
    # deny rather than silently no-op-allow (see the plan's Open Question #11).
    if req.persist:
        raise HTTPException(
            status_code=403,
            detail="persist=true requires the B4 approval flow, which is not implemented yet",
        )
    if req.code is None and req.command is None:
        raise HTTPException(status_code=400, detail="either code or command must be provided")

    try:
        image = resolve_image(req.image_id)
    except UnknownImageError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    result = run_in_sandbox(
        image=image,
        code=req.code,
        command=req.command,
        files=[FileInput(path=f.path, content_base64=f.content_base64) for f in req.files],
        timeout_s=req.timeout_s,
    )
    return RunResponse(
        exit_code=result.exit_code,
        stdout=result.stdout,
        stderr=result.stderr,
        stdout_truncated=result.stdout_truncated,
        stderr_truncated=result.stderr_truncated,
        timed_out=result.timed_out,
        files=[FileOutputModel(path=f.path, content_base64=f.content_base64) for f in result.files],
    )
