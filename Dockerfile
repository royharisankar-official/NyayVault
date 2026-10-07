FROM node:20-alpine AS frontend-build

WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

FROM python:3.12-slim

WORKDIR /app
COPY VERSION ./VERSION
COPY backend/requirements.txt ./backend/requirements.txt
COPY backend/requirements-optional.txt ./backend/requirements-optional.txt
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir -r backend/requirements.txt \
    && pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch \
    && pip install --no-cache-dir -r backend/requirements-optional.txt
COPY backend ./backend
COPY --from=frontend-build /frontend/dist ./frontend/dist

ENV PYTHONPATH=/app/backend
ENV DATABASE_URL=sqlite:////app/data/dms.db
RUN mkdir -p /app/data /app/backend/uploads /app/backend/media
EXPOSE 10000

CMD ["sh", "-c", "exec uvicorn app.main:app --app-dir /app/backend --host 0.0.0.0 --port ${PORT:-8000}"]
