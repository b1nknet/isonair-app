# 치지직 위젯 (Chzzk Widget)

**한국어** · [English](docs/README_en.md)

[치지직](https://chzzk.naver.com)(네이버 라이브 스트리밍 플랫폼)에서 즐겨 보는
채널의 방송 상태를 한눈에 확인할 수 있는, 테두리 없이 항상 위에 떠 있는 작은
데스크톱 위젯입니다. Electron으로 제작되었습니다.

> 비공식 팬메이드 도구이며, 네이버 / 치지직과 관련이 없습니다. 치지직의 공개 웹
> API를 읽기만 하며, 로그인은 필요하지 않습니다.

## 주요 기능

- **방송 상태 한눈에 보기** — 라이브/오프라인 배지, 현재 방송 제목, 실시간 시청자
  수, 카테고리, 그리고 실시간으로 갱신되는 "방송 중" 경과 시간 또는 "종료" 타이머.
- **목록 / 그리드 보기** — 자세한 목록 보기와, 마우스를 올리면 정보가 뜨는 간결한
  아이콘 그리드 보기. 타이틀바 버튼으로 전환합니다.
- **ID 또는 URL로 추가** — 채널 ID, 또는 `chzzk.naver.com/…`, `…/live/…`,
  `…/video/…` 형태의 링크를 붙여 넣어 추가할 수 있습니다.
- **클릭 한 번으로 열기** — 카드를 클릭하면 채널이 열리며, 방송 중인 채널은 바로
  플레이어(`/live/<id>`)로 이동합니다.
- **드래그 앤 드롭 정렬** 및 채널별 삭제.
- **자동 새로고침** — 30초마다 갱신되며, 새로고침 버튼과 카운트다운이 하나로
  합쳐져 있습니다.
- **오프라인 채널 숨기기** — 방송 중인 채널만 남겨 둘 수 있습니다.
- **모양 조절** — 투명도 슬라이더(100%에서는 완전 불투명), 인터페이스 크기
  조절(− / +), 항상 위에 고정 토글.
- **가져오기 / 내보내기** — 채널 목록을 JSON으로 내보내고 가져올 수 있습니다
  (내보낸 파일 이름에는 타임스탬프가 붙습니다).
- **자동 업데이트** — 설치된 빌드는 GitHub 릴리스에서 자동으로 업데이트됩니다.

## 다운로드

[릴리스 페이지](https://github.com/b1nknet/isonair-app/releases/latest)에서 최신
설치 파일을 받을 수 있습니다.

- **Windows** — `isonair-Setup-<버전>.exe` (NSIS 설치 프로그램)
- **macOS (Apple Silicon)** — `isonair-<버전>-arm64.dmg`

빌드는 **코드 서명이 되어 있지 않으므로** 처음 실행할 때 운영체제가 경고를
표시합니다.

- Windows: SmartScreen → *추가 정보* → *실행*.
- macOS: 앱을 마우스 오른쪽 버튼으로 클릭 → *열기*, 또는
  *시스템 설정 → 개인정보 보호 및 보안*에서 허용.

## 사용법

1. 앱을 실행하면 항상 위에 고정된 작은 위젯 창이 나타납니다.
2. 타이틀바의 **+** 를 클릭하고 채널 ID 또는 URL을 붙여 넣어 채널을 추가합니다.
3. 채널을 클릭하면 브라우저에서 열립니다. 카드를 드래그해 순서를 바꿀 수 있습니다.
4. **⋯** 메뉴에서 항상 위에 고정, 오프라인 채널 숨기기, 가져오기/내보내기, 수동
   업데이트 확인을 사용할 수 있습니다. 투명도와 인터페이스 크기는 하단에서
   조절합니다.

## 개발

[Node.js](https://nodejs.org/)가 필요합니다 (CI는 Node 24를 사용합니다).

```bash
npm install      # 의존성 설치
npm start        # 개발 모드로 실행 (electron .)
```

소스에는 별도의 빌드 단계나 번들러가 없습니다 — Electron이 `src/`의 파일을 직접
실행합니다.

### 프로젝트 구조

| 파일 | 역할 |
| --- | --- |
| `src/main.js` | 메인 프로세스: 창, 데이터 저장, 치지직 API 호출, IPC, 자동 업데이트 |
| `src/preload.js` | 렌더러에 `window.chzzk`를 노출하는 `contextBridge` |
| `src/renderer.js` | 모든 UI 로직과 DOM 렌더링 |
| `src/index.html` / `src/style.css` | 정적 셸과 스타일 |

더 자세한 아키텍처 설명은 [CLAUDE.md](CLAUDE.md)를 참고하세요.

### 저장되는 데이터

채널 목록과 설정은 저장소 외부에 있는 Electron의 사용자별 `userData` 디렉터리에
`channels.json`과 `settings.json`으로 저장됩니다.

## 빌드 및 릴리스

[electron-builder](https://www.electron.build/)로 로컬에서 패키징합니다.

```bash
npm run dist        # 현재 플랫폼
npm run dist:mac    # macOS
npm run dist:win    # Windows
```

릴리스는 GitHub Actions(`.github/workflows/build.yml`)로 자동화되어 있습니다.
`v*` 태그를 푸시하면 macOS(arm64)와 Windows(x64)를 빌드한 뒤, 하나의 릴리스
작업이 모든 설치 파일과 자동 업데이트 매니페스트를 담은 단일 GitHub 릴리스를
(최신으로 표시하여) 게시합니다.

```bash
# 먼저 package.json과 package-lock.json의 "version"을 올립니다
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin master --follow-tags
```

태그가 아닌 일반 푸시와 PR은 빌드만 수행하고 실행 결과물(artifact)만 업로드합니다.

## 라이선스

ISC
