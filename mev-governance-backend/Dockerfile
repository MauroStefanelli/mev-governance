# ── Stage 1: build ASP.NET ────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY . .
RUN find . -name '._*' -delete && dotnet publish mev-governance-backend.csproj -c Release -o /app/publish

# ── Stage 2: runtime con .NET + Python ───────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app

# Copia binari .NET
COPY --from=build /app/publish .

# Installa Python 3 + pip
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Installa dipendenze Python in un virtualenv
COPY pdf_parser/requirements.txt /pdf_parser/requirements.txt
RUN python3 -m venv /pdf_parser/.venv \
    && /pdf_parser/.venv/bin/pip install --no-cache-dir -r /pdf_parser/requirements.txt

# Copia sorgente FastAPI
COPY pdf_parser/main.py /pdf_parser/main.py

ENV ASPNETCORE_ENVIRONMENT=Production
ENV PDF_PARSER_URL=http://localhost:8765

# Limita memoria GC di .NET per restare nel piano free di Render (512MB)
ENV DOTNET_GCHeapHardLimit=314572800
ENV DOTNET_GCConserve=1
ENV DOTNET_ThreadPool_UnfairSemaphoreSpinLimit=0

RUN mkdir -p /data && chmod 777 /data

# Script di avvio: lancia FastAPI in background, poi ASP.NET
CMD ["sh", "-c", \
    "/pdf_parser/.venv/bin/uvicorn main:app --app-dir /pdf_parser --host 127.0.0.1 --port 8765 & \
    ASPNETCORE_URLS=http://+:${PORT:-5000} dotnet mev-governance-backend.dll"]
