FROM python:3.11-slim
WORKDIR /app

COPY mev-pdf-parser/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY mev-pdf-parser/main.py .

# Render inietta $PORT automaticamente
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --log-level info"]
