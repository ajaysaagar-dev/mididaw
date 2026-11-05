@echo off
title MIDIDAW Windows Bridge
cd /d "%~dp0"

echo ============================================================
echo   MIDIDAW - Windows PC Bridge Launcher
echo ============================================================
echo.

if exist "%~dp0MidiDawBridge.exe" (
    echo [*] Starting standalone MidiDawBridge.exe...
    start "" "%~dp0MidiDawBridge.exe"
    exit /b 0
)

if exist "%~dp0dist\MidiDawBridge.exe" (
    echo [*] Starting standalone MidiDawBridge.exe...
    start "" "%~dp0dist\MidiDawBridge.exe"
    exit /b 0
)

set PYTHON_PATH="C:\Users\ajaysaagar developer\AppData\Local\Python\bin\python.exe"
if exist %PYTHON_PATH% (
    echo [*] Starting Python GUI Bridge...
    start "" %PYTHON_PATH% "%~dp0bridge_gui.py"
    exit /b 0
)

echo [!] MidiDawBridge.exe not found in %~dp0
pause
