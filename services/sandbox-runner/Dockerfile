FROM python:3.12-slim
WORKDIR /app
ENV DO_NOT_TRACK=1 HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 PYTHONUNBUFFERED=1

COPY services/sandbox-runner/pyproject.toml ./pyproject.toml
COPY services/sandbox-runner/src ./src
RUN pip install --no-cache-dir .

EXPOSE 8000
CMD ["uvicorn", "sandbox_runner.main:app", "--host", "0.0.0.0", "--port", "8000"]
