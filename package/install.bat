@echo off
REM Milk Billing - installation on this computer. Right-click > Run as administrator.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
pause
