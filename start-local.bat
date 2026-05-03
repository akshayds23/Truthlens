@echo off
REM TruthLens Local Startup Script - Run all 3 services

echo.
echo ========================================
echo TruthLens AI - Local Development Start
echo ========================================
echo.
echo This script will start 3 services in separate windows:
echo   1. Express Backend (Port 5000)
echo   2. FastAPI AI Service (Port 8000)
echo   3. React Frontend (Port 3000)
echo.
echo BEFORE RUNNING:
echo   - Update backend/.env with your DATABASE_URL from Neon/Railway
echo   - Make sure all ports (3000, 5000, 8000) are available
echo.
pause

echo.
echo Starting Express Backend...
start cmd /k "cd D:\Truthlens\backend && npm run dev"
timeout /t 3

echo Starting FastAPI Service...
start cmd /k "cd D:\Truthlens\backend && python -m uvicorn ai.main:app --reload --host 0.0.0.0 --port 8000"
timeout /t 3

echo Starting React Frontend...
start cmd /k "cd D:\Truthlens\frontend && npm run dev"

echo.
echo ========================================
echo All services started!
echo ========================================
echo.
echo Access at:
echo   Frontend:   http://localhost:3000 (or 5173)
echo   Express:    http://localhost:5000/health
echo   FastAPI:    http://localhost:8000/docs
echo.
echo Close any window to stop that service.
echo Close all windows to stop everything.
echo.
pause

