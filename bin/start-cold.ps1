param([Parameter(Mandatory=$true)][string]$TaskDirectory)
$ErrorActionPreference = 'Stop'
try {
  $job = Get-Content -LiteralPath (Join-Path $TaskDirectory 'job.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($TaskDirectory.Contains('"') -or $job.id -notmatch '^[a-f0-9]{32}$') { throw 'INVALID_COLD_TASK' }
  $exe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $script = Join-Path $PSScriptRoot 'cold-window.ps1'
  if (-not (Test-Path -LiteralPath $script -PathType Leaf)) { throw 'ASSISTANT_START_FAILED' }
  # Start-Process creates a separate Windows process. Do not use -Wait or -NoNewWindow.
  $arguments = '-NoProfile -STA -ExecutionPolicy Bypass -File "' + $script + '" -TaskDirectory "' + $TaskDirectory + '"'
  $child = Start-Process -FilePath $exe -ArgumentList $arguments -WindowStyle Hidden -PassThru
  $record = @{id=$job.id;uiPid=$child.Id} | ConvertTo-Json -Compress
  $destination = Join-Path $TaskDirectory 'launched.json'
  [IO.File]::WriteAllText(($destination + '.new'),$record,[Text.Encoding]::UTF8)
  [IO.File]::Move(($destination + '.new'),$destination)
} catch { exit 1 }
