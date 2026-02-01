@echo off
setlocal

rem ==============================================
rem SilverPhysio - Development Runner Script (Windows)
rem Starts both backend (FastAPI) and frontend (Vite)
rem ==============================================

set "PROJECT_ROOT=%~dp0"
set "BACKEND_DIR=%PROJECT_ROOT%backend"
set "FRONTEND_DIR=%PROJECT_ROOT%frontend"

echo ========================================
echo   SilverPhysio Development Server
echo ========================================

rem Check for .env file
if not exist "%PROJECT_ROOT%.env" (
  echo Warning: .env file not found!
  if exist "%PROJECT_ROOT%.env.example" (
    echo Creating from .env.example...
    copy /Y "%PROJECT_ROOT%.env.example" "%PROJECT_ROOT%.env" >nul
    echo Please edit .env with your actual API keys before running.
    exit /b 1
  ) else (
    echo Error: .env.example not found!
    exit /b 1
  )
)

rem Check prerequisites
where python >nul 2>nul
if errorlevel 1 (
  echo Error: python not found. Please install Python 3.10+
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo Error: node not found. Please install Node.js 18+
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo Error: npm not found. Please install npm
  exit /b 1
)

where conda >nul 2>nul
if errorlevel 1 (
  echo Error: conda not found in PATH. Open Anaconda Prompt or add conda to PATH.
  exit /b 1
)

echo Prerequisites OK

rem Copy .env to backend
copy /Y "%PROJECT_ROOT%.env" "%BACKEND_DIR%\.env" >nul

rem Setup frontend deps if needed
if not exist "%FRONTEND_DIR%\node_modules" (
  echo Installing npm dependencies...
  pushd "%FRONTEND_DIR%"
  npm install
  popd
)

echo Starting servers in new windows...

rem Backend (conda env: msba)
start "Backend" cmd /k "call conda activate msba && cd /d ""%BACKEND_DIR%"" && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

rem Frontend
start "Frontend" cmd /k "cd /d ""%FRONTEND_DIR%"" && npm run dev"

echo ========================================
echo Backend:  http://localhost:8000
echo API Docs: http://localhost:8000/api/docs
echo Frontend: http://localhost:5173
echo ========================================
echo Close the two new windows to stop servers.

endlocal
