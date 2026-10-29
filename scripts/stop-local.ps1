param([switch]$Infrastructure, [switch]$NativeDatabase)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
. (Join-Path $PSScriptRoot 'lib/managed-process.ps1')
$runtime = Join-Path $workspace '.local'
foreach ($name in @('web', 'worker', 'api')) {
  $recordPath = Join-Path $runtime "$name.pid.json"
  if (-not (Test-Path -LiteralPath $recordPath)) { continue }
  $record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
  if (Stop-ManagedPathwayProcess $record $workspace) {
    Write-Host "$name stopped."
  }
  Remove-Item -LiteralPath $recordPath
}
if ($Infrastructure) {
  & docker compose -f (Join-Path $workspace 'infra/compose.yaml') -f (Join-Path $workspace 'infra/compose.app.yaml') down
  if ($LASTEXITCODE -ne 0) { throw 'Compose shutdown failed; inspect Docker Desktop status.' }
}
if ($NativeDatabase) { & (Join-Path $PSScriptRoot 'local-postgres.ps1') -Action stop }
Write-Host 'Managed application processes stopped. Named data volumes were preserved.'
