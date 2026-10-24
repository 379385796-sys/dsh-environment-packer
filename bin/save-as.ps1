param(
  [string]$DefaultName = 'dsh-environment.zip'
)

$ErrorActionPreference = 'Stop'

try {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing

  $dialog = New-Object System.Windows.Forms.SaveFileDialog
  $dialog.Title = 'Save DSH Environment ZIP'
  $dialog.Filter = 'ZIP archive (*.zip)|*.zip|All files (*.*)|*.*'
  $dialog.DefaultExt = 'zip'
  $dialog.AddExtension = $true
  $dialog.OverwritePrompt = $false
  $dialog.CheckFileExists = $false
  $dialog.CheckPathExists = $true
  $dialog.ValidateNames = $true
  $dialog.AutoUpgradeEnabled = $true
  $dialog.RestoreDirectory = $true
  $initialDirectory = [Environment]::GetFolderPath('MyDocuments')
  if ([string]::IsNullOrWhiteSpace($initialDirectory) -or -not (Test-Path -LiteralPath $initialDirectory)) {
    $initialDirectory = $env:USERPROFILE
  }
  if (-not [string]::IsNullOrWhiteSpace($initialDirectory)) {
    $dialog.InitialDirectory = $initialDirectory
  }
  $dialog.FileName = [System.IO.Path]::GetFileName($DefaultName)

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
    # The host process runs in the background; without an explicit activation
    # the modal dialog can open behind other top-level windows.
    $owner.Activate()
    [System.Windows.Forms.Application]::DoEvents()
    $result = $dialog.ShowDialog($owner)
    if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
      $selected = $dialog.FileName
    }
  } finally {
    $dialog.Dispose()
    $owner.Close()
    $owner.Dispose()
  }

  if ($selected) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($selected)
    [Console]::Out.Write([Convert]::ToBase64String($bytes))
  }
  exit 0
} catch {
  [Console]::Error.Write($_.Exception.Message)
  exit 1
}
