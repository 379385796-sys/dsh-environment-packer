param(
    [Parameter(Mandatory = $true)]
    [string]$Path
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zip = [System.IO.Compression.ZipFile]::OpenRead($Path)
try {
    $names = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    $hashes = [System.Collections.Generic.Dictionary[string,string]]::new([System.StringComparer]::Ordinal)
    $lengths = @{}
    foreach ($entry in $zip.Entries) {
        $name = $entry.FullName
        if ([string]::IsNullOrWhiteSpace($name)) { throw "empty ZIP entry name" }
        if ($name.StartsWith('/') -or $name.StartsWith('\') -or $name -match '^[A-Za-z]:' -or $name.Contains('..')) {
            throw "unsafe ZIP entry: $name"
        }
        if (-not $names.Add($name)) { throw "duplicate ZIP entry: $name" }
        $stream = $entry.Open()
        try {
            $memory = New-Object System.IO.MemoryStream
            try {
                $stream.CopyTo($memory)
                $bytes = $memory.ToArray()
            } finally {
                $memory.Dispose()
            }
        } finally {
            $stream.Dispose()
        }
        $sha = [System.Security.Cryptography.SHA256]::Create()
        $lengths[$name] = $bytes.Length
        try {
            $hashes[$name] = ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
        } finally {
            $sha.Dispose()
        }
    }

    if (-not $hashes.ContainsKey('manifest.json')) { throw "manifest.json missing" }
    $reader = New-Object IO.StreamReader($zip.GetEntry('manifest.json').Open(),[Text.Encoding]::UTF8)
    try { $privateManifest=$reader.ReadToEnd()|ConvertFrom-Json } finally {$reader.Dispose()}
    if ($privateManifest.format -in @('dsh-private-recovery/2','dsh-private-recovery/3')) {
        $payload=[Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
        foreach ($file in $privateManifest.files) {
            if (-not $payload.Add($file.path) -or $file.path -eq 'manifest.json') {throw 'duplicate manifest payload'}
            if (-not $hashes.ContainsKey($file.path) -or $hashes[$file.path] -cne $file.sha256 -or $lengths[$file.path] -ne $file.bytes) {throw 'private payload hash/size mismatch'}
        }
        if ($payload.Count -ne ($hashes.Count-1)) {throw 'private entry set mismatch'}
        Write-Output ('DOTNET_PRIVATE_ZIP_OK entries='+$hashes.Count+' payloads='+$payload.Count)
        return
    }
    if (-not $hashes.ContainsKey('checksums.sha256')) { throw "checksums.sha256 missing" }
    if (-not $hashes.ContainsKey('START_HERE.md')) { throw "START_HERE.md missing" }

    $checkEntry = $zip.GetEntry('checksums.sha256')
    $reader = New-Object System.IO.StreamReader($checkEntry.Open(), [System.Text.Encoding]::UTF8)
    try { $checkText = $reader.ReadToEnd() } finally { $reader.Dispose() }
    $checked = 0
    $checkedNames = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    foreach ($line in ($checkText -split "`r?`n")) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        if ($line -notmatch '^([a-f0-9]{64})  (.+)$') { throw "bad checksum line: $line" }
        $expected = $Matches[1]
        $name = $Matches[2]
        if (-not $hashes.ContainsKey($name)) { throw "checksum refers to missing entry: $name" }
        if (-not $checkedNames.Add($name)) { throw "duplicate checksum line: $name" }
        if ($hashes[$name] -ne $expected) { throw "checksum mismatch: $name" }
        $checked++
    }
    if ($checked -eq 0) { throw "empty checksum list" }
    $expectedNames = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    foreach ($name in $hashes.Keys) {
        if ($name -ne 'checksums.sha256') { [void]$expectedNames.Add($name) }
    }
    foreach ($name in $expectedNames) {
        if (-not $checkedNames.Contains($name)) { throw "entry not covered by checksums: $name" }
    }
    foreach ($name in $checkedNames) {
        if (-not $expectedNames.Contains($name)) { throw "checksum covers unexpected entry: $name" }
    }

    $manifestEntry = $zip.GetEntry('manifest.json')
    $manifestReader = New-Object System.IO.StreamReader($manifestEntry.Open(), [System.Text.Encoding]::UTF8)
    try { $manifestText = $manifestReader.ReadToEnd() } finally { $manifestReader.Dispose() }
    $manifest = $manifestText | ConvertFrom-Json
    if ($manifest.format -ne 'dsh-environment-pack/2') { throw "unexpected manifest format" }

    Write-Output "DOTNET_ZIP_OK entries=$($hashes.Count) checksums=$checked format=$($manifest.format) complete=$($manifest.complete)"
} finally {
    $zip.Dispose()
}
