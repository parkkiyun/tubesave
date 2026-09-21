# 검증 범위

Node 테스트는 URL/설정 검증, 쿠키 동의와 임시 파일 정리, 셸을 사용하지 않는 하위 프로세스, 취소/시간 제한, 엔진 설치와 롤백, 번들 무결성, 대기열, 파일 보존, 업데이트 상태/설치 차단, 배포 메타데이터 해시를 검사합니다.

로컬 작업 사본에서 147개 테스트가 통과했습니다. GitHub에서는 각 커밋의 Verify/Preview validate 로그의 실제 pass/fail/skipped를 기준으로 확인합니다. FFmpeg를 설치한 뒤 테스트하도록 구성하여 변환 시험을 조용히 건너뛰지 않도록 했습니다.

네이티브 검사는 tests/electron-smoke.cjs로 실제 Electron을 실행하여 로컬 프로토콜, 실제 preload와 IPC, 설정/기록 이동, MP3 컨트롤, 로그인 모달과 동의 기본값, 샌드박스/격리를 확인하고 실제 창 캡처를 저장합니다. 테스트용 GPU 설정 변경은 보안 샌드박스 해제가 아닙니다.

scripts/verify-preview.cjs는 완성된 패키지 안의 app.asar, disabled Preview 배포 정보, 번들 엔진 해시, yt-dlp 실행, FFmpeg 실제 MP3 출력을 확인합니다.

인증서 없는 Preview 검사와 업데이트 상태 모의 테스트는 정식 서명·Apple 공증·실제 앱 버전 교체·회원 계정 다운로드 시험의 대체가 아닙니다.
