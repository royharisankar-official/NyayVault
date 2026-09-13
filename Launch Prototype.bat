@echo off
setlocal

rem Use fltmc to reliably detect whether this process is elevated.
fltmc >nul 2>&1
if errorlevel 1 (
    echo Requesting administrator privileges to launch the prototype...
    PowerShell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch-prototype.ps1"
