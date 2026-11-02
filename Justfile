set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]

default:
    just --list

icon:
    magick assets/icon.png -define icon:auto-resize=256,128,64,48,32,16 assets/icon.ico
    Copy-Item -Force assets/icon.png docs/assets/icon.png
    Copy-Item -Force assets/icon.ico docs/favicon.ico
    New-Item -ItemType Directory -Force assets/tray | Out-Null
    foreach ($n in @("pencil","border-corners","copy","browser-x","info-circle","power","sparkles")) { $svg = (Get-Content ("web/icons/" + $n + ".svg") -Raw) -replace "currentColor", "#F0EDE4"; $tmp = Join-Path $env:TEMP ("borderstudio-" + $n + ".svg"); [System.IO.File]::WriteAllText($tmp, $svg); magick -background none -density 384 $tmp -resize 16x16 -strip ("assets/tray/" + $n + ".png") }

[private]
git-version:
    @$tag = git describe --tags --abbrev=0 2>$null; if ($LASTEXITCODE -ne 0) { $tag = "" } else { $tag = $tag.Trim() }; $branch = (git branch --show-current).Trim(); $hash = (git rev-parse --short HEAD).Trim(); $dirty = if (git status --porcelain) { "-dirty" } else { "" }; $meta = @(); if ($branch) { $meta += $branch }; if ($hash) { $meta += $hash }; $core = $meta -join "."; if ($tag) { if ($core) { $tag + "+" + $core + $dirty } else { $tag + $dirty } } elseif ($core) { $core + $dirty } else { "dev" }

run: icon
    $v = (just git-version).Trim(); go run "-ldflags=-X main.version=$v" .

build: icon
    New-Item -ItemType Directory -Force dist | Out-Null
    $v = (just git-version).Trim(); go run github.com/tc-hib/go-winres@latest simply --arch amd64 --manifest none --icon assets/icon.ico --product-name='Border Studio' --file-description='Border Studio' --original-filename=borderstudio.exe --product-version=$v --file-version=$v; go build "-ldflags=-H=windowsgui -X main.version=$v" -o dist/borderstudio.exe .

[private]
msi-version:
    @$tag = git describe --tags --abbrev=0 2>$null; if ($LASTEXITCODE -ne 0) { "0.0.0"; exit 0 }; $tag = $tag.Trim(); if ($tag -notmatch '^[0-9]') { "0.0.0" } else { $tag }

package: build
    $ver = (just msi-version).Trim(); Compress-Archive -Force -Path dist/borderstudio.exe, README.md, LICENSE -DestinationPath "dist/borderstudio-$ver-win-x64.zip"

# Zip plus per-user MSI. Version is the latest numeric git tag, or 0.0.0.
build-dist: package
    @just msi-only

# Per-user MSI from a fresh build. Needs wix on PATH: dotnet tool install -g wix
msi: build
    @just msi-only

# MSI from an existing dist/ tree (no go rebuild).
msi-only:
    if (-not (Get-Command wix -ErrorAction SilentlyContinue)) { Write-Error "wix not on PATH. Install: dotnet tool install -g wix"; exit 1 }
    $ver = (just msi-version).Trim(); $payload = (Resolve-Path dist).Path; wix build -wx -arch x64 -ext WixToolset.UI.wixext -b "payload=$payload" -d Version=$ver -o "dist/borderstudio-$ver-win-x64.msi" packaging/borderstudio.wxs; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Quit Border Studio first. A running app locks the webview folder.
reset-browsers:
    foreach ($root in @(".", "dist")) { foreach ($name in @("webview", "designer-chrome", "controller-chrome", "about-chrome")) { $p = Join-Path $root $name; if (Test-Path $p) { Remove-Item -Recurse -Force $p } } }

clean: reset-browsers
    if (Test-Path dist) { Remove-Item -Recurse -Force dist }
    if (Test-Path assets/icon.ico) { Remove-Item -Force assets/icon.ico }
    if (Test-Path assets/tray) { Remove-Item -Recurse -Force assets/tray }
    if (Test-Path rsrc_windows_amd64.syso) { Remove-Item -Force rsrc_windows_amd64.syso }
