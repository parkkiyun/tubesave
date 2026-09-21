# 현재 작업 상태

2026-09-21: 이전의 메인 실행 파일/HTML 업로드 실패가 해소됐습니다. app/main.cjs, app/ui/index.html 및 PNG/ICO/ICNS 아이콘을 모두 반영했습니다. source-completeness 검사는 통과했습니다. 일부 파일만 있는 이전 상태가 아닙니다.

실행 가능한 전체 소스, 설치기, 런타임/업데이트 코드, 잠금 파일, 네이티브 빌드 워크플로와 테스트가 있습니다. 최신 검증 결과는 해당 커밋의 GitHub Actions를 기준으로 확인하세요.

- Verify TubeSave source: 전체 Node 테스트·파일·잠금 파일·문법·의존성 설치 확인.
- Build and test desktop preview installers: 실제 Mac/Windows Electron 창·preload·IPC·UI, 엔진 포함 DMG/ZIP/Setup EXE, 최종 패키지 엔진 및 MP3 변환 검사.
- TubeSave signing readiness (manual): 정식 배포 인증서 설정 존재 확인.
- Build signed TubeSave installers (manual): 정식 서명/공증 및 업데이트 feed를 포함한 초안 릴리스 생성.

마지막 서명 설정 검사에서는 필요한 Mac/Windows 자격증명이 제공되지 않았고 windowsPublisherName도 비어 있었습니다. 이것은 GitHub 연결 오류가 아닙니다. Preview 성공이 정식 서명·공증·자동 업데이트 교체 성공을 의미하지 않습니다.

실제 회원 계정 다운로드와 두 서명된 정식 버전 간 업데이트 교체는 별도 실기기 확인이 필요합니다. 인증서를 생성하거나 비용을 결제했다고 주장하지 않습니다.
