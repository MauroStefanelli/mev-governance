# v2
FROM python:3.11-slim

WORKDIR /app

COPY . /app


RUN echo "CONTENUTO /app" && find /app -maxdepth 2 -type f && false


# RUN pwd && ls -la /app

# RUN pip install --no-cache-dir -r requirements.txt

CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --log-level info"]
