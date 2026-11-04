param([string]$File,[string]$Ready,[string]$Release)
$ErrorActionPreference='Stop'
$stream=[IO.File]::Open($File,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None)
try{[IO.File]::WriteAllText($Ready,'ready');while(-not(Test-Path -LiteralPath $Release)){Start-Sleep -Milliseconds 50}}finally{$stream.Dispose()}
