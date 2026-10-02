@echo off
rem Exports the game data (items, creatures/NPCs, spells, quests, recipes, maps) from the
rem server database into www\wiki\data.js for the static wiki, with pictures from www\assets,
rem and writes aspereta-wiki.html: the whole wiki in one file.
rem Usage: build-wiki.bat [path to AsperetaGoose.db]
setlocal
cd /d "%~dp0"
set "DB=%~1"
if "%DB%"=="" set "DB=%~dp0..\..\Goose\bin\Debug\AsperetaGoose.db"
dotnet run --project tools\AsperetaWeb -c Release -- wiki --db "%DB%" --out www\wiki\data.js --assets www\assets --single aspereta-wiki.html
if errorlevel 1 (echo. & echo Wiki export failed, see above. & pause & exit /b 1)
echo.
echo Wiki ready: open www\wiki\index.html, or run-web.bat and go to http://localhost:8080/wiki/
echo Single-file copy to share: aspereta-wiki.html
pause
