import hmac
import os

from fastapi import Header, HTTPException

SHARED_SECRET_ENV = "SANDBOX_SHARED_SECRET"


def require_shared_secret(x_opex_sandbox_secret: str = Header(default="")) -> None:
    expected = os.environ.get(SHARED_SECRET_ENV, "")
    if not expected or not hmac.compare_digest(x_opex_sandbox_secret, expected):
        raise HTTPException(status_code=401, detail="invalid or missing sandbox shared secret")
