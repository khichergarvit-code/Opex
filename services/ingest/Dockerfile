FROM python:3.12-slim
WORKDIR /app
ENV DO_NOT_TRACK=1 HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 PYTHONUNBUFFERED=1

# tesseract-ocr-eng and tesseract-ocr-hin give the eng+hin OCR path
# (ocr.py) the same language data used and verified locally. libgl1 +
# libglib2.0-0 are OpenCV's (a transitive Docling dependency) runtime
# shared-library requirements — python:3.12-slim doesn't include them and
# Docling fails at import time with "libGL.so.1: cannot open shared object
# file" without this (found via a real containerized ingest run).
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr tesseract-ocr-eng tesseract-ocr-hin \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY services/ingest/pyproject.toml ./pyproject.toml
COPY services/ingest/src ./src
RUN pip install --no-cache-dir .

EXPOSE 8000
CMD ["python", "-m", "ingest.worker"]
