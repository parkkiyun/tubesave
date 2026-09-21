# 외부 구성요소와 공식 문서

Electron: https://github.com/electron/electron
보안: https://www.electronjs.org/docs/latest/tutorial/security
자동 업데이트: https://www.electronjs.org/docs/latest/api/auto-updater
서명: https://www.electronjs.org/docs/latest/tutorial/code-signing

배포/업데이트 라이브러리: https://github.com/electron-userland/electron-builder
다운로드 엔진: https://github.com/yt-dlp/yt-dlp
계정 쿠키 안내: https://github.com/yt-dlp/yt-dlp/wiki/Extractors
FFmpeg 바이너리 패키지: https://github.com/imageio/imageio-ffmpeg
FFmpeg 재배포 안내: https://ffmpeg.org/legal.html

직접 개발 의존성 버전은 package.json과 lockfile을 기준으로 하고, 실제 엔진 버전/출처/해시는 각 설치 번들의 SOURCES.json과 current.json에 기록합니다. 위 홈페이지 링크만으로 정확한 대응 소스 제공 의무가 자동 충족되는 것은 아닙니다.
