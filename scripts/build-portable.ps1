$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $projectRoot "src-tauri\target\release\account-book.exe"
$target = Join-Path $projectRoot "AccountBook.exe"

$runningInstances = Get-CimInstance Win32_Process -Filter "Name = 'AccountBook.exe'" |
    Where-Object { $_.ExecutablePath -and $_.ExecutablePath.Equals($target, [System.StringComparison]::OrdinalIgnoreCase) }
foreach ($instance in $runningInstances) {
    Stop-Process -Id $instance.ProcessId -Force -ErrorAction Stop
    Wait-Process -Id $instance.ProcessId -ErrorAction SilentlyContinue
    Write-Output "Closed running AccountBook.exe process: $($instance.ProcessId)"
}

Push-Location $projectRoot
try {
    & npm.cmd run tauri:build:portable
    if ($LASTEXITCODE -ne 0) {
        throw "Tauri portable build failed with exit code $LASTEXITCODE"
    }

    try {
        Copy-Item -LiteralPath $source -Destination $target -Force
    }
    catch {
        throw "Unable to replace $target. Close any running AccountBook.exe instance and run the build again. $($_.Exception.Message)"
    }

    Write-Output "Portable executable created: $target"
}
finally {
    Pop-Location
}
