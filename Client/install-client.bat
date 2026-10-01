@echo off
rem Builds the new client (Release) and installs it into the Aspereta game folder, next to AspGame.exe.
rem AspGame.exe and the game's own files are never overwritten; both clients share data, maps, skins and user.
rem Run it again after changing the client source to update the installed copy.
rem Set GAME_DIR to install somewhere else.
setlocal
set "CLIENT=%~dp0"
if "%GAME_DIR%"=="" set "GAME_DIR=%CLIENT%..\..\Aspereta"
for %%I in ("%GAME_DIR%") do set "GAME_DIR=%%~fI"
set "PUB=%CLIENT%gooseclient\AsperetaClient\bin\publish"

if not exist "%GAME_DIR%\data\compiled.enc" (
  echo Aspereta game folder not found: "%GAME_DIR%"
  exit /b 1
)

echo Building client...
dotnet publish "%CLIENT%gooseclient\AsperetaClient\AsperetaClient.csproj" -c Release -r win-x64 --self-contained false -o "%PUB%" -nologo -v q
if errorlevel 1 (
  echo Build failed. Nothing was installed.
  exit /b 1
)

rem The new client never ships files with the game's names; skip them anyway so they can't be replaced.
echo Installing into "%GAME_DIR%"...
robocopy "%PUB%" "%GAME_DIR%" /E /XF *.pdb AspGame.exe Game.ini serverinfo.ini backdrop.bmp /XD data maps skins user /NFL /NDL /NJH /NJS /NP
if errorlevel 8 (
  echo Copy failed. Is the new client still open?
  exit /b 1
)

rem The new client rewrites Game.ini when it closes: keep a copy of the original once.
if not exist "%GAME_DIR%\Game.ini.before-new-client" copy /Y "%GAME_DIR%\Game.ini" "%GAME_DIR%\Game.ini.before-new-client" >nul

rem The original skins have no [LoginScreen] section, which the new client needs (AspGame ignores it).
for /d %%S in ("%GAME_DIR%\skins\*") do (
  findstr /L /C:"[LoginScreen]" "%%S\Window.ini" >nul 2>&1 || (
    if not exist "%%S\Window.ini.before-new-client" copy /Y "%%S\Window.ini" "%%S\Window.ini.before-new-client" >nul
    type "%CLIENT%skin-loginscreen.ini" >> "%%S\Window.ini"
  )
)

echo Installed: "%GAME_DIR%\AsperetaClient.exe"
endlocal
