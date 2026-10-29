param(
  [ValidateSet('start', 'stop', 'status')][string]$Action = 'start',
  [ValidateRange(1024, 65535)][int]$Port = 55432
)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$cluster = Join-Path $workspace '.local\postgres'
$binaries = 'C:\Program Files\PostgreSQL\18\bin'
$control = Join-Path $binaries 'pg_ctl.exe'
if (-not (Test-Path -LiteralPath $control)) { throw 'Install PostgreSQL 18 or use Docker Compose.' }
if ($Action -eq 'start') {
  if (-not (Test-Path -LiteralPath (Join-Path $cluster 'PG_VERSION'))) {
    New-Item -ItemType Directory -Force -Path (Join-Path $workspace '.local') | Out-Null
    $passwordFile = Join-Path $workspace '.local\pg-password.tmp'
    'pathway-local-db' | Set-Content -LiteralPath $passwordFile -NoNewline
    try {
      & (Join-Path $binaries 'initdb.exe') -D $cluster -U pathway --auth-host=scram-sha-256 --auth-local=trust --encoding=UTF8 --locale=C "--pwfile=$passwordFile"
      if ($LASTEXITCODE -ne 0) { throw 'Database initialization failed.' }
    }
    finally { Remove-Item -LiteralPath $passwordFile }
  }
  & $control -D $cluster status
  if ($LASTEXITCODE -eq 0) {
    $activePort = [int](Get-Content -LiteralPath (Join-Path $cluster 'postmaster.pid'))[3]
    if ($activePort -ne $Port) { throw "This isolated cluster is already running on port $activePort. Use -Port $activePort, or stop it first." }
  } else {
    & $control -D $cluster -l (Join-Path $workspace '.local\postgres.log') -o "-p $Port -h 127.0.0.1" start
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL startup failed on port $Port. Inspect .local/postgres.log; no database URL is ready." }
  }
  & (Join-Path $binaries 'pg_isready.exe') -h 127.0.0.1 -p $Port -U pathway
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL has not confirmed readiness.' }
  Write-Host "Local database URL: postgresql://pathway:pathway-local-db@127.0.0.1:$Port/pathway?schema=public&connection_limit=5"
} elseif ($Action -eq 'stop') {
  & $control -D $cluster status
  if ($LASTEXITCODE -eq 0) {
    & $control -D $cluster -m fast stop
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL did not stop successfully.' }
  }
} else {
  & $control -D $cluster status
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
