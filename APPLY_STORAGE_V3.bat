@echo off
setlocal
cd /d "%~dp0backend"
echo [1/2] Applying database migrations...
alembic upgrade head
if errorlevel 1 (
  echo.
  echo [FAIL] Alembic migration failed. Check DATABASE_URL and database connectivity.
  pause
  exit /b 1
)
echo.
echo [2/2] Verifying Storage V3...
python scripts\verify_storage_v3.py
if errorlevel 1 (
  echo.
  echo [FAIL] Migration completed but V3 verification failed.
  pause
  exit /b 1
)
echo.
echo [OK] Storage V3 is ready.
pause
