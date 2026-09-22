import pytest

from sandbox_runner.allowlist import UnknownImageError, resolve_image


def test_resolves_a_known_image_id() -> None:
    assert resolve_image("python-3.12-datasci") == "opex/sandbox-python:latest"


def test_rejects_an_unknown_image_id() -> None:
    with pytest.raises(UnknownImageError):
        resolve_image("some/arbitrary:image")
