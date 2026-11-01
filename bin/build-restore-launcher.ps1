[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if(-not (Test-Path -LiteralPath $compiler)){throw 'WINDOWS_FRAMEWORK_COMPILER_REQUIRED'}
$assembly=[Management.Automation.PSObject].Assembly.Location
$arguments=@('/nologo','/target:winexe','/platform:x64','/optimize+',('/reference:'+$assembly),('/win32manifest:'+(Join-Path $PSScriptRoot 'restore-launcher.manifest')),('/out:'+(Join-Path $PSScriptRoot 'restore-assistant.exe')),(Join-Path $PSScriptRoot 'restore-launcher.cs'))
& $compiler $arguments
if($LASTEXITCODE -ne 0){throw 'RECOVERY_LAUNCHER_BUILD_FAILED'}
