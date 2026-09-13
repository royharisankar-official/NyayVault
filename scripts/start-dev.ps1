$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    $pythonCommand = Get-Command python.exe -ErrorAction SilentlyContinue
    if (-not $pythonCommand) {
        throw "Python was not found. Run Launch Prototype.bat or install Python 3.11+."
    }
    $python = $pythonCommand.Source
}
$env:PYTHONPATH = "$root\backend"
$env:DATABASE_URL = "sqlite:///" + (Join-Path $root "backend\dms.db").Replace("\", "/")
Set-Location "$root\backend"
& $python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
