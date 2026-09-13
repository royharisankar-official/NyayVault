$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location "$root\services\integration-gateway"
if (-not (Test-Path "node_modules")) {
    npm install
}
npm start
