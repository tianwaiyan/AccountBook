$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$releaseRoot = Join-Path $projectRoot "release"
$stagingRoot = Join-Path $releaseRoot "staging"
$packageRoot = Join-Path $stagingRoot "AccountBook"
$zipPath = $null
$tauriSource = Join-Path $projectRoot "src-tauri\target\release\account-book.exe"
$distRoot = Join-Path $projectRoot "dist"

function Read-JsonValue([string]$path, [string]$expression) {
    $nodeScript = @"
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
const value = $expression;
if (value === undefined || value === null) process.exit(2);
process.stdout.write(String(value));
"@
    $output = & node.exe -e $nodeScript -- $path
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to read JSON value '$expression' from $path"
    }
    return ($output -join "").Trim()
}

function Get-CargoPackageVersion([string]$path) {
    $content = Get-Content -LiteralPath $path -Raw -Encoding UTF8
    $match = [regex]::Match($content, '(?m)^version\s*=\s*"([^"]+)"')
    if (-not $match.Success) {
        throw "Unable to read Cargo package version from $path"
    }
    return $match.Groups[1].Value
}

function Get-CargoLockPackageVersion([string]$path) {
    $content = Get-Content -LiteralPath $path -Raw -Encoding UTF8
    $match = [regex]::Match($content, '(?ms)^\[\[package\]\]\s*name = "account-book"\s*version = "([^"]+)"')
    if (-not $match.Success) {
        throw "Unable to read account-book version from $path"
    }
    return $match.Groups[1].Value
}

function Assert-Version([string]$name, [string]$actual, [string]$expected) {
    if ($actual -ne $expected) {
        throw "Version mismatch: $name is $actual, expected $expected"
    }
}

$packageJsonPath = Join-Path $projectRoot "package.json"
$packageLockPath = Join-Path $projectRoot "package-lock.json"
$tauriConfigPath = Join-Path $projectRoot "src-tauri\tauri.conf.json"
$version = Read-JsonValue $packageJsonPath "data.version"
$zipPath = Join-Path $releaseRoot ("AccountBook-v{0}-windows-x64.zip" -f $version)

if ([string]::IsNullOrWhiteSpace($version)) {
    throw "package.json does not contain a version"
}

Assert-Version "package-lock.json" (Read-JsonValue $packageLockPath "data.version") $version
Assert-Version "package-lock.json root package" (Read-JsonValue $packageLockPath "data.packages[''].version") $version
Assert-Version "src-tauri/tauri.conf.json" (Read-JsonValue $tauriConfigPath "data.version") $version
Assert-Version "src-tauri/Cargo.toml" (Get-CargoPackageVersion (Join-Path $projectRoot "src-tauri\Cargo.toml")) $version
Assert-Version "src-tauri/Cargo.lock" (Get-CargoLockPackageVersion (Join-Path $projectRoot "src-tauri\Cargo.lock")) $version

if ((Read-JsonValue $tauriConfigPath "data.build.frontendDist") -ne "accountbook://localhost") {
    throw "Tauri frontendDist must be accountbook://localhost"
}
if ((Read-JsonValue $tauriConfigPath "data.bundle.active") -ne "false") {
    throw "Tauri bundling must remain disabled for the portable release"
}

Push-Location $projectRoot
try {
    & npm.cmd run tauri:build:portable
    if ($LASTEXITCODE -ne 0) {
        throw "Tauri portable build failed with exit code $LASTEXITCODE"
    }

    if (-not (Test-Path -LiteralPath $tauriSource -PathType Leaf)) {
        throw "Tauri executable was not generated: $tauriSource"
    }
    if (-not (Test-Path -LiteralPath (Join-Path $distRoot "index.html") -PathType Leaf)) {
        throw "Frontend build output is missing: $(Join-Path $distRoot 'index.html')"
    }

    if (Test-Path -LiteralPath $stagingRoot) {
        Remove-Item -LiteralPath $stagingRoot -Recurse -Force
    }
    if (Test-Path -LiteralPath $zipPath) {
        Remove-Item -LiteralPath $zipPath -Force
    }

    New-Item -ItemType Directory -Path (Join-Path $packageRoot "resources\web") -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $packageRoot "data") -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $packageRoot "backups") -Force | Out-Null

    Copy-Item -LiteralPath $tauriSource -Destination (Join-Path $packageRoot "AccountBook.exe") -Force
    Get-ChildItem -LiteralPath $distRoot -Force | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $packageRoot "resources\web") -Recurse -Force
    }
    Copy-Item -LiteralPath (Join-Path $projectRoot "README.md") -Destination (Join-Path $packageRoot "README.md") -Force
    Copy-Item -LiteralPath (Join-Path $projectRoot "data\.gitkeep") -Destination (Join-Path $packageRoot "data\.gitkeep") -Force
    Copy-Item -LiteralPath (Join-Path $projectRoot "backups\.gitkeep") -Destination (Join-Path $packageRoot "backups\.gitkeep") -Force

    $webRoot = (Resolve-Path -LiteralPath (Join-Path $packageRoot "resources\web")).Path.TrimEnd('\') + '\'
    $manifestFiles = Get-ChildItem -LiteralPath $webRoot -File -Recurse |
        ForEach-Object {
            $relativePath = $_.FullName.Substring($webRoot.Length).Replace('\', '/')
            [PSCustomObject]@{
                path = $relativePath
                sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
            }
        } |
        Sort-Object -Property path

    $manifest = [PSCustomObject]@{
        formatVersion = 1
        appVersion = $version
        files = @($manifestFiles)
    }
    $manifestJson = $manifest | ConvertTo-Json -Depth 4
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText(
        (Join-Path $packageRoot "resources\manifest.json"),
        $manifestJson,
        $utf8NoBom
    )

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::CreateFromDirectory(
        $stagingRoot,
        $zipPath,
        [IO.Compression.CompressionLevel]::Optimal,
        $false
    )

    Write-Output "Portable staging directory created: $packageRoot"
    Write-Output "Portable ZIP created: $zipPath"
}
finally {
    Pop-Location
}
