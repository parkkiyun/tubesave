#!/bin/bash
# One-time installer; subsequent launches use ~/Applications/TubeSave.app.
# No Python, Node.js, npm, sudo, Homebrew or Xcode installation is required.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
VERSION="$(tr -d '\r\n' < "$ROOT/install/electron-version.txt")"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Invalid Electron version'; exit 1; }
[[ "$(uname -s)" == Darwin ]] || { echo 'This installer is for macOS.'; exit 1; }
[[ -f "$ROOT/app/main.cjs" ]] || { echo 'Extract the entire ZIP first.'; exit 1; }
TARGET="$HOME/Applications/TubeSave.app"
CACHE="$HOME/Library/Caches/TubeSave"
LOGDIR="$HOME/Library/Logs/TubeSave"
mkdir -p "$CACHE" "$LOGDIR" "$HOME/Applications"
if ! mkdir "$CACHE/installer.lock" 2>/dev/null; then
  echo "Another installer may be running. If it already stopped, remove only $CACHE/installer.lock and retry."; exit 1
fi
STAGE="$(mktemp -d "$CACHE/install.XXXXXX")"
BACKUP=''
cleanup() { code=$?; rm -rf "$STAGE"; rmdir "$CACHE/installer.lock" 2>/dev/null || true; if [[ $code -ne 0 ]]; then echo "설치 실패. 로그: $LOGDIR/install.log"; /usr/bin/osascript -e 'display alert "TubeSave 설치 실패" message "인터넷 연결·저장 공간·macOS 버전을 확인하세요. 설치 로그는 사용자 Library/Logs/TubeSave/install.log에 있습니다." as critical' >/dev/null 2>&1 || true; fi; }
trap cleanup EXIT
exec > >(/usr/bin/tee -a "$LOGDIR/install.log") 2>&1
/usr/bin/osascript -e 'display dialog "TubeSave 데스크톱 앱을 설치합니다.\n\n공식 Electron과 다운로드 엔진(yt-dlp·FFmpeg)을 함께 내려받고 무결성을 확인합니다. 별도의 엔진 설치는 필요하지 않습니다. 설치 위치는 사용자 Applications 폴더입니다.\n\n설치 후에는 TubeSave 앱 아이콘으로 실행합니다. Python·Node.js 별도 설치와 관리자 권한은 사용하지 않습니다." with title "TubeSave 설치" buttons {"취소", "설치"} default button "설치" cancel button "취소"' >/dev/null
if [[ -e "$TARGET" ]]; then
  ID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$TARGET/Contents/Info.plist" 2>/dev/null || true)"
  [[ "$ID" == 'local.tubesave.desktop' ]] || { echo 'An unrelated app exists at the target. Nothing was replaced.'; exit 1; }
  /usr/bin/osascript -e 'display dialog "기존 TubeSave 앱을 새 버전으로 교체합니다. 먼저 TubeSave를 종료해 주세요. 기존 앱은 별도 백업으로 남기며, 저장된 영상과 앱 데이터는 삭제하지 않습니다." with title "TubeSave 업데이트" buttons {"취소", "계속"} default button "계속" cancel button "취소"' >/dev/null
fi
ARCH=x64
if [[ "$(/usr/sbin/sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" == 1 ]]; then ARCH=arm64; fi
ASSET="electron-v${VERSION}-darwin-${ARCH}.zip"
BASE="https://github.com/electron/electron/releases/download/v${VERSION}"
fetch() { /usr/bin/curl --fail --location --proto '=https' --tlsv1.2 --retry 3 --connect-timeout 30 --max-time 1200 --output "$2" "$1"; }
echo '[1/5] Electron 다운로드'
fetch "$BASE/SHASUMS256.txt" "$STAGE/SHASUMS256.txt"
fetch "$BASE/$ASSET" "$STAGE/$ASSET"
EXPECTED="$(awk -v name="$ASSET" '$2==name || $2=="*"name {print $1; exit}' "$STAGE/SHASUMS256.txt")"
[[ "$EXPECTED" =~ ^[a-fA-F0-9]{64}$ ]] || { echo 'Missing checksum.'; exit 1; }
ACTUAL="$(/usr/bin/shasum -a 256 "$STAGE/$ASSET" | awk '{print $1}')"
[[ "$EXPECTED" == "$ACTUAL" ]] || { echo 'Checksum verification failed. Nothing was installed.'; exit 1; }
echo '[2/5] 앱 구성'
mkdir "$STAGE/unpacked"
/usr/bin/ditto -x -k "$STAGE/$ASSET" "$STAGE/unpacked"
BUNDLE="$STAGE/unpacked/Electron.app"
[[ -x "$BUNDLE/Contents/MacOS/Electron" ]] || { echo 'Electron application is missing.'; exit 1; }
MIN="$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$BUNDLE/Contents/Info.plist" 2>/dev/null || echo 12.0)"
CURRENT="$(/usr/bin/sw_vers -productVersion)"
if ! awk -v a="$CURRENT" -v b="$MIN" 'BEGIN{split(a,x,".");split(b,y,".");for(i=1;i<=3;i++){if(x[i]+0>y[i]+0)exit 0;if(x[i]+0<y[i]+0)exit 1}exit 0}'; then
  echo "This Electron runtime requires macOS $MIN or later; current version is $CURRENT."; exit 1
fi
mkdir -p "$BUNDLE/Contents/Resources/app" "$BUNDLE/Contents/Resources/electron-licenses"
/usr/bin/ditto "$ROOT/app" "$BUNDLE/Contents/Resources/app"
for FILE in LICENSE LICENSES.chromium.html; do [[ ! -f "$STAGE/unpacked/$FILE" ]] || cp "$STAGE/unpacked/$FILE" "$BUNDLE/Contents/Resources/electron-licenses/"; done
PLIST="$BUNDLE/Contents/Info.plist"
set_plist() { /usr/libexec/PlistBuddy -c "Set :$1 $2" "$PLIST" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :$1 string $2" "$PLIST"; }
set_plist CFBundleName TubeSave
set_plist CFBundleDisplayName TubeSave
set_plist CFBundleIdentifier local.tubesave.desktop
set_plist CFBundleShortVersionString 2.1.0
set_plist CFBundleVersion 210
if [[ -f "$ROOT/app/tubesave.icns" ]]; then
  cp "$ROOT/app/tubesave.icns" "$BUNDLE/Contents/Resources/tubesave.icns"
  set_plist CFBundleIconFile tubesave.icns
fi
echo '[3/5] 다운로드 엔진 함께 설치 · SHA-256 및 실행 확인'
# Build into the staged app before signing/moving. Failure leaves the old app
# unchanged. Electron supplies Node; users do not install a second runtime.
ELECTRON_RUN_AS_NODE=1 "$BUNDLE/Contents/MacOS/Electron" "$ROOT/scripts/prepare-engines.cjs" "$BUNDLE/Contents/Resources/engines"
echo '[4/5] 로컬 앱 서명 확인'
# Local ad-hoc signing repairs the modified app bundle. This is NOT Apple
# Developer ID signing or notarization and does not change Gatekeeper settings.
/usr/bin/codesign --force --deep --sign - --preserve-metadata=entitlements "$BUNDLE"
# Signing nested Mach-O tools can change their bytes. Recompute digests,
# then seal ONLY the outer app again (no second deep signing).
ELECTRON_RUN_AS_NODE=1 "$BUNDLE/Contents/MacOS/Electron" "$ROOT/scripts/refresh-engine-digests.cjs" "$BUNDLE/Contents/Resources/engines"
/usr/bin/codesign --force --sign - --preserve-metadata=entitlements "$BUNDLE"
/usr/bin/codesign --verify --deep --strict "$BUNDLE"
echo '[5/5] TubeSave 앱 설치'
if [[ -d "$TARGET" ]]; then BACKUP="$HOME/Applications/TubeSave.previous.$(date +%Y%m%d%H%M%S).app"; mv "$TARGET" "$BACKUP"; fi
if ! mv "$BUNDLE" "$TARGET"; then
  [[ -z "$BACKUP" ]] || mv "$BACKUP" "$TARGET"
  echo 'Could not move the app into place.'; exit 1
fi
printf '\n설치 완료: %s\n이제부터는 TubeSave.app 아이콘으로 실행하세요.\n' "$TARGET"
/usr/bin/open -R "$TARGET" || true
/usr/bin/open "$TARGET"
