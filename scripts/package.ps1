$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$outputDir = Join-Path $projectRoot 'output'
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
$bundlePath = Join-Path $outputDir 'prooflot-testnet-mvp.zip'
$bundleFiles = @()
foreach ($folder in @('src','public','docs','scripts','tests','examples')) {
    $bundleFiles += Get-ChildItem -LiteralPath (Join-Path $projectRoot $folder) -File -Recurse -Force
}
foreach ($file in @('README.md','LICENSE','package.json','package-lock.json','start.ps1','.env.example','.gitignore','contracts/Cargo.toml','contracts/Cargo.lock','contracts/README.md','contracts/.cargo/config.toml','contracts/src/lib.rs','contracts/build/agentproof_registry.wasm')) {
    $bundleFiles += Get-Item -LiteralPath (Join-Path $projectRoot $file) -Force
}
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$stream = [IO.File]::Open($bundlePath,[IO.FileMode]::Create)
$archive = [IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in $bundleFiles) {
        $fullPath = [IO.Path]::GetFullPath($file.FullName)
        if (-not $fullPath.StartsWith($projectRoot + '\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Source escaped workspace' }
        $entry = $fullPath.Substring($projectRoot.Length + 1).Replace('\','/')
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$fullPath,$entry,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally { $archive.Dispose(); $stream.Dispose() }
Write-Output $bundlePath
