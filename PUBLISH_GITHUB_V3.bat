@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\publish_github_v3.ps1"
if errorlevel 1 (
  echo [ERROR] GitHub publish failed. Check login and git credentials.
  pause
  exit /b 1
)
echo [DONE] Source published to deployment branch.
pause
