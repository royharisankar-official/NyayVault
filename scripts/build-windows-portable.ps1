$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$runtime = Join-Path $root "portable-runtime"
$pythonVersion = "3.12.10"
$pythonZip = "python-$pythonVersion-embed-amd64.zip"
$pythonUrl = "https://www.python.org/ftp/python/$pythonVersion/$pythonZip"
$getPip = Join-Path $runtime "get-pip.py"
$sitePackages = Join-Path $runtime "Lib\site-packages"

if (-not (Get-Command Expand-Archive -ErrorAction SilentlyContinue)) {
    throw "PowerShell archive support is required to build the portable package."
}

if (Test-Path $runtime) {
    Remove-Item -LiteralPath $runtime -Recurse -Force
}
New-Item -ItemType Directory -Path $runtime | Out-Null

$zipPath = Join-Path $env:TEMP $pythonZip
Write-Host "Downloading portable Python $pythonVersion..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $pythonUrl -OutFile $zipPath
Expand-Archive -LiteralPath $zipPath -DestinationPath $runtime
Remove-Item -LiteralPath $zipPath -Force

$pth = Join-Path $runtime "python312._pth"
$pthContent = Get-Content -LiteralPath $pth
if (-not ($pthContent -contains "import site")) {
    Add-Content -LiteralPath $pth -Value "Lib\site-packages"
    Add-Content -LiteralPath $pth -Value "import site"
}

Write-Host "Installing pip and backend dependencies..." -ForegroundColor Cyan
Invoke-WebRequest -Uri "https://bootstrap.pypa.io/get-pip.py" -OutFile $getPip
& (Join-Path $runtime "python.exe") $getPip --disable-pip-version-check
if ($LASTEXITCODE -ne 0) {
    throw "pip bootstrap failed with exit code $LASTEXITCODE."
}
Remove-Item -LiteralPath $getPip -Force

New-Item -ItemType Directory -Path $sitePackages -Force | Out-Null
& (Join-Path $runtime "python.exe") -m pip install --disable-pip-version-check --no-cache-dir --target $sitePackages -r (Join-Path $root "backend\requirements.txt")
if ($LASTEXITCODE -ne 0) {
    throw "Backend dependency installation failed with exit code $LASTEXITCODE."
}

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($npm) {
    Write-Host "Building the frontend..." -ForegroundColor Cyan
    Set-Location (Join-Path $root "frontend")
    & $npm.Source run build
    if ($LASTEXITCODE -ne 0) {
        throw "Frontend build failed with exit code $LASTEXITCODE."
    }
}

Write-Host ""
Write-Host "Portable Windows package is ready." -ForegroundColor Green
Write-Host "Copy the complete project folder to the USB drive and run Launch Prototype.bat."
