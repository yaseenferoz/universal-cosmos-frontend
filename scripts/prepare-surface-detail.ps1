# Original CC0 2K samples; no resampling or invented detail.
$ErrorActionPreference = 'Stop'
$assetRoot = Join-Path (Split-Path $PSScriptRoot -Parent) 'public/textures'
$records = @()
foreach ($asset in 'dry_ground_rocks','rock_boulder_dry') {
  $metadata = Invoke-RestMethod -Uri "https://api.polyhaven.com/files/$asset"
  foreach ($channel in @{color='Diffuse'; height='Displacement'}.GetEnumerator()) {
    $source = $metadata.($channel.Value).'2k'.jpg
    $name = "$asset-$($channel.Key)-2048.jpg"
    $target = Join-Path $assetRoot $name
    Invoke-WebRequest -UseBasicParsing -Uri $source.url -OutFile $target
    if ((Get-Item -LiteralPath $target).Length -ne $source.size -or
        (Get-FileHash -LiteralPath $target -Algorithm MD5).Hash -ne $source.md5) {
      throw "Source checksum/length mismatch: $name"
    }
    $records += [pscustomobject]@{file=$name; source=$source.url; bytes=$source.size;
      sha256=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLower();
      license='CC0'; assetPage="https://polyhaven.com/a/$asset"}
  }
}
$records | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $assetRoot 'surface-detail-sources.json')
$records | Select-Object file,bytes
