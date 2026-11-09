# Run only inside the bridge holding operation.guard. No recovery operation
# calls this code, and no recorded output/source path is opened for deletion.
function Test-PackerRetiredOwner($Record) {
  if (($Record.pid -isnot [int] -and $Record.pid -isnot [long]) -or $Record.pid -lt 1 -or $Record.pid -gt [int]::MaxValue -or
      $Record.born -isnot [string] -or $Record.born -cnotmatch '^\d{18}$') { return $false }
  try { $process=[Diagnostics.Process]::GetProcessById([int]$Record.pid) }
  catch [ArgumentException] { return $true }
  try { return ($process.StartTime.ToUniversalTime().Ticks.ToString() -cne $Record.born) }
  finally { $process.Dispose() }
}

function Remove-PackerRetiredTask($Root, [string]$SourceHome, [string]$Id, [DateTime]$Cutoff) {
  $dir=$null;$files=@{};$identities=@{};$sealName='retention-v1.json';$tmp=$null
  $jsonNames=@('job.json','terminal.json','status.json','accepted.json','launched.json','ready.json','worker-ready.json',
    'exit-confirmed.json','ui-result.json','dependency-check.json','lease-request.private.json','lease-ready.json','committed.json')
  $otherNames=@('task.guard','released.lock','ui-owner.json','coordinator-owner.json','lease-failed.json',
    'cancel','events.ndjson','runtime.stdout.log','runtime.stderr.log',$sealName)
  try {
    $dir=$Root.OpenChild($Id,$true,$true)
    $names=$dir.Names()
    foreach($name in $names){
      if($name -ceq 'tmp'){
        $tmp=$dir.OpenChild($name,$true,$true)
        if($tmp.Names().Length -ne 0){return $false}
        $identities[$name]=$tmp.Identity
        continue
      }
      if($name -cnotin $jsonNames -and $name -cnotin $otherNames -and $name -cnotmatch '^host-probe-(?:live-)?[a-f0-9]{32}\.json$'){return $false}
      $files[$name]=$dir.OpenChild($name,$false,$true)
      if($name -cne $sealName){
        if($files[$name].LastWriteUtc -gt $Cutoff){return $false}
        $identities[$name]=$files[$name].Identity
      }
    }
    # On retry a seal can authorize only this exact directory and task ID.
    # A missing/truncated seal cannot turn an interrupted task into a candidate.
    if($files.ContainsKey($sealName)){
      $seal=$files[$sealName].ReadText(65536)|ConvertFrom-Json
      if($seal.schema -isnot [int] -or $seal.schema -ne 1 -or $seal.id -isnot [string] -or $seal.id -cne $Id -or
        $seal.directory -isnot [string] -or $seal.directory -cne $dir.Identity -or
        ($seal.at -isnot [int] -and $seal.at -isnot [long]) -or $seal.at -le 0 -or $seal.at -gt ([DateTimeOffset]$Cutoff).ToUnixTimeMilliseconds()){return $false}
      foreach($name in $identities.Keys){
        if($seal.files.$name -isnot [string] -or $seal.files.$name -cne $identities[$name]){return $false}
      }
    }else{
      foreach($required in @('job.json','terminal.json','status.json','released.lock','task.guard','ui-owner.json','coordinator-owner.json')){
        if(-not $files.ContainsKey($required)){return $false}
      }
      if($files['released.lock'].ReadText(64) -cne $Id){return $false}
      $records=@{}
      foreach($name in $jsonNames){
        if(-not $files.ContainsKey($name)){continue}
        $record=$files[$name].ReadText(33554432)|ConvertFrom-Json
        if($record.id -isnot [string] -or $record.id -cne $Id){return $false}
        $records[$name]=$record
      }
      foreach($name in $names){
        if($name -cmatch '^host-probe-(?:live-)?([a-f0-9]{32})\.json$'){
          $nonce=$Matches[1];$proof=$files[$name].ReadText(33554432)|ConvertFrom-Json
          if($proof.id -isnot [string] -or $proof.id -cne $Id -or $proof.nonce -isnot [string] -or $proof.nonce -cne $nonce){return $false}
        }
      }
      $job=$records['job.json'];$terminal=$records['terminal.json'];$status=$records['status.json'];$receipt=$records['ui-result.json']
      if($job.schema -isnot [int] -or $job.schema -ne 1 -or $job.lockProtocol -isnot [int] -or $job.lockProtocol -ne 2 -or
        $job.homeDir -isnot [string] -or $job.homeDir -ine $SourceHome -or $job.confirmPrivate -isnot [bool] -or -not $job.confirmPrivate -or
        $job.target -isnot [string] -or -not [IO.Path]::IsPathRooted($job.target) -or [IO.Path]::GetExtension($job.target) -ine '.zip' -or
        $terminal.target -isnot [string] -or $terminal.target -cne $job.target -or $status.target -isnot [string] -or $status.target -cne $job.target -or
        $terminal.phase -isnot [string] -or $terminal.phase -cnotin @('success','failed') -or $status.phase -isnot [string] -or $status.phase -cne $terminal.phase -or
        ($terminal.at -isnot [int] -and $terminal.at -isnot [long]) -or $terminal.at -le 0 -or
        $terminal.at -gt ([DateTimeOffset]$Cutoff).ToUnixTimeMilliseconds() -or $status.at -ne $terminal.at){return $false}
      if($null -ne $receipt -and ($receipt.outcome -cnotin @('success','failed','cancelled') -or $receipt.phase -cne $terminal.phase -or
        ($receipt.outcome -ceq 'success') -ne ($terminal.phase -ceq 'success') -or $receipt.workerExited -ne $true -or
        $receipt.sourceLeasesReleased -ne $true -or $receipt.target -cne $job.target)){return $false}
      $commit=$records['committed.json']
      if($terminal.phase -ceq 'success'){
        if($terminal.verified -ne $true -or $terminal.cleanup -ne $true -or $status.verified -ne $true -or $status.cleanup -ne $true -or
          $terminal.sha256 -cnotmatch '^[a-f0-9]{64}$' -or $status.sha256 -cne $terminal.sha256 -or
          $commit.verified -ne $true -or $commit.sha256 -cne $terminal.sha256 -or $commit.path -cne $job.target){return $false}
      }elseif($null -ne $commit -or $files.ContainsKey('lease-request.private.json') -or $files.ContainsKey('lease-ready.json') -or
        $terminal.error -cnotmatch '^[A-Z][A-Z0-9_]+$' -or $status.error -cne $terminal.error){return $false}
      $seal=@{schema=1;id=$Id;directory=$dir.Identity;at=$terminal.at;files=$identities}
    }
    foreach($name in @('ui-owner.json','coordinator-owner.json')){
      if($files.ContainsKey($name) -and -not (Test-PackerRetiredOwner ($files[$name].ReadText(2048)|ConvertFrom-Json))){return $false}
    }
    # Recheck the set after opening every handle. Unknown entries, archives,
    # recovery tombstones and non-empty scratch directories veto the whole task.
    if(Compare-Object @($names|Sort-Object) @($dir.Names()|Sort-Object) -CaseSensitive){return $false}
    if(-not $files.ContainsKey($sealName)){
      $writer=$dir.CreateFile($sealName)
      try{$writer.Write([Text.Encoding]::UTF8.GetBytes(($seal|ConvertTo-Json -Compress)),$true)}finally{$writer.Dispose()}
      $files[$sealName]=$dir.OpenChild($sealName,$false,$true)
    }
    foreach($name in $names){
      if($name -cin @('tmp','task.guard',$sealName)){continue}
      $files[$name].Remove();$files[$name].Dispose()
    }
    if($null -ne $tmp){$tmp.Remove();$tmp.Dispose();$tmp=$null}
    if($files.ContainsKey('task.guard')){$files['task.guard'].Remove();$files['task.guard'].Dispose()}
    # Never recursively delete. If an unexpected entry appeared, leave the
    # seal and that entry untouched for the next conservative check.
    if(@($dir.Names()|Where-Object {$_ -cne $sealName}).Count -ne 0){return $false}
    $files[$sealName].Remove();$files[$sealName].Dispose()
    $dir.Remove()
    return $true
  }catch{return $false}
  finally{
    foreach($handle in $files.Values){$handle.Dispose()}
    if($null -ne $tmp){$tmp.Dispose()}
    if($null -ne $dir){$dir.Dispose()}
  }
}

function Invoke-PackerRetention([string]$SourceHome, [string]$GuardPath, $Guard, [long]$Now) {
  if($GuardPath -ine [IO.Path]::Combine($SourceHome,'.packer-cold','operation.guard')){throw 'RETENTION_GUARD_MISMATCH'}
  if(-not ('RetentionHandle' -as [type])){Add-Type -Path (Join-Path $PSScriptRoot 'retention-handles.cs')}
  $root=[RetentionHandle]::OpenDirectory([IO.Path]::Combine($SourceHome,'.packer-cold'))
  try{
    if(-not [RetentionHandle]::MatchesOpenFile($Guard.SafeFileHandle,$GuardPath)){throw 'RETENTION_GUARD_MISMATCH'}
    if($root.Names() -icontains 'active.lock'){return 0}
    $cutoff=[DateTimeOffset]::FromUnixTimeMilliseconds($Now).UtcDateTime.AddDays(-10)
    $removed=0
    foreach($name in $root.Names()){
      if($name -cmatch '^[a-f0-9]{32}$' -and (Remove-PackerRetiredTask $root $SourceHome $name $cutoff)){$removed++}
    }
    return $removed
  }finally{$root.Dispose()}
}
