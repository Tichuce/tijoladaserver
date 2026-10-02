@echo off
set "LOG=%~dp0claude-check2.log"
cd /d "%~dp0..\.."
set "T=%TEMP%\goose-ahcheck"
(
echo === %DATE% %TIME%
if exist "%T%" rmdir /s /q "%T%"
robocopy Goose "%T%\Goose" /E /XD bin obj /NFL /NDL /NJH /NJS /NP
robocopy Goose.Tests "%T%\Goose.Tests" /E /XD bin obj /NFL /NDL /NJH /NJS /NP
robocopy TestSupport "%T%\TestSupport" /E /XD bin obj /NFL /NDL /NJH /NJS /NP
robocopy CsvToSql "%T%\CsvToSql" /E /XD bin obj /NFL /NDL /NJH /NJS /NP
dotnet test "%T%\Goose.Tests\Goose.Tests.csproj" --filter "FullyQualifiedName~AutoHuntTests|FullyQualifiedName~WebSocketTransportTests" --logger "console;verbosity=normal"
echo === DONE %DATE% %TIME%
) > "%LOG%" 2>&1
