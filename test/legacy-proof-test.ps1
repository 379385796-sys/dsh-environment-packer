param([Parameter(Mandatory=$true)][string]$TestRoot)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '..\bin\legacy-proof.ps1')
# Mock ONLY data providers in this test process. Product code has no mock/force flag.
$script:boot=[datetime]::UtcNow.AddMilliseconds(-[double]([uint32]([long][Environment]::TickCount -band 0xffffffffL)))
$script:bootKind='0';$script:bootMode='0';$script:clockDeltas=@();$script:missingBoot=$false;$script:cimOffset=0;$script:mockProcess=$null;$script:fenceTest=$false;$script:censusCalls=0;$script:fenceSeen=$false;$script:bootVersion=1
function New-ProofEvent($Data,[int]$Record) {
  $xml='<Event><EventData>'+ (($Data.GetEnumerator()|ForEach-Object {'<Data Name="'+$_.Key+'">'+$_.Value+'</Data>'}) -join '')+'</EventData></Event>'
  $version=0;if($Record -eq 12){$version=$script:bootVersion}
  $o=[pscustomobject]@{RecordId=$Record;TimeCreated=$script:boot;Version=$version;Xml=$xml};$o|Add-Member ScriptMethod ToXml {$this.Xml};return $o
}
function Get-LegacyEvents([string]$Provider,[int]$Id,[string]$AfterRecord='0') {
 if($Id -eq 27){if($script:missingBoot){return @()};return (New-ProofEvent @{BootType=$script:bootKind} 12)}
 if($Id -eq 12){return (New-ProofEvent @{BootMode=$script:bootMode;StartTime=$script:boot.ToString('o')} 10)}
 if($Id -eq 1){$n=20;foreach($delta in $script:clockDeltas){New-ProofEvent @{OldTime=$script:boot.AddMinutes(1).ToString('o');NewTime=$script:boot.AddMinutes(1).AddMilliseconds($delta).ToString('o')} $n;$n++}}
}
function Get-CimInstance([string]$ClassName) {
 if($ClassName -eq 'Win32_OperatingSystem'){return [pscustomobject]@{LastBootUpTime=$script:boot.AddSeconds($script:cimOffset)}}
 $script:censusCalls++
 if($script:fenceTest -and $script:censusCalls -eq 2){
   $node=(Get-Command node.exe).Source
   $answer=& $node -e 'try {process.getBuiltinModule(String.fromCharCode(102,115)).readFileSync(process.argv[1]);process.exit(2)} catch(e) {console.log(e.code)}' (Join-Path $script:fixture.dir 'job.json')
   [IO.File]::WriteAllText((Join-Path $TestRoot 'legacy-fence-attempt.json'),(@{exit=$LASTEXITCODE;answer=$answer}|ConvertTo-Json))
   if($LASTEXITCODE -ne 0 -or $answer -notmatch 'EBUSY|EACCES|EPERM'){throw 'EXCLUSIVE_JOB_FENCE_FAILED'}
   $script:fenceSeen=$true
 }
 if($null -ne $script:mockProcess){return $script:mockProcess}
 return [pscustomobject]@{ProcessId=$PID;Name='powershell.exe';CommandLine='own proof test';CreationDate=$script:boot.AddSeconds(2)}
}
function New-LegacyFixture {
 $sourceHome=Join-Path $TestRoot ([guid]::NewGuid().ToString('N'));$id=[guid]::NewGuid().ToString('N');$dir=Join-Path (Join-Path $sourceHome '.packer-cold') $id
 [void][IO.Directory]::CreateDirectory($dir);$old=$script:boot.AddHours(-3);$epoch=[datetime]::Parse('1970-01-01T00:00:00Z').ToUniversalTime()
 $records=@{'job.json'=@{schema=1;id=$id;homeDir=$sourceHome;profileDir=(Join-Path $sourceHome 'profiles\source');runtime='D:\Synthetic\runtime.exe';target=(Join-Path $TestRoot 'old.zip');confirmPrivate=$true;confirmExternal=$true;hostPid=123;waitMs=600000;dshVersion='0.2.1-rc.3'};'launched.json'=@{id=$id;uiPid=124};'ready.json'=@{id=$id;uiPid=124;workerPid=125;phase='waiting'};'worker-ready.json'=@{id=$id;pid=125};'accepted.json'=@{id=$id};'status.json'=@{id=$id;phase='scanning';at=($old-$epoch).TotalMilliseconds}}
 foreach($name in $records.Keys){[IO.File]::WriteAllText((Join-Path $dir $name),($records[$name]|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))}
 $lock=Join-Path (Split-Path -Parent $dir) 'active.lock';[IO.File]::WriteAllText($lock,$id)
 @(Get-Item -LiteralPath $dir)+@(Get-ChildItem -LiteralPath $dir -Recurse -Force)+@(Get-Item -LiteralPath $lock)|ForEach-Object {$_.CreationTimeUtc=$old;$_.LastWriteTimeUtc=$old}
 return @{homeDir=$sourceHome;id=$id;dir=$dir;records=$records}
}
$results=New-Object 'System.Collections.Generic.List[string]'
function Test-Proof([string]$Name,[string]$Expected) {
 $errorCode=$null
 try {$null=Get-LegacyTaskProof $script:fixture.homeDir $script:fixture.id} catch {$errorCode=$_.Exception.Message}
 if([string]$errorCode -cne [string]$Expected){throw ($Name+': expected '+$Expected+'; got '+$errorCode)}
 $results.Add($Name)
}
$script:fixture=New-LegacyFixture
Test-Proof 'full boot, bounded clock, preboot records and no active task' $null
$script:bootVersion=9;Test-Proof 'unknown kernel event schema refuses' 'COLD_LEGACY_FULL_BOOT_UNPROVEN';$script:bootVersion=1
$script:bootKind='1';Test-Proof 'Fast Startup is not full reboot proof' 'COLD_LEGACY_FULL_BOOT_UNPROVEN'
$script:bootKind='2';Test-Proof 'hibernate/resume is not full reboot proof' 'COLD_LEGACY_FULL_BOOT_UNPROVEN'
$script:bootKind='0';$script:bootMode='1';Test-Proof 'unsupported startup mode refuses' 'COLD_LEGACY_FULL_BOOT_UNPROVEN'
$script:bootMode='0';$script:missingBoot=$true;Test-Proof 'missing startup event refuses' 'COLD_LEGACY_PROOF_UNAVAILABLE'
$script:missingBoot=$false;$script:cimOffset=600;Test-Proof 'CIM and kernel startup disagreement refuses' 'COLD_LEGACY_FULL_BOOT_UNPROVEN'
$script:cimOffset=0;$script:clockDeltas=@(2500,1,1);Test-Proof 'small cumulative NTP correction within conservative budget' $null
$script:clockDeltas=@(120000,-120000);Test-Proof 'clock rollback and correction with zero net offset still refuse' 'COLD_LEGACY_CLOCK_UNPROVEN'
$script:clockDeltas=@();$script:mockProcess=[pscustomobject]@{ProcessId=123;Name='node.exe';CommandLine='unrelated new process';CreationDate=$script:boot.AddMinutes(1)};Test-Proof 'reused PID after full boot is another process' $null
$script:mockProcess.CommandLine=$script:fixture.dir;Test-Proof 'current task reference refuses' 'COLD_TASK_RUNNING_OR_UNPROVEN'
$script:mockProcess.CommandLine='powershell -File cold-window.ps1 -TaskDirectory .\relative-task';Test-Proof 'relative task arguments cannot hide a supported old launcher' 'COLD_TASK_RUNNING_OR_UNPROVEN'
$script:mockProcess.CommandLine=$null;Test-Proof 'missing candidate command line refuses' 'COLD_IDENTITY_UNPROVEN'
$script:mockProcess=$null;$script:censusCalls=0;$script:fenceTest=$true
$null=Invoke-LegacyRecovery $script:fixture.homeDir $script:fixture.id $true
if(-not $script:fenceSeen -or -not (Test-Path -LiteralPath (Join-Path $script:fixture.dir 'recovered.lock'))){throw 'EXCLUSIVE_JOB_FENCE_NOT_TESTED'}
$results.Add('late old initializer cannot read job under exclusive fencing; retirement preserves chain')
@{status='PASS';passed=$results.Count;results=@($results);mockProviders=$true;productForceFlags=$false}|ConvertTo-Json -Depth 5
