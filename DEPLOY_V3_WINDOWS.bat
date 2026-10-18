@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\deploy_vercel_v3.ps1"
if errorlevel 1 (
  echo [ERROR] See instructions in DEPLOY_V3_README.md.
  pause
  exit /b 1
)
echo [DONE] Please verify the deployment URL.
pause
