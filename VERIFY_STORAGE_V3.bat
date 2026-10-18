@echo off
setlocal
cd /d "%~dp0backend"
python scripts\verify_storage_v3.py
if errorlevel 1 (
  echo.
  echo [FAIL] V3 storage verification failed.
  pause
  exit /b 1
)
echo.
echo [OK] V3 storage verification passed.
pause
