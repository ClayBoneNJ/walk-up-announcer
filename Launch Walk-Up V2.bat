@echo off
setlocal

cd /d "%~dp0\v2"
title Walk-Up Announcer V2

where npm >nul 2>&1
if errorlevel 1 (
  echo Node.js and npm are required to run this app.
  echo Install Node.js from https://nodejs.org/ and try again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing V2 dependencies...
  call npm install
  if errorlevel 1 (
    echo.
    echo Dependency install failed.
    pause
    exit /b 1
  )
)

echo Starting Walk-Up Announcer V2...
start "" cmd /c "timeout /t 3 >nul && start http://localhost:5173"
call npm run dev -- --host 0.0.0.0

endlocal
