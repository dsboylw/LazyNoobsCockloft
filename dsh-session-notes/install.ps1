# One-click install/update for @deepseek-ai/dsh-session-notes into the
# DSH Desktop web profile. Copies package.json + lib, patches the user
# cordis.patch.yml (backed up first), and reminds you to restart DSH.

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot

$Profile   = Join-Path $env:APPDATA 'dsh-desktop\harness\profiles\web'
$Target    = Join-Path $Profile 'node_modules\@deepseek-ai\dsh-session-notes'
$PatchYml  = Join-Path $Profile 'cordis.patch.yml'

# 1. copy package files
New-Item -ItemType Directory -Force -Path (Join-Path $Target 'lib') | Out-Null
Copy-Item (Join-Path $Root 'package.json') $Target -Force
Copy-Item (Join-Path $Root 'build\index.js')  (Join-Path $Target 'lib\index.js')  -Force
Copy-Item (Join-Path $Root 'build\client.js') (Join-Path $Target 'lib\client.js') -Force
Write-Host "copied -> $Target"

# 2. ensure the cordis.patch.yml insert row
$insertBlock = @'
    - id: session-notes
      name: '@deepseek-ai/dsh-session-notes'
'@
$text = [System.IO.File]::ReadAllText($PatchYml)
if ($text -notmatch "name:\s*'@deepseek-ai/dsh-session-notes'") {
  $stamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
  $backup = "$PatchYml.bak-$stamp"
  [System.IO.File]::WriteAllText($backup, $text, [System.Text.UTF8Encoding]::new($false))
  Write-Host "backup -> $backup"
  # append the two rows inside the FIRST `- insert:` block, right after it
  $idx = $text.IndexOf('- insert:')
  if ($idx -lt 0) { throw 'cordis.patch.yml has no `- insert:` block; add the rows manually (see README)' }
  $eol = $text.IndexOf("`n", $idx)
  $text = $text.Substring(0, $eol + 1) + $insertBlock + "`n" + $text.Substring($eol + 1)
  [System.IO.File]::WriteAllText($PatchYml, $text, [System.Text.UTF8Encoding]::new($false))
  Write-Host 'patched cordis.patch.yml'
} else {
  Write-Host 'cordis.patch.yml already contains session-notes'
}

Write-Host ''
Write-Host 'DONE. Restart DSH Desktop (full quit + relaunch) to load the plugin.'
