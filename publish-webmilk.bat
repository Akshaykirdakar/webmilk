@echo off
REM Builds a self-contained deployable copy into D:\dairy\webmilk\deploy
REM   deploy\backend  - the API (MilkBilling.Api.exe)
REM   deploy\frontend - the web pages (served by the API)
cd /d "%~dp0"
dotnet publish backend\MilkBilling.Api -c Release -r win-x64 --self-contained true -o deploy\backend || goto :err
xcopy /E /I /Y frontend deploy\frontend >nul
powershell -NoProfile -Command "(Get-Content deploy\backend\appsettings.json -Raw) -replace '\.\.\\\\\.\.\\\\frontend','..\\frontend' | Set-Content -Encoding UTF8 deploy\backend\appsettings.json"
echo.
echo Published to %~dp0deploy
echo Run deploy\backend\MilkBilling.Api.exe  (or install it as a Windows service, see README.md)
pause
exit /b 0
:err
echo Publish failed.
pause
exit /b 1
