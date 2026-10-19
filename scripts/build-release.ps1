# ==============================================================================
# Figrava Windows Release Packaging Script
# Builds production frontend, compiles release Rust binary, generates NSIS and MSI
# installers, and outputs artifacts with SHA-256 checksums into ./release
# ==============================================================================

[CmdletBinding()]
param(
    [ValidateSet("all", "nsis", "msi")]
    [string]$BundleType = "all",

    [switch]$SkipFrontendBuild
)

$ErrorActionPreference = "Stop"

$RootDir = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $RootDir

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Building Figrava Release Installers for Windows" -ForegroundColor Cyan
Write-Host " Target Bundles: $BundleType" -ForegroundColor Cyan
Write-Host " Root Directory: $RootDir" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Verify Prerequisites
Write-Host "`n[1/5] Checking build environment..." -ForegroundColor Yellow
$nodeVer = node --version
$npmVer = npm --version
$rustVer = rustc --version
Write-Host "  Node.js : $nodeVer" -ForegroundColor Green
Write-Host "  npm     : $npmVer" -ForegroundColor Green
Write-Host "  Rustc   : $rustVer" -ForegroundColor Green

# 2. Build Frontend (if not skipped)
if (-not $SkipFrontendBuild) {
    Write-Host "`n[2/5] Compiling and bundling frontend (tsc + Vite)..." -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Frontend build failed with exit code $LASTEXITCODE."
    }
} else {
    Write-Host "`n[2/5] Skipping frontend build as requested." -ForegroundColor Yellow
}

# 3. Prepare release directory
$ReleaseDir = Join-Path $RootDir "release"
if (-not (Test-Path $ReleaseDir)) {
    New-Item -ItemType Directory -Path $ReleaseDir | Out-Null
}

# 4. Run Tauri Build
Write-Host "`n[3/5] Building release binary and installer bundle(s)..." -ForegroundColor Yellow
if ($BundleType -eq "all") {
    npx tauri build
} else {
    npx tauri build --bundles $BundleType
}

if ($LASTEXITCODE -ne 0) {
    Write-Error "Tauri release packaging failed with exit code $LASTEXITCODE."
}

# 5. Collect installers into ./release
Write-Host "`n[4/5] Staging installer artifacts into ./release..." -ForegroundColor Yellow
$BundleSourceDir = Join-Path $RootDir "target\release\bundle"

$nsisFiles = @(Get-ChildItem -Path (Join-Path $BundleSourceDir "nsis") -Filter "*.exe" -ErrorAction SilentlyContinue)
$msiFiles  = @(Get-ChildItem -Path (Join-Path $BundleSourceDir "msi")  -Filter "*.msi" -ErrorAction SilentlyContinue)

$copiedArtifacts = @()

foreach ($file in ($nsisFiles + $msiFiles)) {
    if ($file) {
        $destPath = Join-Path $ReleaseDir $file.Name
        Copy-Item -Path $file.FullName -Destination $destPath -Force
        $copiedArtifacts += $destPath
        Write-Host "  Copied: $($file.Name)" -ForegroundColor Green
    }
}

# 6. Generate Checksums
Write-Host "`n[5/5] Computing SHA-256 checksums..." -ForegroundColor Yellow
$ChecksumFile = Join-Path $ReleaseDir "SHA256SUMS.txt"
$checksumLines = @()

foreach ($artifact in $copiedArtifacts) {
    $hash = (Get-FileHash -Path $artifact -Algorithm SHA256).Hash.ToLower()
    $name = Split-Path $artifact -Leaf
    $checksumLines += "$hash  $name"
}

$checksumLines | Set-Content -Path $ChecksumFile -Encoding utf8
Write-Host "  Checksum file written to: $ChecksumFile" -ForegroundColor Green

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host " Build Complete! Artifacts ready in ./release:" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Get-ChildItem -Path $ReleaseDir | Format-Table Name, Length, LastWriteTime

