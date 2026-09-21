@echo off
setlocal
cd /d "%~dp0"
echo TubeSave Desktop - first-time setup
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\install_windows.ps1"
if errorlevel 1 (
  echo Setup failed. Read the error above. No administrator permissions are needed.
  pause
  exit /b 1
)
endlocal
