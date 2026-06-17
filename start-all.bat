@echo off
title FWR HOTEL FINDER LAUNCHER
echo ==========================================================
echo   FWR HOTEL FINDER - STARTUP ORCHESTRATOR
echo ==========================================================
echo.
echo 📡 Starting Puppeteer Scraping Backend (Port 3001)...
start "FWR Scraping Server" cmd /c "cd server && npm start"

echo.
echo 🎨 Starting React Vite Frontend (Port 5173)...
echo ➜ Launching local development environment...
npm run dev
