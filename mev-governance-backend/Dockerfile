# ── Stage 1: build ────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY . .
RUN find . -name '._*' -delete && dotnet publish mev-governance-backend.csproj -c Release -o /app/publish

# ── Stage 2: runtime .NET puro (senza Python) ─────────────────
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app

COPY --from=build /app/publish .

ENV ASPNETCORE_ENVIRONMENT=Production

# PDF_PARSER_URL punta al servizio mev-pdf-parser su Render
# Sovrascrivibile via variabile d'ambiente nel deploy
ENV PDF_PARSER_URL=https://mev-pdf-parser.onrender.com

# Limita heap GC per contenere l'uso di memoria nel piano free
ENV DOTNET_GCHeapHardLimit=419430400
ENV DOTNET_GCConserve=1

RUN mkdir -p /data && chmod 777 /data

CMD ["sh", "-c", "ASPNETCORE_URLS=http://+:${PORT:-5000} dotnet mev-governance-backend.dll"]

