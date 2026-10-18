# SassWangpan V3 secure-ish interactive deployment helper.
# Uses local .env without echoing secrets or putting them in CLI arguments.
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
Write-Host 'SassWangpan V3 -> Supabase + R2 + Vercel' -ForegroundColor Cyan
if (-not (Get-Command python -ErrorAction SilentlyContinue)) { throw 'Python 3.11+ is required' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'Node.js and npm are required' }
if (-not (Test-Path '.env')) {
    Copy-Item '.env.example' '.env'
    Write-Host 'Created .env. Configure your Supabase/R2/Redis/email secrets locally, then rerun.' -ForegroundColor Yellow
    exit 2
}
python scripts/preflight_v3.py
if ($LASTEXITCODE -ne 0) { throw 'Preflight failed. Fix .env; do not share secrets in chat.' }

Write-Host 'Installing backend requirements in isolated .venv...' -ForegroundColor Cyan
python -m venv backend/.venv
$Py = Join-Path (Get-Location) 'backend/.venv/Scripts/python.exe'
& $Py -m pip install -r backend/requirements-prod.txt
if ($LASTEXITCODE -ne 0) { throw 'pip install failed' }

Write-Host 'Applying Supabase database migrations (up to V3)...' -ForegroundColor Cyan
Push-Location backend
try {
  & $Py -m alembic upgrade head
  if ($LASTEXITCODE -ne 0) { throw 'Migration failed; deployment aborted' }
  & $Py scripts/verify_storage_v3.py
  if ($LASTEXITCODE -ne 0) { throw 'Database self-check failed; deployment aborted' }
} finally { Pop-Location }

if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
  Write-Host 'Installing Vercel CLI...' -ForegroundColor Cyan
  npm install --global vercel
  if ($LASTEXITCODE -ne 0) { throw 'Vercel CLI installation failed' }
}

Write-Host 'Authorize Vercel if prompted, and link/create the project.' -ForegroundColor Cyan
vercel link
if ($LASTEXITCODE -ne 0) { throw 'Vercel linking failed' }
Write-Host 'IMPORTANT: Set Framework Preset to "Services" in Vercel Project Settings.' -ForegroundColor Yellow
Write-Host 'The script will set runtime environment variables for both preview and production.'

# Only propagate explicitly allowed runtime settings; never .env or local passwords to GitHub.
$Allow = @('APP_ENV','APP_NAME','APP_VERSION','FRONTEND_ORIGIN','FRONTEND_ORIGINS',
 'SESSION_SECRET','SESSION_DAYS','DATABASE_URL','REDIS_URL',
 'EMAIL_HOST','EMAIL_PORT','EMAIL_USE_SSL','EMAIL_HOST_USER','EMAIL_HOST_PASSWORD',
 'DEFAULT_FROM_EMAIL','EMAIL_CODE_TTL_SECONDS',
 'STORAGE_PROVIDER','STORAGE_BUCKET','STORAGE_ENDPOINT_URL','STORAGE_ACCESS_KEY_ID',
 'STORAGE_SECRET_ACCESS_KEY','STORAGE_REGION','STORAGE_PRESIGN_TTL_SECONDS',
 'MAX_UPLOAD_BYTES','DEFAULT_USER_STORAGE_QUOTA_BYTES','FREE_STORAGE_GLOBAL_CAP_BYTES',
 'PAYMENTS_ENABLED','SITE_ADMIN_EMAILS','STORAGE_PAYMENT_INSTRUCTIONS')
$Sensitive = @('SESSION_SECRET','DATABASE_URL','REDIS_URL','EMAIL_HOST_PASSWORD',
 'STORAGE_ACCESS_KEY_ID','STORAGE_SECRET_ACCESS_KEY')
$Config = @{}
foreach ($line in (Get-Content '.env' -Encoding UTF8)) {
  $line = $line.Trim()
  if (!$line -or $line.StartsWith('#') -or !$line.Contains('=')) { continue }
  $parts = $line.Split('=', 2)
  $key = $parts[0].Trim()
  if ($Allow -notcontains $key) { continue }
  $value = $parts[1].Trim().Trim('"').Trim("'")
  if ($value -and $value -notmatch 'YOUR_|CHANGE_TO_') { $Config[$key] = $value }
}
foreach ($target in @('preview','production')) {
 foreach ($key in ($Config.Keys | Sort-Object)) {
   $value = $Config[$key]
   $opts = @('env','add',$key,$target,'--force')
   if ($Sensitive -contains $key) { $opts += '--sensitive' }
   # Vercel CLI reads from stdin; the plaintext never appears as an argument or log.
   $value | & vercel @opts | Out-Null
   if ($LASTEXITCODE -ne 0) { throw "Cannot set $key ($target)" }
   Write-Host "Set ${key} (${target})"
 }
}
Write-Host 'Deploying Vercel preview...' -ForegroundColor Cyan
vercel deploy
if ($LASTEXITCODE -ne 0) { throw 'Preview deployment failed, inspect Vercel logs' }
$approve = Read-Host 'After checking preview routes and verifying your Vercel plan, deploy to PRODUCTION? (yes/no)'
if ($approve -ne 'yes') { Write-Host 'Preview only. Production unchanged.'; exit 0 }
vercel deploy --prod
if ($LASTEXITCODE -ne 0) { throw 'Production deployment failed' }
Write-Host 'Deployment requested. Verify /api/ping, /api/ready, sign-in, 20MiB quota, /admin/storage.' -ForegroundColor Green
