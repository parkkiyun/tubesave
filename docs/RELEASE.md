# 정식 자동 업데이트 배포

## 이미 구성된 항목

소스와 엔진 포함 설치기, GitHub Actions, 두 npm 잠금 파일 및 `parkkiyun/tubesave` 배포 연결이 저장소에 있습니다. 저장소를 다시 만들거나 GitHub 앱을 다시 설치할 필요는 없습니다.

Preview 빌드는 정식 서명 설정 없이 앱 자체를 검증하기 위한 별도 경로입니다. Preview에서 정식 자동 업데이트가 동작한다고 안내하면 안 됩니다.

## 배포자에게 필요한 값

저장소 Settings → Environments → `tubesave-release`에 등록합니다. 값은 소스·앱·채팅에 넣지 마세요.

Secrets:
- MAC_CERTIFICATE_BASE64: Developer ID Application 인증서와 개인키의 암호화 p12를 Base64로 표현한 값.
- MAC_CERTIFICATE_PASSWORD: 위 p12의 암호.
- APPLE_ID: Apple 공증 계정.
- APPLE_APP_SPECIFIC_PASSWORD: 해당 계정의 앱 전용 암호.
- WINDOWS_CERTIFICATE_BASE64: 서명 가능한 인증서/개인키 pfx의 Base64 값.
- WINDOWS_CERTIFICATE_PASSWORD: 위 pfx의 암호.

Variables: MAC_SIGN_IDENTITY(정확한 Developer ID 서명 명칭), APPLE_TEAM_ID.

`release/config.json`의 windowsPublisherName은 Windows 인증서의 실제 배포자 명칭과 일치해야 합니다. 임의의 이름을 넣지 마세요. 하드웨어 토큰/원격 서명 서비스 전용 인증서는 현재 PFX 방식과 다른 연동이 필요합니다.

실제 서명 인증서를 발급받지 않은 상태에서는 정식 서명 빌드가 통과하지 않습니다. 사설키를 공개 저장소에 넣거나 검증을 끄는 것은 해결책이 아닙니다.

## 빌드와 공개

1. 두 package.json 및 두 package-lock.json의 루트 버전을 같은 안정 버전으로 유지하고 release/notes.md를 갱신합니다.
2. `TubeSave signing readiness (manual)`로 등록 여부를 확인합니다. 이 검사는 인증서 유효성 검사와 다릅니다.
3. `Build signed TubeSave installers (manual)`을 실행합니다. 소스·잠금 파일·테스트 후 Mac arm64 / Mac Intel / Windows x64에서 엔진 준비, 서명/공증, 설치본 생성이 진행됩니다.
4. 모든 빌드 성공 후 업데이트 YAML의 실제 파일 크기·SHA-512·필수 ZIP/EXE 형식을 검증하고 초안 릴리스를 생성합니다.
5. 정확한 FFmpeg 대응 소스/라이선스 자료, 설치 및 업데이트 시험을 확인한 뒤 초안을 안정 릴리스로 공개합니다.

유지할 파일: Mac DMG와 ZIP, Windows NSIS EXE, blockmap, latest-arm64-mac.yml, latest-x64-mac.yml, latest-x64.yml. 임의 파일명 변경·ZIP 삭제는 업데이트를 깨뜨릴 수 있습니다.

## 실제 업데이트 확인

기존 온라인 설치본이나 Preview는 정식 자동 업데이트 대상이 아니므로 최초 정식 설치본을 직접 설치해야 합니다. 같은 앱 ID·배포자 정체성을 유지하고 더 높은 버전(예: 2.1.0 → 2.1.1)을 공개한 뒤 알림 → 다운로드 → 재시작 → 실제 새 버전 및 기존 데이터 보존을 확인합니다.

앱 시작 시 자동 확인을 꺼 둔 경우, 네트워크 오류, 잘못된 파일 해시/서명, 공간 부족, 실행 중인 영상 작업, 취소, 쿠키 재연결도 시험합니다. CI에는 실제 YouTube 계정 쿠키를 넣지 않습니다.

공식 참고: https://www.electronjs.org/docs/latest/api/auto-updater · https://www.electronjs.org/docs/latest/tutorial/code-signing · https://github.com/electron-userland/electron-builder
