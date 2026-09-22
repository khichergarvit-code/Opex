"""Maps a caller-supplied image_id to the real, pre-built image tag. The
caller never supplies a raw Docker image reference — only one of these
known ids (tools.md: "Raw Docker args are never accepted")."""

IMAGE_ALLOWLIST: dict[str, str] = {
    "python-3.12-datasci": "opex/sandbox-python:latest",
}


class UnknownImageError(ValueError):
    pass


def resolve_image(image_id: str) -> str:
    try:
        return IMAGE_ALLOWLIST[image_id]
    except KeyError as exc:
        raise UnknownImageError(f'unknown image_id "{image_id}"') from exc
