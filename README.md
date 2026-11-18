# 박자표 피자 화덕

피자 조각의 길이로 한 마디를 만들고, 클릭과 음표 소리로 박자표의 묶음을 배우는 오프라인 음악이론 게임입니다. 첨부 설계서 v1.0을 기준으로 만들었습니다.

- 영업일 5개, 주문 39개, 발견 장면 4개
- 자리 채우기, 지정·조건·묶음 주문, 다른 조합, 악보·소리 주문
- 2/4 · 3/4 · 4/4 · 6/8, 음표 조각 6종
- 메뉴판 69칸과 엇박 선반, 자유 화덕
- 두 단계 안내, 마감 전 다시 내기, 도장과 최고 기록
- 버전별 로컬 저장, 손상 원본 백업, 이어하기
- 외부 글꼴·이미지·라이브러리 요청 없음

## 실행

`index.html` 하나를 브라우저로 열면 됩니다. 인터넷이나 설치가 필요하지 않습니다. 소리 사용은 화면의 버튼을 한 번 눌러 시작합니다. 기록은 브라우저별로 저장됩니다.

키보드: 숫자 1~6 조각/보기, Backspace 하나 빼기, Tab·Enter 버튼 조작, 0 전체화면. 판의 조각은 클릭·Enter·Space로 뺍니다.

## 개발

Node.js 20 이상. 외부 패키지 설치 없이 실행합니다.

```sh
npm test
npm run build
npm run dev
```

`src/`를 수정한 뒤 `npm run build`를 실행하면 배포 가능한 단일 `index.html`과 `dist/index.html`이 생성됩니다. Vercel은 저장소 루트의 `index.html`을 그대로 정적 제공하도록 설정했습니다. GitHub Pages 등 정적 호스팅에서도 사용할 수 있습니다.

`index.html#test`에서 96개 자가검사 결과를 확인합니다. 이는 이론·주문·상태·저장·오디오 검사의 실제 실행 결과이며 설계서의 모든 화면·실기기 검사를 인증하는 숫자는 아닙니다. `#d0`~`#d4`는 영업일 바로가기입니다.

## 구조

| 파일 | 역할 |
|---|---|
| `src/engine.js` | 분수, 길이, 묶음, 각도, 채우기, 꼬리 잇기 |
| `src/orders.js`, `src/seeds.js` | 주문 모델, 문장·보기·정답 계산, 고정 교육 내용 |
| `src/game.js` | 순수 상태 전이, 진행·안내·메뉴 수집 |
| `src/storage.js` | 저장 검증, 복구와 메모리 폴백 |
| `src/audio.js`, `src/render.js` | Web Audio 예약, 오디오 시계 동기화, SVG |
| `src/main.js`, `src/shell.html`, `src/style.css` | 영속 DOM, 화면·조작·접근성·반응형 |
| `src/selftest.js`, `tests/` | 자체 검사와 Node 회귀검사 |

설계 원문은 [docs/design-v1.0.md](docs/design-v1.0.md), 구현·검증 상태는 [docs/implementation.md](docs/implementation.md)에 있습니다.
