FROM python:3.12-slim

WORKDIR /app
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend ./backend
COPY frontend/dist ./frontend/dist

ENV PYTHONPATH=/app/backend
ENV DATABASE_URL=sqlite:////app/backend/dms.db
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--app-dir", "/app/backend", "--host", "0.0.0.0", "--port", "8000"]
