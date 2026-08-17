@echo off
setlocal
cd /d "%~dp0"

echo MomoCall LAN development relay
echo This server is for local testing only. Do not expose it to the Internet.
set /p MOMOCALL_SHARED_SECRET="Shared test secret: "
if "%MOMOCALL_SHARED_SECRET%"=="" (
  echo A shared test secret is required.
  pause
  exit /b 1
)

if not exist "node_modules\ws" (
  echo Installing the local relay dependency...
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

echo.
echo Relay started. Use ws://YOUR-COMPUTER-LAN-IP:38700 in both clients.
echo Leave this window open during the call test.
npm start
pause
