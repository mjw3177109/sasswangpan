# Publishes all source from a clean ZIP into the existing protected deployment branch.
# No force-push, no secrets, no .venv or node_modules.
$ErrorActionPreference='Stop'
$Repo='https://github.com/mjw3177109/sasswangpan.git'
$Branch='supabase-vercel-free-stack'
$Source=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Install Git for Windows first' }
$Tmp=Join-Path $env:TEMP ('sasswangpan-publish-' + [guid]::NewGuid().ToString('N'))
try {
  git clone --branch $Branch --single-branch $Repo $Tmp
  if ($LASTEXITCODE -ne 0) { throw 'Git clone failed, verify repository access' }
  robocopy $Source $Tmp /E /R:1 /W:1 /XD .git .venv node_modules __pycache__ .vercel .pytest_cache dist /XF .env .env.local *.pyc *.log
  if ($LASTEXITCODE -gt 7) { throw 'Robocopy failed' }
  Push-Location $Tmp
  try {
    git add -A
    $changes=git status --porcelain
    if (!$changes) { Write-Host 'No new changes to publish'; return }
    git commit -m 'feat: publish complete Supabase V3 source and Vercel deployment tooling'
    if ($LASTEXITCODE -ne 0) { throw 'git commit failed (check git user.name/email)' }
    git push origin $Branch
    if ($LASTEXITCODE -ne 0) { throw 'git push failed, no force push attempted' }
    Write-Host "Published source to $Repo branch $Branch" -ForegroundColor Green
  } finally { Pop-Location }
} finally { if (Test-Path $Tmp) { Remove-Item -Recurse -Force $Tmp } }
