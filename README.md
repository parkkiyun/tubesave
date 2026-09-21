# TubeSave Desktop

Mac과 Windows에서 독립 창으로 실행하는 Electron 영상 저장 앱입니다. 링크 입력, MP4/MKV/MP3, 화질 선택, 대기열, 기록, 사용자 동의 기반 브라우저/로컬 쿠키 연결을 지원합니다. 본인 소유 또는 다운로드 허가를 받은 콘텐츠에 사용하세요.

## 설치본의 구분

- **TubeSave Preview**: GitHub Actions의 `Build and test desktop preview installers`에서 만드는 엔진 포함 테스트 설치본입니다. Mac DMG/ZIP, Windows Setup EXE가 Actions 실행의 Artifacts에 저장됩니다. 서명·공증된 정식 배포본이 아니며, 정식 자동 업데이트는 비활성입니다. Preview는 별도 앱 ID와 데이터 경로를 사용합니다.
- **정식 TubeSave**: `Build signed TubeSave installers (manual)` 워크플로입니다. 실제 배포 인증서와 공증 설정이 있어야 통과합니다. 모든 아키텍처 빌드와 업데이트 파일의 SHA-512 검사를 통과한 뒤 초안 릴리스를 생성합니다. 검토 후 공개한 안정 릴리스를 정식 앱이 확인합니다.
- **온라인 설치기**: `install_mac.command` 또는 `install_windows.bat`는 Electron과 엔진을 내려받아 설치합니다. 별도 Python/Node 설치는 요구하지 않지만 이 방식의 앱은 정식 자동 업데이트 대상이 아닙니다.

## 개발

Node.js 22 이상에서 저장소 루트를 기준으로 실행합니다.

```sh
npm ci
npm ci --prefix app
npm test
npx electron app
```

실제 Electron 화면·preload·IPC 검사는 `npx electron tests/electron-smoke.cjs`입니다. 사용자 쿠키와 영상에 접근하지 않고 임시 프로필을 사용합니다. 테스트 환경에서 하드웨어 가속만 끄며, 샌드박스와 화면 격리는 유지합니다.

Preview 설치본은 대상 Mac/Windows에서 `node scripts/build-preview.cjs`로 생성하고, `node scripts/verify-preview.cjs`로 최종 번들 엔진의 무결성·실행·실제 MP3 변환을 확인합니다.

## 업데이트 구조

정식 앱은 `electron-updater`와 GitHub Releases를 사용합니다. 앱 시작 시 확인, 사용자 선택 다운로드, 무결성/서명 검증, 작업 종료 후 사용자 선택 재시작을 수행합니다. 다운로드 또는 엔진 작업 중 재시작은 차단합니다. 서버 오류를 최신 버전으로 오인하지 않습니다. 서명 검증을 해제하거나 인증서를 앱에 포함하지 않습니다.

자세한 절차는 [배포 안내](docs/RELEASE.md), 구조는 [아키텍처](docs/ARCHITECTURE.md), 현재 상태는 [작업 상태](docs/SETUP_STATUS.md)를 참고하세요.

## 계정 정보와 외부 구성요소

쿠키·비밀번호·인증서·개인키를 이 저장소에 올리지 마세요. 로그인은 선택한 로컬 브라우저/파일로만 연결하고 실행 세션 종료 시 설정을 유지하지 않습니다. 회원 권한이나 DRM 제한을 우회하지 않습니다.

TubeSave 코드는 MIT입니다. Electron, yt-dlp, FFmpeg와 그 의존성은 각각의 라이선스가 적용됩니다. `THIRD_PARTY_NOTICES.md`와 각 엔진의 `SOURCES.json`/licenses를 확인하고, 재배포할 정확한 FFmpeg 빌드의 대응 소스 제공 의무를 별도로 충족해야 합니다.
