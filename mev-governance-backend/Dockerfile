FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY . .
RUN find . -name '._*' -delete && dotnet publish mev-governance-backend.csproj -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app/publish .

ENV ASPNETCORE_ENVIRONMENT=Production

RUN mkdir -p /data && chmod 777 /data

CMD ["sh", "-c", "ASPNETCORE_URLS=http://+:${PORT:-5000} dotnet mev-governance-backend.dll"]
