@echo off
rem Serves the browser client on http://localhost:8080/ (the game server must be running too).
setlocal
cd /d "%~dp0"
if not exist www\assets\index.json (echo www\assets is missing - run convert-assets.bat first. & pause & exit /b 1)
start "" http://localhost:8080/
dotnet run --project tools\AsperetaWeb -c Release -- serve --root www --port 8080
