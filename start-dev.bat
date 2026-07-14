@echo off
REM ============================================
REM   Reserve Split - Full Stack Dev Launcher
REM   Starts both Backend API & Frontend UI
REM ============================================

setlocal enabledelayedexpansion

REM Get the directory this script is in (project root)
set "ROOT_DIR=%~dp0"
set "PROJECT_DIR=%ROOT_DIR%lobs_reserves-main"
set "BACKEND_DIR=%PROJECT_DIR%\backend"
set "FRONTEND_DIR=%PROJECT_DIR%\frontend"

echo.
echo ============================================
echo      Reserve Split - Full Stack Launcher
echo ============================================
echo.
echo This script will:
echo   1. Install backend Python dependencies (if needed)
echo   2. Install frontend Node.js dependencies (if needed)
echo   3. Start both servers in separate windows
echo.
echo   Backend API : http://localhost:8000
echo   API Docs    : http://localhost:8000/api/docs
echo   Frontend    : http://localhost:3000
echo.
echo ============================================
echo.

REM ---- Step 1: Install Backend Dependencies ----
echo [Step 1/4] Installing backend Python dependencies...
pip install -r "%BACKEND_DIR%\requirements.txt"
if errorlevel 1 (
    echo.
    echo WARNING: pip install had issues. Trying to continue...
)
echo Done.
echo.

REM ---- Step 2: Install Frontend Dependencies ----
echo [Step 2/4] Installing frontend Node.js dependencies...
if exist "%FRONTEND_DIR%\node_modules" (
    echo node_modules found, skipping npm install.
) else (
    cd /d "%FRONTEND_DIR%"
    call npm.cmd install
    if errorlevel 1 (
        echo.
        echo WARNING: npm install had issues. Trying to continue...
    )
)
echo Done.
echo.

REM ---- Step 3: Start Backend ----
echo [Step 3/4] Starting Backend API server...
start "Reserve Split - Backend" cmd /k "cd /d "%BACKEND_DIR%" && title Reserve Split - Backend && echo. && echo Backend API starting... && echo. && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

timeout /t 2 /nobreak >nul

REM ---- Step 4: Start Frontend ----
echo [Step 4/4] Starting Frontend dev server...
start "Reserve Split - Frontend" cmd /k "cd /d "%FRONTEND_DIR%" && title Reserve Split - Frontend && echo. && echo Frontend starting... && echo. && npm.cmd run dev"

echo.
echo ============================================
echo  All done! Both servers are launching...
echo.
echo  Backend API : http://localhost:8000
echo  API Docs    : http://localhost:8000/api/docs
echo  Frontend    : http://localhost:3000
echo.
echo  Close the individual server windows to stop them.
echo ============================================
echo.

pause
exit /b 0
