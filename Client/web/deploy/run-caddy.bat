@echo off
rem Starts Caddy with deploy\Caddyfile: HTTPS for the browser client and the wiki, and
rem wss:// forwarding to the game server's local WebSocket port. See ..\DEPLOY.md.
rem caddy.exe must be in this folder or on the PATH (https://caddyserver.com/download).
setlocal
cd /d "%~dp0"
where caddy >nul 2>nul
if errorlevel 1 if not exist caddy.exe (echo caddy.exe not found: put it in %~dp0 or on the PATH. See DEPLOY.md. & pause & exit /b 1)
if exist caddy.exe (caddy.exe run --config Caddyfile --adapter caddyfile) else (caddy run --config Caddyfile --adapter caddyfile)
pause
