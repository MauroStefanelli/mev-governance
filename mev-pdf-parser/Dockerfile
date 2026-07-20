FROM python:3.11-slim

WORKDIR /app

COPY mev-pdf-parser/requirements.txt /app/
COPY mev-pdf-parser/main.py /app/

RUN pip install --no-cache-dir -r /app/requirements.txt

CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --log-level info"]
