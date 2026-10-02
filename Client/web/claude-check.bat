@echo off
set "LOG=%~dp0claude-check.log"
cd /d "%~dp0..\.."
set "T=%TEMP%\goose-wscheck"
(
echo === %DATE% %TIME%
echo === processes
tasklist /FI "IMAGENAME eq Goose.exe"
tasklist /FI "IMAGENAME eq AsperetaClient.exe"
echo === isolated copy in %T%
if exist "%T%" rmdir /s /q "%T%"
robocopy Goose "%T%\Goose" /E /XD bin obj /NFL /NDL /NJH /NJS /NP
robocopy Goose.Tests "%T%\Goose.Tests" /E /XD bin obj /NFL /NDL /NJH /NJS /NP
robocopy TestSupport "%T%\TestSupport" /E /XD bin obj /NFL /NDL /NJH /NJS /NP
robocopy CsvToSql "%T%\CsvToSql" /E /XD bin obj /NFL /NDL /NJH /NJS /NP
echo === websocket tests
dotnet test "%T%\Goose.Tests\Goose.Tests.csproj" --filter "FullyQualifiedName~WebSocketTransportTests|FullyQualifiedName~GameServerStartupTests|FullyQualifiedName~PlayerSendTests|FullyQualifiedName~PreLoginReassemblyTests" --logger "console;verbosity=normal"
echo === full unit suite
dotnet test "%T%\Goose.Tests\Goose.Tests.csproj" --no-build --logger "console;verbosity=minimal"
echo === converter build
dotnet build Client\web\tools\AsperetaWeb -c Release
echo === convert
dotnet run --project Client\web\tools\AsperetaWeb -c Release --no-build -- convert --game ..\Aspereta --out Client\web\www\assets
echo === DONE %DATE% %TIME%
) > "%LOG%" 2>&1
