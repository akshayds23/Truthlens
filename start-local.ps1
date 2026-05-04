# TruthLens Local Startup Script (PowerShell version)
# Run this from D:\Truthlens directory

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TruthLens AI - Local Development Start" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "This script will start 3 services:" -ForegroundColor Yellow
Write-Host "  1. Express Backend (Port 5000)" -ForegroundColor White
Write-Host "  2. FastAPI AI Service (Port 8000)" -ForegroundColor White
Write-Host "  3. React Frontend (Port 3000/5173)" -ForegroundColor White
Write-Host ""
Write-Host "REQUIREMENTS:" -ForegroundColor Yellow
Write-Host "  ✓ Ports 3000, 5000, 8000 must be available" -ForegroundColor White
Write-Host "  ✓ Update backend/.env with DATABASE_URL" -ForegroundColor White
Write-Host "  ✓ All dependencies installed (npm install, pip install)" -ForegroundColor White
Write-Host ""

$response = Read-Host "Press ENTER to start, or type 'exit' to cancel"
if ($response -eq "exit") { exit }

Write-Host ""
Write-Host "Starting services..." -ForegroundColor Green
Write-Host ""

# Start Express Backend
Write-Host "1️⃣  Starting Express Backend..." -ForegroundColor Yellow
$expressProcess = Start-Process -FilePath "cmd" -ArgumentList '/k "cd D:\Truthlens\backend && npm run dev"' -PassThru
Write-Host "   PID: $($expressProcess.Id)" -ForegroundColor Gray
Start-Sleep 2

# Start FastAPI
Write-Host ""
Write-Host "2️⃣  Starting FastAPI AI Service..." -ForegroundColor Yellow
$fastApiProcess = Start-Process -FilePath "cmd" -ArgumentList '/k "cd D:\Truthlens\backend && .venv\Scripts\python.exe -m uvicorn ai.main:app --reload --host 0.0.0.0 --port 8000"' -PassThru
Write-Host "   PID: $($fastApiProcess.Id)" -ForegroundColor Gray
Start-Sleep 2

# Start React Frontend
Write-Host ""
Write-Host "3️⃣  Starting React Frontend..." -ForegroundColor Yellow
$frontendProcess = Start-Process -FilePath "cmd" -ArgumentList '/k "cd D:\Truthlens\frontend && npm run dev"' -PassThru
Write-Host "   PID: $($frontendProcess.Id)" -ForegroundColor Gray
Start-Sleep 2

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "✓ All services started!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Access application at:" -ForegroundColor Cyan
Write-Host "  Frontend:    http://localhost:3000 (or http://localhost:5173)" -ForegroundColor White
Write-Host "  Express API: http://localhost:5000/health" -ForegroundColor White
Write-Host "  FastAPI:     http://localhost:8000/docs" -ForegroundColor White
Write-Host ""
Write-Host "To stop services: Close the command windows or press Ctrl+C in each window" -ForegroundColor Yellow
Write-Host ""

# Keep this window open
Read-Host "Press ENTER to stop all services"

Write-Host "Stopping services..." -ForegroundColor Red
Get-Process cmd | Where-Object { $_.Id -eq $expressProcess.Id -or $_.Id -eq $fastApiProcess.Id -or $_.Id -eq $frontendProcess.Id } | Stop-Process -Force
Write-Host "All services stopped." -ForegroundColor Green

