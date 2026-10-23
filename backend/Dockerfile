# Build from the REPOSITORY ROOT (the image bundles the dataset so the loader can run in the container):
#   docker build -f backend/Dockerfile -t deliverylens-api .
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DATA_DIR=/app/data/halcyon-dataset \
    INBOX_DIR=/app/data/sample-inbox \
    DATABASE_URL=sqlite:////app/var/deliverylens.db \
    LLM_PROVIDER=mock

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install -r requirements.txt

COPY backend/app ./app
COPY backend/sample_emails ./sample_emails
COPY data/halcyon-dataset ./data/halcyon-dataset
COPY data/sample-inbox ./data/sample-inbox

RUN useradd --create-home --uid 10001 appuser && mkdir -p /app/var && chown -R appuser /app/var
USER appuser

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')" || exit 1

# Load data once:  docker exec <container> python -m app.loader --if-empty
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
