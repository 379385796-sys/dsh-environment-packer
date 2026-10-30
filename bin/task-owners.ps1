param([Parameter(Mandatory=$true)][string]$Directory)
$ErrorActionPreference = 'Stop'
try {
  $live = $false
  $identities = @{}
  foreach ($name in @('ui-owner.json','coordinator-owner.json')) {
    $file = Join-Path $Directory $name
    $identities[$name] = $false
    if (-not (Test-Path -LiteralPath $file)) { continue }
    $record = Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($record.pid -lt 1 -or $record.born -notmatch '^\d+$') { throw 'INVALID_OWNER' }
    try { $p = [Diagnostics.Process]::GetProcessById([int]$record.pid) }
    catch [ArgumentException] { continue }
    # Reused PID belongs to another process. Never signal it.
    if ($p.StartTime.ToUniversalTime().Ticks.ToString() -eq $record.born) { $live = $true; $identities[$name] = $true }
  }
  @{live=$live;owners=$identities} | ConvertTo-Json -Compress
} catch { exit 2 }
