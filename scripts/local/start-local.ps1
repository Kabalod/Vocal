# Starts Vocal locally for a live voice dialogue: http://localhost:3111, local Postgres in Docker, no Supabase login.
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File scripts\local\start-local.ps1   (add -Reset to recreate the local database)
# The Groq key is read by Next.js from your own .env.local (never committed). Real model and speech calls cost tokens.
param([switch]$Reset)
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..\..'))

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker is not installed or not in PATH (Docker Desktop).' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js 22 is not installed or not in PATH.' }
if (-not (Test-Path '.env.local') -or -not (Select-String -Path '.env.local' -Pattern '^\s*GROQ_API_KEY\s*=\s*\S+' -Quiet)) {
  throw 'Create .env.local in the repository root with the line GROQ_API_KEY=... (the file is git-ignored).'
}

docker compose -f docker-compose.local.yml up -d --wait
if ($LASTEXITCODE -ne 0) { throw 'docker compose failed (is Docker Desktop running?).' }
if (-not (Test-Path 'node_modules')) { npm install; if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' } }

$env:TEST_DATABASE_URL = 'postgresql://postgres:vocal_local@127.0.0.1:54329/vocal_local'
$schemaArgs = @('tsx', 'scripts/local/local-schema.ts'); if ($Reset) { $schemaArgs += '--reset' }
$url = (& npx @schemaArgs | Select-Object -Last 1)
if ($LASTEXITCODE -ne 0 -or -not $url) { throw 'Creating the local schema failed.' }

# Local test contour: no Supabase login, the local database only. A single space (not an empty string) because Windows deletes an
# empty variable, and then Next would fill it from .env; the app treats a blank value as "not set".
$env:NEXT_PUBLIC_SUPABASE_URL = ' '
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ' '
$env:SUPABASE_SERVICE_ROLE_KEY = ' '
$env:VOCAL_UI_TEST_DB = '1'
$env:VOCAL_REQUIRE_SUPABASE_AUTH = '0'
$env:TEST_DATABASE_URL = $url
$env:DATABASE_URL = $url
$env:DIRECT_URL = $url
$env:VOCAL_TEST_USER_ID = 'owner-local'
$env:VOCAL_STORAGE_ROOT = (Join-Path (Get-Location) '.local-media')
Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
Remove-Item Env:VOCAL_AI_MOCK -ErrorAction SilentlyContinue
Remove-Item Env:VOCAL_STT_MOCK -ErrorAction SilentlyContinue

Write-Host 'Open http://localhost:3111/reels  (Ctrl+C to stop). Export of a thought: npx tsx scripts/export-run.ts --thought=<id> --out=run.md'
npx next dev -p 3111
