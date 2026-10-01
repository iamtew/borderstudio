set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]

default:
    just --list

icon:
    magick assets/icon.png -define icon:auto-resize=256,128,64,48,32,16 assets/icon.ico

[private]
git-version:
    @$tag = git describe --tags --abbrev=0 2>$null; if ($LASTEXITCODE -ne 0) { $tag = "" } else { $tag = $tag.Trim() }; $branch = (git branch --show-current).Trim(); $hash = (git rev-parse --short HEAD).Trim(); $dirty = if (git status --porcelain) { "-dirty" } else { "" }; $meta = @(); if ($branch) { $meta += $branch }; if ($hash) { $meta += $hash }; $core = $meta -join "."; if ($tag) { if ($core) { $tag + "+" + $core + $dirty } else { $tag + $dirty } } elseif ($core) { $core + $dirty } else { "dev" }

run: icon
    $v = (just git-version).Trim(); go run "-ldflags=-X main.version=$v" .

build: icon
    New-Item -ItemType Directory -Force dist | Out-Null
    $v = (just git-version).Trim(); go run github.com/tc-hib/go-winres@latest simply --arch amd64 --manifest none --icon assets/icon.ico --product-name='Border Studio' --file-description='Border Studio' --original-filename=borderstudio.exe --product-version=$v --file-version=$v; go build "-ldflags=-H=windowsgui -X main.version=$v" -o dist/borderstudio.exe .

package: build
    Compress-Archive -Force -Path dist/borderstudio.exe, README.md -DestinationPath dist/borderstudio.zip

clean:
    if (Test-Path dist) { Remove-Item -Recurse -Force dist }
    if (Test-Path assets/icon.ico) { Remove-Item -Force assets/icon.ico }
    if (Test-Path rsrc_windows_amd64.syso) { Remove-Item -Force rsrc_windows_amd64.syso }
