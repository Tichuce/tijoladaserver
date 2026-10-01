@echo off
rem Builds the Goose client and runs it from Client\run (created on first use).
rem Game data (data, maps, skins, user, ini files) is copied once from your Aspereta
rem client folder. Set GAME_DATA to use a different folder.
rem   run-client.bat             build, prepare Client\run, start the client
rem   run-client.bat --no-start  build and prepare only
setlocal
set "CLIENT=%~dp0"
set "RUN=%CLIENT%run"
if "%GAME_DATA%"=="" set "GAME_DATA=%CLIENT%..\..\Aspereta"

if not exist "%GAME_DATA%\data\compiled.enc" (
  echo Game data not found in "%GAME_DATA%".
  echo Set GAME_DATA to your Aspereta client folder and try again.
  exit /b 1
)

echo Building client...
dotnet build "%CLIENT%gooseclient\AsperetaClient\AsperetaClient.csproj" -c Debug -nologo -v q
if errorlevel 1 (
  echo Build failed.
  exit /b 1
)

robocopy "%CLIENT%gooseclient\AsperetaClient\bin\Debug\net10.0" "%RUN%" /E /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 (
  echo Could not copy the build output to "%RUN%".
  exit /b 1
)

rem Game data: copied only when missing, so your settings in Client\run are kept.
for %%D in (data maps skins user) do (
  if not exist "%RUN%\%%D" robocopy "%GAME_DATA%\%%D" "%RUN%\%%D" /E /NFL /NDL /NJH /NJS /NP >nul
)
for %%F in (Game.ini serverinfo.ini backdrop.bmp) do (
  if not exist "%RUN%\%%F" copy /Y "%GAME_DATA%\%%F" "%RUN%\%%F" >nul
)

rem The original skins have no [LoginScreen] section, which this client needs.
for /d %%S in ("%RUN%\skins\*") do (
  findstr /L /C:"[LoginScreen]" "%%S\Window.ini" >nul 2>&1 || type "%CLIENT%skin-loginscreen.ini" >> "%%S\Window.ini"
)

if /I "%~1"=="--no-start" exit /b 0
start "" /D "%RUN%" "%RUN%\AsperetaClient.exe"
endlocal
