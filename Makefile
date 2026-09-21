.PHONY: up down logs test

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f

test:
	pnpm test
	cd services/ingest && uv run pytest
