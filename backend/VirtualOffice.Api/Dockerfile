# Backend Office Quest — ASP.NET Core (.NET 10) + SignalR, serve o app web (wwwroot).
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY VirtualOffice.Api.csproj ./
RUN dotnet restore VirtualOffice.Api.csproj
COPY . ./
RUN dotnet publish VirtualOffice.Api.csproj -c Release -o /app -p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app ./
ENV ASPNETCORE_URLS=http://+:8080 \
    ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080
ENTRYPOINT ["dotnet", "VirtualOffice.Api.dll"]
