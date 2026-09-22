.PHONY: up down logs test

up:
	docker build -f services/sandbox-runner/Dockerfile.sandbox-image -t opex/sandbox-python:latest .
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f

test:
	pnpm test
	cd services/ingest && uv run pytest
	cd services/sandbox-runner && uv run pytest
