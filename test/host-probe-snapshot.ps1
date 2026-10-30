param([Parameter(Mandatory=$true)][string]$Data64)
$ErrorActionPreference='Stop'
$data=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Data64))|ConvertFrom-Json
# Only this test process replaces CIM. The product script has no mock switch.
$script:rows=@(CimCmdlets\Get-CimInstance Win32_Process|Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CreationDate,CommandLine)
$row=$script:rows|Where-Object {$_.ProcessId -eq [int]$data.probePid}
if($data.saveRow -and $row){$row|Add-Member -NotePropertyName testCreationTicks -NotePropertyValue $row.CreationDate.ToUniversalTime().Ticks.ToString();$row|ConvertTo-Json -Depth 4|Set-Content -LiteralPath $data.saveRow -Encoding UTF8}
if($data.staleRow){$stale=Get-Content -LiteralPath $data.staleRow -Raw -Encoding UTF8|ConvertFrom-Json;$stale.CreationDate=[datetime]::new([long]$stale.testCreationTicks,[DateTimeKind]::Utc);$script:rows=@($script:rows|Where-Object {$_.ProcessId -ne [int]$data.probePid})+@($stale);$row=$stale}
if(-not $row){throw 'TEST_PROBE_ROW_REQUIRED'}
$row.CommandLine=$null;$row.ExecutablePath=$null
$global:dshPackerSnapshotRows=$script:rows
$global:dshPackerSnapshotCalls=0
function global:Get-CimInstance { [CmdletBinding()]param([string]$ClassName) $global:dshPackerSnapshotCalls++; return $global:dshPackerSnapshotRows }
& (Join-Path $PSScriptRoot '../bin/cold-processes.ps1') -HomePath $data.homeDir -RuntimePath $data.runtime -TaskId $data.id -ExcludePids ($data.coordinator.ToString()+','+$data.ui.ToString())
if($global:dshPackerSnapshotCalls -ne 1){throw 'TEST_SNAPSHOT_PROVIDER_NOT_USED'}
