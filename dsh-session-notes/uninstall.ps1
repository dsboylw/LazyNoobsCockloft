# Remove @deepseek-ai/dsh-session-notes from the DSH Desktop web profile.
# Strips the cordis.patch.yml rows (backed up first) and deletes the package dir.

$ErrorActionPreference = 'Stop'
$Profile  = Join-Path $env:APPDATA 'dsh-desktop\harness\profiles\web'
$Target   = Join-Path $Profile 'node_modules\@deepseek-ai\dsh-session-notes'
$PatchYml = Join-Path $Profile 'cordis.patch.yml'

# 1. strip the patch rows
$text = [System.IO.File]::ReadAllText($PatchYml)
$cleaned = ($text -split "`r?`n" | Where-Object {
  $_ -notmatch "^\s*- id: session-notes\s*$" -and
  $_ -notmatch "^\s*name:\s*'@deepseek-ai/dsh-session-notes'\s*$"
}) -join "`n"
if ($cleaned -ne $text) {
  $stamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
  $backup = "$PatchYml.bak-$stamp"
  [System.IO.File]::WriteAllText($backup, $text, [System.Text.UTF8Encoding]::new($false))
  Write-Host "backup -> $backup"
  [System.IO.File]::WriteAllText($PatchYml, $cleaned, [System.Text.UTF8Encoding]::new($false))
  Write-Host 'patch rows removed'
} else {
  Write-Host 'no patch rows found'
}

# 2. delete the package dir
if (Test-Path $Target) {
  Remove-Item $Target -Recurse -Force
  Write-Host "removed $Target"
}

Write-Host ''
Write-Host 'DONE. Restart DSH Desktop to unload the plugin.'
Write-Host 'Note: saved notes stay in harness settings.yaml until you remove them.'
