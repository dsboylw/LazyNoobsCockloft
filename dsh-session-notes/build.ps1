# Build script for @deepseek-ai/dsh-session-notes (DSH Desktop / Web).
# Requires: esbuild.exe at E:\DSH\build-tools\package\esbuild.exe (adjust $Esbuild),
# node on PATH. No pnpm/npm needed — closure comes from the DSH app.

$ErrorActionPreference = 'Stop'
$Esbuild = 'E:\DSH\build-tools\package\esbuild.exe'
$Root    = $PSScriptRoot
$Src     = Join-Path $Root 'src'
$Out     = Join-Path $Root 'build'

New-Item -ItemType Directory -Force -Path $Out | Out-Null

Write-Host '== host bundle =='
$hostOut = '--outfile=' + (Join-Path $Out 'index.js')
& $Esbuild (Join-Path $Src 'index.js') `
  --bundle --format=esm --platform=node --target=node24 `
  --external:@deepseek-ai/* `
  $hostOut
if ($LASTEXITCODE -ne 0) { throw 'host bundle failed' }
node --check (Join-Path $Out 'index.js')
if ($LASTEXITCODE -ne 0) { throw 'host syntax check failed' }

Write-Host '== client bundle =='
$clientOut = '--outfile=' + (Join-Path $Out 'client.raw.js')
& $Esbuild (Join-Path $Src 'client\index.tsx') `
  --bundle --format=cjs --platform=browser --target=es2022 --jsx=automatic `
  --external:react --external:react-dom --external:react/jsx-runtime `
  --external:@deepseek-ai/* `
  $clientOut
if ($LASTEXITCODE -ne 0) { throw 'client bundle failed' }

# Wrap the raw CJS bundle as a DSH ModuleLoader plugin.
$raw     = Get-Content (Join-Path $Out 'client.raw.js') -Raw
$wrapped = @"
window.__ModuleLoader__.load({ id: "@deepseek-ai/dsh-session-notes", factory: (require) => {
  var module = { exports: {} };
  var exports = module.exports;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
$raw
  return module.exports;
} });
"@
[System.IO.File]::WriteAllText((Join-Path $Out 'client.js'), $wrapped, [System.Text.UTF8Encoding]::new($false))
node --check (Join-Path $Out 'client.js')
if ($LASTEXITCODE -ne 0) { throw 'client syntax check failed' }

Write-Host '== smoke tests =='
node (Join-Path $Root 'test\smoke.mjs')
if ($LASTEXITCODE -ne 0) { throw 'smoke tests failed' }

Write-Host 'ALL BUILD STEPS PASSED'
