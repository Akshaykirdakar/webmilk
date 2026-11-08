@echo off
REM Starts the Milk Billing web application (API + frontend) on http://localhost:5080
REM Other computers on the LAN open http://<this-pc-ip>:5080
cd /d "%~dp0backend\MilkBilling.Api"
dotnet run -c Release --no-launch-profile
pause
