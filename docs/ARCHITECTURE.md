# TubeSave 구조

## 실행과 권한 경계

`app/main.cjs`가 Electron 독립 창, 로컬 커스텀 프로토콜, OS 파일 선택기, 제한된 IPC, 엔진과 업데이트를 관리합니다. 렌더러는 Node.js 접근이 없고 contextIsolation/sandbox를 사용합니다. 로컬 화면 자원은 허용 목록으로 제공하며 외부 페이지 탐색과 임의 새 창, webview를 차단합니다. IPC는 발신 창과 mainFrame 및 로컬 origin을 검증합니다.

`app/preload.cjs`는 명시된 작업별 함수만 노출합니다. `app/ui/`는 화면/기록/설정/로그인/업데이트를 표시하며 외부 네트워크 요청을 수행하지 않습니다. 영상 제목·로그·변경 사항은 HTML로 실행하지 않습니다.

## 엔진과 사용자 파일

`lib/tools.cjs`는 공식 yt-dlp 실행 파일과 PyPI imageio-ffmpeg 배포물을 HTTPS로 받고 체크섬을 확인합니다. 배포 시 engines 리소스에 포함합니다. 실행 시 운영체제·아키텍처·실제 파일 해시를 검사하고, 더 최신인 사용자 엔진만 번들 엔진보다 우선합니다. 설치 실패 시 이전 런타임을 유지합니다.

`lib/process.cjs`는 셸 없이 인자 배열로 하위 프로세스를 실행하고 시간 제한과 취소를 처리합니다. `lib/service.cjs`는 단일 다운로드 대기열·임시 저장·충돌 없는 완료 파일 이동·기록을 담당합니다. `lib/core.cjs`는 URL/설정/쿠키 형식 검사 및 로그의 민감 정보 마스킹을 담당합니다.

브라우저 쿠키는 사용자가 명시적으로 동의하고 선택한 연결에만 사용합니다. 파일 방식은 OS 선택기로 선택된 경로만 허용하고 필요한 도메인의 임시 사본을 만들며 작업 후 정리합니다. 원본 쿠키 파일은 변경하지 않습니다.

## 앱 업데이트

`lib/updates.cjs`의 UpdateController가 상태를 관리합니다. 정식 electron-builder 설치본은 resources/distribution.json과 app-update.yml로 연결됩니다. 렌더러나 사용자가 임의 업데이트 URL을 지정할 수 없습니다. 다운로드/재시작은 사용자 선택이며, 영상·대기열·엔진 작업 중 재시작을 차단합니다.

`build/release-config.cjs`와 `build/after-sign.cjs`는 정식 서명·Mac 공증·아키텍처별 feed를 구성합니다. 엔진 서명으로 파일 바이트가 변경되면 해시를 갱신하고 바깥 앱을 다시 봉인합니다. `scripts/validate-update-assets.cjs`는 릴리스 생성 전 feed가 참조하는 실제 파일과 SHA-512를 비교합니다.

Preview는 별도 앱 ID와 데이터 경로, disabled 배포 메타데이터를 갖습니다. `scripts/build-preview.cjs`는 개발 테스트 전용이며 정식 배포 서명 검사를 대체하지 않습니다.

## 검증

Node 단위/통합 테스트, 실제 Electron UI·preload·IPC 검사, 최종 패키지의 엔진 해시·실행·MP3 변환 검사를 구분합니다. 이것들은 실제 회원 계정 다운로드, Apple 공증 성공, 두 정식 버전 사이의 설치 교체 시험과 다릅니다.
