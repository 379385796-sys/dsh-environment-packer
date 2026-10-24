param(
  [string]$InitialDirectory = ''
)

$ErrorActionPreference = 'Stop'

# Picks a destination folder and prints it. It writes nothing, so the UI can use
# it to fill the target field without triggering an export.
try {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing

  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  # No UseDescriptionForTitle here: that property only exists on .NET Core and
  # later, and this script runs under Windows PowerShell 5.1 (.NET Framework).
  $dialog.Description = 'Choose the folder the DSH recovery pack is written to'
  $dialog.ShowNewFolderButton = $true

  $start = $InitialDirectory
  if ([string]::IsNullOrWhiteSpace($start) -or -not (Test-Path -LiteralPath $start -PathType Container)) {
    $start = [Environment]::GetFolderPath('MyDocuments')
  }
  if ([string]::IsNullOrWhiteSpace($start) -or -not (Test-Path -LiteralPath $start -PathType Container)) {
    $start = $env:USERPROFILE
  }
  if (-not [string]::IsNullOrWhiteSpace($start)) {
    $dialog.SelectedPath = $start
  }

  # A tiny topmost owner keeps the dialog in front when the host process is
  # running in the background. The owner is transparent and has no taskbar entry.
  $owner = New-Object System.Windows.Forms.Form
  $owner.FormBorderStyle = 'None'
  $owner.ShowInTaskbar = $false
  $owner.TopMost = $true
  $owner.StartPosition = 'CenterScreen'
  $owner.Size = New-Object System.Drawing.Size(1, 1)
  $owner.Opacity = 0

  $selected = $null
  try {
    $owner.Show()
    $owner.Activate()
    [System.Windows.Forms.Application]::DoEvents()
    $result = $dialog.ShowDialog($owner)
    if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
      $selected = $dialog.SelectedPath
    }
  } finally {
    $dialog.Dispose()
    $owner.Close()
    $owner.Dispose()
  }

  if (-not [string]::IsNullOrWhiteSpace($selected)) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($selected)
    [Console]::Out.Write([Convert]::ToBase64String($bytes))
  }
  exit 0
} catch {
  [Console]::Error.Write($_.Exception.Message)
  exit 1
}
