[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Version,
    [switch]$NoPause
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$releaseRoot = Join-Path $projectRoot "release"
$stagingRoot = Join-Path $releaseRoot "staging"
$packageRoot = Join-Path $stagingRoot "AccountBook"
$tauriSource = Join-Path $projectRoot "src-tauri\target\release\account-book.exe"
$distRoot = Join-Path $projectRoot "dist"
$tauriConfigPath = Join-Path $projectRoot "src-tauri\tauri.conf.json"

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
    $match = [regex]::Match($content, '(?m)^version[ \t]*=[ \t]*"([^"]+)"')
    if (-not $match.Success) {
        throw "Unable to read Cargo package version from $path"
    }
    return $match.Groups[1].Value
}

function Get-CargoLockPackageVersion([string]$path) {
    $content = Get-Content -LiteralPath $path -Raw -Encoding UTF8
    $match = [regex]::Match($content, '(?ms)^\[\[package\]\][ \t]*\r?\nname[ \t]*=[ \t]*"account-book"[ \t]*\r?\nversion[ \t]*=[ \t]*"([^"]+)"')
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

function Test-ApplicationVersion([string]$value) {
    return $value -match '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$'
}

function Resolve-RequestedVersion([string]$requestedVersion) {
    if ([string]::IsNullOrWhiteSpace($requestedVersion)) {
        return $null
    }

    $candidate = $requestedVersion.Trim()
    while ($true) {
        if (Test-ApplicationVersion $candidate) {
            return $candidate
        }

        if ($NoPause) {
            throw "版本号格式无效：'$candidate'。请输入 MAJOR.MINOR.PATCH，例如 2.1.0。"
        }

        Write-Warning "版本号格式无效：'$candidate'。版本必须是 MAJOR.MINOR.PATCH，例如 2.1.0。"
        $candidate = (Read-Host "请输入新的版本号").Trim()
    }
}

function Replace-FirstMatch([string]$path, [string]$pattern, [string]$replacement, [string]$description) {
    $encoding = New-Object System.Text.UTF8Encoding($false)
    $content = [IO.File]::ReadAllText($path, $encoding)
    $regex = [System.Text.RegularExpressions.Regex]::new(
        $pattern,
        [System.Text.RegularExpressions.RegexOptions]::Multiline
    )
    if (-not $regex.IsMatch($content)) {
        throw "无法在 $path 中找到要更新的$description"
    }

    $updated = $regex.Replace($content, $replacement, 1)
    [IO.File]::WriteAllText($path, $updated, $encoding)
}

function Sync-ApplicationVersion([string]$version, [string]$root) {
    $packageJsonPath = Join-Path $root "package.json"
    $packageLockPath = Join-Path $root "package-lock.json"
    $tauriConfigPath = Join-Path $root "src-tauri\tauri.conf.json"
    $cargoTomlPath = Join-Path $root "src-tauri\Cargo.toml"
    $cargoLockPath = Join-Path $root "src-tauri\Cargo.lock"
    $replacement = '${1}' + $version + '${2}'

    Replace-FirstMatch $packageJsonPath '(?m)^([ \t]*"version"[ \t]*:[ \t]*")[^"]+(".*)$' $replacement 'package.json 顶层版本号'
    Replace-FirstMatch $packageLockPath '(?m)^([ \t]*"version"[ \t]*:[ \t]*")[^"]+(".*)$' $replacement 'package-lock.json 顶层版本号'
    Replace-FirstMatch $packageLockPath '(?ms)(^[ \t]*"packages"[ \t]*:[ \t]*\{\r?\n[ \t]*""[ \t]*:[ \t]*\{.*?^[ \t]*"version"[ \t]*:[ \t]*")[^"]+(".*?\r?\n)' $replacement 'package-lock.json 根包版本号'
    Replace-FirstMatch $tauriConfigPath '(?m)^([ \t]*"version"[ \t]*:[ \t]*")[^"]+(".*)$' $replacement 'tauri.conf.json 顶层版本号'
    Replace-FirstMatch $cargoTomlPath '(?m)^(version[ \t]*=[ \t]*")[^"]+(".*)$' $replacement 'Cargo.toml 包版本号'
    Replace-FirstMatch $cargoLockPath '(?ms)(^\[\[package\]\][ \t]*\r?\nname[ \t]*=[ \t]*"account-book"[ \t]*\r?\nversion[ \t]*=[ \t]*")[^"]+(".*?\r?\n)' $replacement 'Cargo.lock account-book 包版本号'
}

function Get-ApplicationVersions([string]$root) {
    $packageJsonPath = Join-Path $root "package.json"
    $packageLockPath = Join-Path $root "package-lock.json"
    $tauriConfigPath = Join-Path $root "src-tauri\tauri.conf.json"
    return [PSCustomObject]@{
        PackageJson = Read-JsonValue $packageJsonPath "data.version"
        PackageLock = Read-JsonValue $packageLockPath "data.version"
        PackageLockRoot = Read-JsonValue $packageLockPath "data.packages[''].version"
        TauriConfig = Read-JsonValue $tauriConfigPath "data.version"
        CargoToml = Get-CargoPackageVersion (Join-Path $root "src-tauri\Cargo.toml")
        CargoLock = Get-CargoLockPackageVersion (Join-Path $root "src-tauri\Cargo.lock")
    }
}

function Assert-ApplicationVersions([string]$root, [string]$expectedVersion) {
    $versions = Get-ApplicationVersions $root
    Assert-Version "package.json" $versions.PackageJson $expectedVersion
    Assert-Version "package-lock.json" $versions.PackageLock $expectedVersion
    Assert-Version "package-lock.json root package" $versions.PackageLockRoot $expectedVersion
    Assert-Version "src-tauri/tauri.conf.json" $versions.TauriConfig $expectedVersion
    Assert-Version "src-tauri/Cargo.toml" $versions.CargoToml $expectedVersion
    Assert-Version "src-tauri/Cargo.lock" $versions.CargoLock $expectedVersion
}

function Invoke-PortableBuild([string]$version) {
    $zipPath = Join-Path $releaseRoot ("AccountBook-v{0}-windows-x64.zip" -f $version)

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
}

function Pause-OnError([string]$message) {
    [Console]::Error.WriteLine("错误：$message")
    if (-not $NoPause) {
        Read-Host "按 Enter 键退出" | Out-Null
    }
}

try {
    if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
        throw "未找到 Node.js。请先安装 Node.js，并确保 node.exe 位于 PATH 中。"
    }
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        throw "未找到 npm.cmd。请先安装 Node.js，并确保 npm.cmd 位于 PATH 中。"
    }
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "node_modules\.bin\tauri.cmd") -PathType Leaf)) {
        throw "缺少项目依赖：未找到 node_modules\.bin\tauri.cmd。请先在项目根目录执行 npm.cmd ci。"
    }

    $currentVersion = Read-JsonValue (Join-Path $projectRoot "package.json") "data.version"
    if ([string]::IsNullOrWhiteSpace($currentVersion)) {
        throw "package.json does not contain a version"
    }
    if (-not (Test-ApplicationVersion $currentVersion)) {
        throw "package.json 中的当前版本格式无效：'$currentVersion'。请输入 MAJOR.MINOR.PATCH。"
    }

    if ([string]::IsNullOrWhiteSpace($Version) -and -not $NoPause) {
        Write-Output "当前应用版本：$currentVersion"
        $Version = Read-Host "请输入本次发布版本号（直接回车沿用当前版本）"
    }

    $requestedVersion = Resolve-RequestedVersion $Version

    if ($requestedVersion) {
        Sync-ApplicationVersion $requestedVersion $projectRoot
        $version = $requestedVersion
        Write-Output "应用版本已同步为：$version"
    }
    else {
        $version = $currentVersion
    }

    Assert-ApplicationVersions $projectRoot $version
    Write-Output "当前应用版本：$version"

    if ((Read-JsonValue $tauriConfigPath "data.build.frontendDist") -ne "accountbook://localhost") {
        throw "Tauri frontendDist must be accountbook://localhost"
    }
    if ((Read-JsonValue $tauriConfigPath "data.bundle.active") -ne "false") {
        throw "Tauri bundling must remain disabled for the portable release"
    }

    Invoke-PortableBuild $version
}
catch {
    Pause-OnError $_.Exception.Message
    exit 1
}
