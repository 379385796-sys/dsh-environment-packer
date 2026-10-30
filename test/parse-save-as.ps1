$ErrorActionPreference = 'Stop'

# Both picker scripts are parsed, then each dialog class is instantiated once.
# Nothing is shown: this test never opens a modal window.
foreach ($name in @('save-as.ps1', 'pick-folder.ps1')) {
  $scriptPath = Join-Path $PSScriptRoot "..\bin\$name"
  $errors = $null
  $tokens = $null
  [System.Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$tokens, [ref]$errors) | Out-Null
  if ($errors.Count -gt 0) {
    $errors | ForEach-Object {
      Write-Output ("{0} line {1}, col {2}: {3}" -f $name, $_.Extent.StartLineNumber, $_.Extent.StartColumnNumber, $_.Message)
      Write-Output ("text: " + $_.Extent.Text)
    }
    exit 1
  }
}

Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.SaveFileDialog
$dialog.Filter = 'ZIP archive (*.zip)|*.zip|All files (*.*)|*.*'
$dialog.AddExtension = $true
$dialog.OverwritePrompt = $true
$dialog.Dispose()

$folder = New-Object System.Windows.Forms.FolderBrowserDialog
$folder.ShowNewFolderButton = $true
$folder.Dispose()

Write-Output 'POWERSHELL_SAVE_DIALOG_OK'
