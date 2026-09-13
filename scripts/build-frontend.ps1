$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location "$root\frontend"
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
    throw "Node.js/npm was not found. Install Node.js 18+ before building the frontend."
}
& $npm.Source run build
