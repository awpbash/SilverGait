@echo off
setlocal

rem ==============================================
rem SilverGait - Development Runner Script (Windows)
rem Starts both backend (FastAPI) and frontend (Vite)
rem ==============================================

set "PROJECT_ROOT=%~dp0"
set "BACKEND_DIR=%PROJECT_ROOT%backend"
set "FRONTEND_DIR=%PROJECT_ROOT%frontend"
set "VENV_DIR=%BACKEND_DIR%\venv"
set "COREPACK_HOME=%PROJECT_ROOT%.corepack"
if not exist "%COREPACK_HOME%" mkdir "%COREPACK_HOME%" >nul 2>nul

echo ========================================
echo   SilverGait Development Server
echo ========================================

rem Check for .env file
if not exist "%PROJECT_ROOT%.env" (
  if exist "%PROJECT_ROOT%.env.example" (
    echo Warning: .env file not found! Creating from .env.example...
    copy /Y "%PROJECT_ROOT%.env.example" "%PROJECT_ROOT%.env" >nul
    echo Please edit .env and add your GEMINI_API_KEY before running.
  ) else (
    echo Error: .env file not found!
    echo Create a .env file with at least: GEMINI_API_KEY=your_key_here
  )
  exit /b 1
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

set "PNPM_CMD=pnpm"
where pnpm >nul 2>nul
if errorlevel 1 (
  where corepack >nul 2>nul
  if errorlevel 1 (
    echo Error: pnpm not found. Install pnpm or use Node.js with corepack enabled.
    exit /b 1
  )
  set "PNPM_CMD=corepack pnpm"
)

call %PNPM_CMD% --version >nul 2>nul
if errorlevel 1 (
  if /I "%PNPM_CMD%"=="corepack pnpm" (
    echo Error: corepack could not provision pnpm ^(often a permissions issue, e.g. WinError 5^).
    echo Try:
    echo   corepack enable
    echo   corepack prepare pnpm@10.0.0 --activate
    echo Or install pnpm directly:
    echo   npm install -g pnpm
  ) else (
    echo Error: pnpm is unavailable.
  )
  exit /b 1
)

echo Prerequisites OK

rem Setup Python virtual environment
if not exist "%VENV_DIR%\Scripts\python.exe" (
  echo Creating virtual environment...
  python -m venv "%VENV_DIR%"
)

echo Installing Python dependencies...
call "%VENV_DIR%\Scripts\pip.exe" install --upgrade pip -q
call "%VENV_DIR%\Scripts\pip.exe" install -r "%BACKEND_DIR%\requirements.txt" -q
echo Python dependencies installed.

rem Copy .env to backend
copy /Y "%PROJECT_ROOT%.env" "%BACKEND_DIR%\.env" >nul

rem Setup frontend deps
echo Installing frontend dependencies with pnpm...
pushd "%FRONTEND_DIR%"
if exist "pnpm-lock.yaml" (
  call %PNPM_CMD% install --frozen-lockfile
) else (
  call %PNPM_CMD% install
)
popd

echo Starting servers in new windows...

rem Backend (using venv python)
start "Backend" cmd /k "cd /d ""%BACKEND_DIR%"" && ""%VENV_DIR%\Scripts\python.exe"" -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

rem Frontend
start "Frontend" cmd /k "cd /d ""%FRONTEND_DIR%"" && call %PNPM_CMD% run dev"

echo ========================================
echo Backend:  http://localhost:8000
echo API Docs: http://localhost:8000/api/docs
echo Frontend: http://localhost:5173
echo ========================================
echo Close the two new windows to stop servers.

endlocal
