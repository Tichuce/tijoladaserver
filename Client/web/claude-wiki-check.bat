@echo off
rem Temporary check by Claude: builds AsperetaWeb, exports the wiki data, runs the client tests.
setlocal
cd /d "%~dp0"
set LOG=%~dp0claude-wiki-check.log
echo ==== build %date% %time% > "%LOG%"
dotnet build tools\AsperetaWeb -c Release >> "%LOG%" 2>&1
echo build exit %errorlevel% >> "%LOG%"
echo ==== export >> "%LOG%"
dotnet run --project tools\AsperetaWeb -c Release --no-build -- wiki --db "%~dp0..\..\Goose\bin\Debug\AsperetaGoose.db" --out www\wiki\data.js --assets www\assets --single aspereta-wiki.html >> "%LOG%" 2>&1
echo export exit %errorlevel% >> "%LOG%"
echo ==== node >> "%LOG%"
where node >> "%LOG%" 2>&1
where npx >> "%LOG%" 2>&1
echo ==== done >> "%LOG%"
