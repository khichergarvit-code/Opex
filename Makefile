.PHONY: setup up down logs test

# Same steps as RUNNER.md, for people who have make. Everything runs in Docker.
setup:
	docker compose --profile setup build
	docker compose --profile setup run --rm model-fetch
	docker compose --profile setup run --rm docling-warm
	docker compose up -d --build
	docker compose exec api node dist/db/seed.js

up:
	docker compose --profile setup build sandbox-image
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f

test:
	pnpm test
	cd services/ingest && uv run pytest
	cd services/sandbox-runner && uv run pytest
