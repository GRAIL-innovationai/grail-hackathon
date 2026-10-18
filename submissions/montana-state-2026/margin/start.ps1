$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$marginVenvPython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
$marginBundledPython = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
if (Test-Path -LiteralPath $marginVenvPython) {
    & $marginVenvPython run.py
} elseif (Test-Path -LiteralPath $marginBundledPython) {
    & $marginBundledPython run.py
} else {
    python run.py
}
