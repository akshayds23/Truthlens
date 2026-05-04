#!/bin/bash
set -e
echo "Starting TruthLens Backend..."
cd /app
node dist/server.js &
EXPRESS_PID=$!
uvicorn ai.main:app --host 0.0.0.0 --port 8000 &
FASTAPI_PID=$!
wait $EXPRESS_PID $FASTAPI_PID
