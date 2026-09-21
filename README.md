# TubeSave Personal 2.2.0

Mac과 Windows에서 독립 창으로 실행하는 Electron 영상 저장 앱입니다. 링크 입력, MP4/MKV/MP3, 화질 선택, 대기열, 기록, 사용자 동의 기반 브라우저/로컬 쿠키 연결을 지원합니다. 본인 소유 또는 다운로드 허가를 받은 콘텐츠에 사용하세요.

## 개인용 자동 업데이트

유료 코드 서명 인증서 없이 GitHub Releases의 업데이트 정보와 설치 파일을 Ed25519 공개키로 검증합니다. Mac 교체는 Sparkle 2.10.0, Windows 교체는 사용자별 NSIS 설치본이 담당합니다. 운영체제의 개발자 신원 인증이나 Apple 공증과는 별개이며 최초 설치 경고는 남을 수 있습니다.

개인용 업데이트 소스는 `feature/personal-updates` 브랜치에 업로드했습니다. 최신 검증 결과는 GitHub Actions의 **Test personal updates and build setup kits** 실행을 확인하세요. 업로드 성공, 네이티브 시험 성공, 사용자 키 연결 및 실제 릴리스 게시를 서로 구분합니다.

**최초 출시용 키는 아직 연결되지 않았습니다.** `release/personal.json`의 공개키는 연결 전까지 비어 있습니다. 테스트 키를 실제 설치본에 넣어 배포하지 않습니다. 기존 Preview는 이 변경으로 자동 전환되지 않습니다.

전체 변경을 main에 반영하고 대상 운영체제의 네이티브 시험이 통과한 뒤, Actions의 `Personal-Setup-*` 아티팩트에서 최초 연결 도구를 사용합니다. 도구는 본인 컴퓨터에서 GitHub 로그인과 동의를 받아 무료 서명키를 생성하고, 개인키는 로컬 및 GitHub 환경 Secret에만 저장하며 공개키만 소스에 반영합니다. 이후 최초 개인용 설치본을 빌드·검증·설치합니다. 자세한 내용은 [개인용 업데이트 안내](docs/PERSONAL_UPDATES.md)를 참고하세요.

## 개발과 검증

```sh
npm ci
npm ci --prefix app
npm test
npx electron app
```

Node.js 22 이상을 사용합니다. 공개키가 연결된 개인용 설치본은 대상 Mac/Windows에서 `node scripts/personal/build.cjs`로 빌드하고 `node scripts/personal/verify-build.cjs`로 검사합니다. `node scripts/personal/native-smoke.cjs`는 임시 키와 별도 앱 ID를 사용해 변조 파일 거부, 두 버전의 실제 교체, 데이터 보존을 검사합니다. 실제 출시키나 사용자 쿠키는 CI 시험에 사용하지 않습니다.

새 버전을 배포할 때 두 package.json의 버전과 잠금 파일 버전 메타데이터를 맞추고 `release/personal-notes.md`를 수정합니다. main의 앱 버전 또는 공개키 설정 변경은 개인용 배포 워크플로를 시작합니다. 키 미연결 상태에서는 배포를 건너뛰며 검증을 해제하지 않습니다.

## 기존 설치 방식

- **TubeSave Preview**: 별도 앱 ID/데이터를 사용하는 엔진 포함 테스트 DMG/ZIP/Setup EXE입니다. 개인용 자동 업데이트가 꺼져 있습니다.
- **인증서 서명 TubeSave**: 기존 `Build signed TubeSave installers (manual)` 경로는 유지합니다. 실제 인증서·공증 설정이 필요한 별도 배포 방식입니다.
- **온라인 설치기**: `install_mac.command`와 `install_windows.bat`는 Electron 및 엔진을 내려받는 기존 부트스트랩 설치기이며 개인용 자동 업데이트 대상이 아닙니다.

## 보안 및 라이선스

개인키·쿠키·비밀번호·인증서·세션 파일은 저장소에 올리지 마세요. 앱에는 공개키만 넣습니다. 업데이트는 서명·파일 크기·SHA-512를 검증하고 설치 직전 재검증하며, 영상 다운로드·대기·엔진 작업이 있을 때 재시작하지 않습니다. Gatekeeper나 SmartScreen을 전역으로 끄지 않습니다.

TubeSave 코드는 MIT입니다. Electron, yt-dlp, FFmpeg, Sparkle 및 설치 도구의 Node/GitHub CLI에는 각각의 라이선스가 적용됩니다. 포함된 라이선스와 THIRD_PARTY_NOTICES.md를 확인하세요. FFmpeg를 재배포할 때는 해당 빌드의 대응 소스 제공 의무를 별도로 충족해야 합니다.
