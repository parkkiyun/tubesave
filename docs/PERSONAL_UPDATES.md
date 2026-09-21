# TubeSave Personal — 개인용 자동 업데이트

## GitHub 반영과 활성화의 구분

2026-09-21 재시도에서 개인용 업데이트 구현 파일 업로드가 성공했습니다. 런타임, Electron 연결, Sparkle/NSIS 빌드, 최초 연결 도구, 단위/네이티브 시험 및 GitHub 워크플로를 feature/personal-updates에 반영했습니다. 두 잠금 파일의 버전 메타데이터도 GitHub에서 생성하여 검토했습니다.

네이티브 검증 결과는 해당 커밋의 Actions를 확인하세요. 이 문서의 업로드 완료는 사용자 키 연결이나 실제 릴리스 게시 완료를 뜻하지 않습니다. 기존 Preview 앱은 여전히 별도 경로입니다.

## 업데이트 신뢰 경로

- 앱 ID: local.tubesave.personal. Preview/기존 앱과 데이터를 분리합니다.
- 앱에 고정한 Ed25519 공개키로 personal-update.json 전체와 설치 파일의 서명을 확인합니다. 개인키는 앱에 포함하지 않습니다.
- 서명 확인 후에만 버전·노트·파일 주소를 사용합니다. 파일 크기·SHA-512·서명을 다운로드 직후와 설치 직전에 확인합니다.
- Windows는 검증된 per-user NSIS 설치본을 실행합니다. 임의 관리자 권한 상승을 요청하지 않습니다.
- Mac은 검증된 ZIP을 Sparkle에 전달하고, 설치된 앱의 SUPublicEDKey를 사용해 Sparkle이 다시 검증합니다. 교체용 로컬 서버는 127.0.0.1과 예측 불가능한 경로로 제한됩니다.
- Gatekeeper/SmartScreen의 보호 설정을 전역 변경하지 않습니다. Ed25519 서명은 개발자 신원 인증이나 Apple 공증이 아닙니다.
- 영상 다운로드·대기·엔진 작업을 마친 뒤 사용자가 재시작을 선택합니다. 설치 파일 검증 실패 시 실행하지 않습니다.

## 최초 연결

전체 소스를 main에 반영하고 세 운영체제의 네이티브 검증이 통과한 다음, 성공한 Test personal updates and build setup kits 실행의 Personal-Setup-darwin-arm64 / Personal-Setup-darwin-x64 / Personal-Setup-win32-x64 아티팩트를 사용합니다.

이 도구는 일반 앱 설치본과 다릅니다. 처음 한 번 소유자의 업데이트 배포를 연결하는 프로그램이며 Node와 GitHub CLI를 함께 포함합니다. ZIP을 모두 풀고 Mac의 시작.command 또는 Windows의 시작.bat를 실행합니다. 본인이 동의하고 GitHub 브라우저 인증을 완료하면 아래 작업을 수행합니다.

1. parkkiyun/tubesave 관리자 권한과 기존 공개키 설정을 확인합니다.
2. 로컬에서 무료 Ed25519 개인키를 생성합니다. 기존 키가 있으면 일치 여부를 확인하고 자동 교체하지 않습니다.
3. 개인키를 tubesave-release 환경의 TUBESAVE_UPDATE_PRIVATE_KEY Secret에 저장합니다. 공개키만 release/personal.json에 커밋합니다.
4. GitHub의 첫 개인용 릴리스 빌드가 끝날 때까지 기다립니다.
5. 설치 파일 서명을 검증한 뒤 개인용 앱 설치를 시작합니다.

실제 키 생성·등록과 브라우저 인증은 이 채팅에서 완료하지 않았습니다. 개인키나 토큰을 채팅에 보내지 마세요. 도구가 사용하는 기존 GitHub 연결과 이 채팅 플러그인의 연결은 별개입니다.

키의 로컬 보관 위치는 Mac ~/.config/TubeSavePublisher/update-private.pem 또는 Windows LOCALAPPDATA/TubeSavePublisher/update-private.pem입니다. 안전하게 백업하고 새 키로 덮어쓰지 마세요. 다른 컴퓨터에서는 이미 연결된 공개키를 그대로 사용하여 앱만 설치할 수 있습니다.

## 다음 버전 배포

앱과 루트 package.json의 버전을 함께 올리고 `node scripts/personal/align-locks.cjs`로 잠금 파일의 버전 메타데이터만 맞춥니다. release/personal-notes.md를 수정합니다. main 버전 변경 → 세 플랫폼 빌드 → 보호 환경에서 파일/메타데이터 서명 → personal-vX.Y.Z 릴리스 게시 순서입니다.

키가 연결되지 않았으면 배포 워크플로는 설치본 게시를 진행하지 않습니다. 개인키는 플랫폼 빌드 단계에 전달하지 않으며, 성공한 빌드를 서명하는 최종 단계에서만 환경 Secret으로 사용합니다.

## 검증 범위

로컬 194개 Node 테스트는 재실행해 통과했습니다. GitHub 테스트와 네이티브 교체 결과는 해당 Actions 실행이 실제 성공해야 완료로 간주합니다. 네이티브 시험은 별도 임시 앱과 키, 두 설치 버전, 로컬 다운로드 서버로 실행하고 변조 파일 거부·설치된 app.asar 버전 변경·데이터 보존을 확인합니다.

사용자 계정의 회원 전용 영상 다운로드, 일반 사용자 컴퓨터의 최초 브라우저 인증·Secret 등록, 실제 공개 릴리스에서의 두 버전 교체는 별도 확인이 필요합니다. Windows 설치 중 정전 등 모든 장애에서 바이너리가 자동 롤백된다고 보장하지 않습니다. 설정과 저장 영상은 업데이트 패키지에 넣지 않습니다.
