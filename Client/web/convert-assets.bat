@echo off
rem Converts the Aspereta game data (data\*.adf, maps, skins) into browser assets in www\assets.
rem Usage: convert-assets.bat [path to the Aspereta game folder]
setlocal
cd /d "%~dp0"
set "GAME=%~1"
if "%GAME%"=="" set "GAME=%~dp0..\..\..\Aspereta"
dotnet run --project tools\AsperetaWeb -c Release -- convert --game "%GAME%" --out www\assets
if errorlevel 1 (echo. & echo Conversion reported errors, see above.) else (echo. & echo Assets ready in www\assets.)
pause
