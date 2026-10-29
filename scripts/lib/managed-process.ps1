# Shared Windows process ownership checks for the explicit local start/stop commands.
function Get-ManagedPathwayProcess([object]$Record, [string]$Workspace) {
  if (-not $Record.processId -or -not $Record.createdAt -or -not $Record.entryPoint) { return $null }
  $entryPoint = [IO.Path]::GetFullPath([string]$Record.entryPoint)
  $workspacePrefix = $Workspace.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  if (-not $entryPoint.StartsWith($workspacePrefix, [StringComparison]::OrdinalIgnoreCase)) { return $null }
  $candidate = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$Record.processId)" -ErrorAction SilentlyContinue
  if (-not $candidate -or -not $candidate.CommandLine -or -not $candidate.ExecutablePath) { return $null }
  if ($candidate.CreationDate.ToUniversalTime().ToString('o') -ne $Record.createdAt) { return $null }
  if (-not $candidate.CommandLine.Contains($entryPoint)) { return $null }
  if (-not $candidate.ExecutablePath.Equals([string]$Record.executable, [StringComparison]::OrdinalIgnoreCase)) { return $null }
  return $candidate
}

function Stop-ManagedPathwayProcess([object]$Record, [string]$Workspace) {
  $ownedProcess = Get-ManagedPathwayProcess $Record $Workspace
  if (-not $ownedProcess) { return $false }
  # Capture descendants before stopping the parent; Next.js runs a child server.
  $allProcesses = @(Get-CimInstance Win32_Process)
  $descendants = [Collections.Generic.List[object]]::new()
  $parentIds = [Collections.Generic.Queue[int]]::new()
  $parentIds.Enqueue([int]$ownedProcess.ProcessId)
  while ($parentIds.Count -gt 0) {
    $parentId = $parentIds.Dequeue()
    foreach ($child in $allProcesses) {
      if ($child.ParentProcessId -eq $parentId -and $child.CreationDate -ge $ownedProcess.CreationDate) {
        $descendants.Add($child)
        $parentIds.Enqueue([int]$child.ProcessId)
      }
    }
  }
  Stop-Process -Id $ownedProcess.ProcessId -ErrorAction SilentlyContinue
  foreach ($child in $descendants) {
    $current = Get-CimInstance Win32_Process -Filter "ProcessId = $($child.ProcessId)" -ErrorAction SilentlyContinue
    if ($current -and $current.CreationDate -eq $child.CreationDate) {
      Stop-Process -Id $current.ProcessId -ErrorAction SilentlyContinue
    }
  }
  return $true
}
