param([switch]$NativeDatabase, [switch]$SkipInfrastructure, [switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
. (Join-Path $PSScriptRoot 'lib/managed-process.ps1')
Set-Location -LiteralPath $workspace
$runtime = Join-Path $workspace '.local'
New-Item -ItemType Directory -Path $runtime -Force | Out-Null
if (-not (Test-Path -LiteralPath 'apps/api/.env')) { throw 'Copy .env.example to apps/api/.env and configure it first.' }
if ($NativeDatabase) { & (Join-Path $PSScriptRoot 'local-postgres.ps1') -Action start }
if (-not $SkipInfrastructure) {
  & docker compose -f infra/compose.yaml up -d
  if ($LASTEXITCODE -ne 0) { throw 'Infrastructure startup failed. Start Docker Desktop, then retry.' }
}
if (-not $SkipBuild) {
  & pnpm --filter '@pathway/api' build
  if ($LASTEXITCODE -ne 0) { throw 'API build failed.' }
}
$nodeExecutable = (Get-Command node -ErrorAction Stop).Source
$startedRecords = [Collections.Generic.List[object]]::new()
function Start-PathwayService([string]$Name, [string]$WorkingDirectory, [string[]]$Arguments, [int]$Port = 0) {
  $existingFile = Join-Path $runtime "$Name.pid.json"
  if (Test-Path -LiteralPath $existingFile) {
    $existing = Get-Content -LiteralPath $existingFile -Raw | ConvertFrom-Json
    if (Get-ManagedPathwayProcess $existing $workspace) { Write-Host "$Name is already running."; return }
  }
  if ($Port -and (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)) {
    throw "$Name cannot start: port $Port is occupied by a process not owned by this start script."
  }
  $entryPoint = [IO.Path]::GetFullPath($Arguments[0].Trim('"'))
  $argumentsForProcess = @('"' + $entryPoint + '"') + @($Arguments | Select-Object -Skip 1)
  $serviceProcess = Start-Process -FilePath $nodeExecutable -ArgumentList $argumentsForProcess -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime "$Name.stdout.log") -RedirectStandardError (Join-Path $runtime "$Name.stderr.log")
  $identity = Get-CimInstance Win32_Process -Filter "ProcessId = $($serviceProcess.Id)"
  if (-not $identity) { throw "$Name exited during startup. Inspect .local/$Name.stderr.log." }
  $record = @{ name = $Name; processId = $serviceProcess.Id; entryPoint = $entryPoint; executable = $nodeExecutable; createdAt = $identity.CreationDate.ToUniversalTime().ToString('o') }
  $record | ConvertTo-Json | Set-Content -LiteralPath $existingFile
  $startedRecords.Add($record)
  Write-Host "$Name started (PID $($serviceProcess.Id))."
}
$apiDirectory = Join-Path $workspace 'apps/api'
try {
  Start-PathwayService 'api' $apiDirectory @((Join-Path $apiDirectory 'dist/main.js')) 4000
  Start-PathwayService 'worker' $apiDirectory @((Join-Path $apiDirectory 'dist/worker.js'))
  $nextExecutable = Join-Path $workspace 'apps/web/node_modules/next/dist/bin/next'
  Start-PathwayService 'web' (Join-Path $workspace 'apps/web') @($nextExecutable, 'dev', '--hostname', '127.0.0.1', '--port', '3000') 3000
} catch {
  foreach ($record in $startedRecords) { [void](Stop-ManagedPathwayProcess $record $workspace) }
  throw
}
Write-Host 'Frontend: http://localhost:3000 | API: http://localhost:4000/api/v1/docs'
Write-Host 'Logs: .local/{api,worker,web}.{stdout,stderr}.log. Services run independently of this terminal.'
