@echo off
REM Opens the Milk Billing System full screen, without the browser address bar / tabs (like the VB program).
REM On other computers change SERVER to the server PC's IP, e.g. set SERVER=http://192.168.1.10:5080
set SERVER=http://localhost:5080
set EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe
if not exist "%EDGE%" set EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe
set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe

if exist "%CHROME%" (
  start "" "%CHROME%" --app=%SERVER% --start-fullscreen --user-data-dir="%LOCALAPPDATA%\MilkBillingBrowser"
) else (
  start "" "%EDGE%" --app=%SERVER% --start-fullscreen --user-data-dir="%LOCALAPPDATA%\MilkBillingBrowser"
)
REM To leave full screen press F11, to close the program press Alt+F4.
