$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$port = 8000
$python = Join-Path $root "portable-runtime\python.exe"

if (-not (Test-Path $python)) {
    $python = Join-Path $root ".venv\Scripts\python.exe"
}

if (-not (Test-Path $python)) {
    $pythonCommand = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($pythonCommand) {
        $python = $pythonCommand.Source
    } else {
        $docker = Get-Command docker.exe -ErrorAction SilentlyContinue
        if ($docker) {
            Write-Host "Portable Python was not found. Starting the Docker version instead." -ForegroundColor Yellow
            Set-Location $root
            & $docker.Source compose up --build
            exit $LASTEXITCODE
        }
        throw "Portable Python was not found. Run scripts\build-windows-portable.ps1 first."
    }
}

$localUrl = "http://127.0.0.1:$port/?theme=dark"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " NyayVault | Secure Case Intelligence" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Computer: $localUrl" -ForegroundColor Green
Write-Host ""
Write-Host "Keep this window open while using the prototype." -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop the server." -ForegroundColor Yellow
Write-Host ""

$env:PYTHONPATH = $backend
$env:DATABASE_URL = "sqlite:///" + (Join-Path $backend "dms.db").Replace("\", "/")
Set-Location $backend
Start-Process $localUrl
& $python -m uvicorn app.main:app --host 127.0.0.1 --port $port

Write-Host ""
Write-Host "The prototype server has stopped." -ForegroundColor Yellow
Read-Host "Press Enter to close this window"
