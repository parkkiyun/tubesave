#!/bin/bash
set -euo pipefail
# CI only. Secret environment variables are never echoed. Delete this temporary
# keychain in the workflow's always() cleanup step.
: "${MAC_CERTIFICATE_BASE64:?}" "${MAC_CERTIFICATE_PASSWORD:?}" "${CSC_NAME:?}" "${APPLE_ID:?}" "${APPLE_APP_SPECIFIC_PASSWORD:?}" "${APPLE_TEAM_ID:?}" "${RUNNER_TEMP:?}" "${GITHUB_ENV:?}"
KEYCHAIN="$RUNNER_TEMP/tubesave-signing.keychain-db"
CERT="$RUNNER_TEMP/tubesave-certificate.p12"
PASSWORD="$(openssl rand -hex 24)"
printf '%s' "$MAC_CERTIFICATE_BASE64" | /usr/bin/base64 -D > "$CERT"
/usr/bin/security create-keychain -p "$PASSWORD" "$KEYCHAIN"
/usr/bin/security set-keychain-settings -lut 21600 "$KEYCHAIN"
/usr/bin/security unlock-keychain -p "$PASSWORD" "$KEYCHAIN"
/usr/bin/security import "$CERT" -P "$MAC_CERTIFICATE_PASSWORD" -k "$KEYCHAIN" -T /usr/bin/codesign -T /usr/bin/security >/dev/null
/usr/bin/security set-key-partition-list -S apple-tool:,apple: -s -k "$PASSWORD" "$KEYCHAIN" >/dev/null
/usr/bin/security list-keychains -d user -s "$KEYCHAIN" "$HOME/Library/Keychains/login.keychain-db"
/usr/bin/xcrun notarytool store-credentials TubeSave-notary --keychain "$KEYCHAIN" --apple-id "$APPLE_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD" --team-id "$APPLE_TEAM_ID" >/dev/null
rm -f "$CERT"
printf 'CSC_KEYCHAIN=%s\n' "$KEYCHAIN" >> "$GITHUB_ENV"
