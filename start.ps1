$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
& node (Join-Path $PSScriptRoot 'scripts\start.mjs')
