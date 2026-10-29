param([switch]$SkipBuild, [string]$Project, [ValidateRange(1024, 65535)][int]$DatabasePort = 55434)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $workspace
$runtime = Join-Path $workspace '.local'
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
$services = [Collections.Generic.List[object]]::new()
$environmentNames = @('DATABASE_URL', 'TEST_DATABASE_URL', 'NODE_ENV', 'PORT', 'HOSTNAME', 'API_INTERNAL_URL')
$previousEnvironment = @{}
foreach ($name in $environmentNames) { $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$nodeExecutable = (Get-Command node).Source
function Invoke-Check([string[]]$Arguments) {
  & pnpm @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Check failed: pnpm $($Arguments -join ' ')" }
}
function Start-TestService([string]$Name, [string]$EntryPoint, [string]$Directory) {
  $service = Start-Process -FilePath $nodeExecutable -ArgumentList @(('"' + $EntryPoint + '"')) -WorkingDirectory $Directory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime "test-$Name.stdout.log") -RedirectStandardError (Join-Path $runtime "test-$Name.stderr.log")
  $services.Add($service)
}
function Wait-LocalUrl([string]$Url, [int]$Seconds = 120) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  do {
    try { if ((Invoke-WebRequest -Uri $Url -TimeoutSec 5 -UseBasicParsing).StatusCode -eq 200) { return } } catch { }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)
  throw "Test service did not become ready: $Url"
}
foreach ($port in @(3000, 4000)) {
  if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) { throw "Port $port is occupied. Stop the running app before this isolated test run." }
}
if (@(& docker compose -f infra/compose.yaml ps --status running -q).Count -gt 0) { throw 'Pathway infrastructure is already running. Stop it before this self-contained verification run.' }
$result = 1
try {
  # Only the test database is migrated/seeded; development learner data is untouched.
  & (Join-Path $PSScriptRoot 'local-postgres.ps1') -Action start -Port $DatabasePort
  $env:DATABASE_URL = "postgresql://pathway:pathway-local-db@127.0.0.1:$DatabasePort/pathway_test?schema=public&connection_limit=5"
  $env:TEST_DATABASE_URL = $env:DATABASE_URL
  $env:NODE_ENV = 'test'
  $env:API_INTERNAL_URL = 'http://localhost:4000'
  Invoke-Check -Arguments @('db:migrate')
  Invoke-Check -Arguments @('db:seed')
  if (-not $SkipBuild) { Invoke-Check -Arguments @('build') }
  & docker compose -f infra/compose.yaml up -d redis minio minio-init mailpit clamav
  if ($LASTEXITCODE -ne 0) { throw 'Test dependency startup failed.' }
  $apiDirectory = Join-Path $workspace 'apps/api'
  Start-TestService 'api' (Join-Path $apiDirectory 'dist/main.js') $apiDirectory
  Start-TestService 'worker' (Join-Path $apiDirectory 'dist/worker.js') $apiDirectory
  Wait-LocalUrl 'http://localhost:4000/api/v1/health/ready' 180
  Invoke-Check -Arguments @('api:generate')
  $standalone = Join-Path $workspace 'apps/web/.next/standalone/apps/web'
  if (-not (Test-Path -LiteralPath (Join-Path $standalone 'server.js'))) { throw 'Build the standalone web target before browser verification.' }
  Copy-Item -LiteralPath (Join-Path $workspace 'apps/web/public') -Destination $standalone -Recurse -Force
  New-Item -ItemType Directory -Force -Path (Join-Path $standalone '.next') | Out-Null
  Copy-Item -LiteralPath (Join-Path $workspace 'apps/web/.next/static') -Destination (Join-Path $standalone '.next') -Recurse -Force
  $env:NODE_ENV = 'production'
  $env:PORT = '3000'
  $env:HOSTNAME = '127.0.0.1'
  Start-TestService 'web' (Join-Path $standalone 'server.js') $standalone
  Wait-LocalUrl 'http://localhost:3000'
  $env:NODE_ENV = 'test'
  Invoke-Check -Arguments @('services:verify')
  $arguments = @('exec', 'playwright', 'test')
  if ($Project) { $arguments += "--project=$Project" }
  Invoke-Check -Arguments $arguments
  Invoke-Check -Arguments @('load:verify')
  # Quiesce all writers before checking the exact restored database/object snapshot.
  foreach ($service in $services) {
    if (-not $service.HasExited) { Stop-Process -Id $service.Id -ErrorAction SilentlyContinue }
  }
  Invoke-Check -Arguments @('recovery:verify')
  $result = 0
} finally {
  foreach ($service in $services) {
    if (-not $service.HasExited) { Stop-Process -Id $service.Id -ErrorAction SilentlyContinue }
  }
  & docker compose -f infra/compose.yaml down
  & (Join-Path $PSScriptRoot 'local-postgres.ps1') -Action stop
  foreach ($name in $environmentNames) { [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process') }
}
exit $result
