$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$shortcutPath = Join-Path $root "Launch Prototype.lnk"
$targetPath = Join-Path $root "Launch Prototype.bat"
$iconPath = Join-Path $root "nyay-vault.ico"

if (-not (Test-Path -LiteralPath $targetPath)) {
    throw "Launcher not found: $targetPath"
}
if (-not (Test-Path -LiteralPath $iconPath)) {
    throw "Launcher icon not found: $iconPath"
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
$shortcut.WorkingDirectory = $root
$shortcut.IconLocation = "$iconPath,0"
$shortcut.Description = "Launch NyayVault"
$shortcut.Save()

Write-Host "Created $shortcutPath" -ForegroundColor Green
