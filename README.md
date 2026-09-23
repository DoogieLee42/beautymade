# BeautyMade

내 얼굴을 한 번 스캔해두면, 저장된 **내 3D 얼굴**을 돌려보면서 코 · 턱/윤곽 · 입술 · 피부 · 리프팅 변화를
시뮬레이션하고, 여러 버전을 저장해 비교하는 소비자용 뷰티 시뮬레이터 MVP입니다.

```
apps/mobile         Expo(React Native) 앱: iOS · Android · 웹
packages/face-engine 얼굴 메시, 변형 컨트롤, 프리셋 (앱과 공유하는 TypeScript 엔진)
services/api        FastAPI 서버: 계정, 스캔 업로드, 3D 얼굴 복원(MediaPipe), 저장한 룩
```

## 로컬에서 실행하기

### 1. 준비물

| 도구 | 버전 | 설치 |
| --- | --- | --- |
| Node.js | 22 (20.19 이상) | [nodejs.org](https://nodejs.org) 또는 `nvm use` |
| uv (Python 패키지 관리자) | 최신 | macOS/Linux: `curl -LsSf https://astral.sh/uv/install.sh \| sh`<br>Windows: `powershell -c "irm https://astral.sh/uv/install.ps1 \| iex"` |
| Expo Go (폰에서 볼 때만) | SDK 57 지원 버전 | App Store / Google Play |

Python은 따로 설치하지 않아도 됩니다. `uv`가 필요한 버전(3.11 이상)을 알아서 받아요.

### 2. 설치 (처음 한 번)

```bash
git clone https://github.com/DoogieLee42/beautymade.git
cd beautymade
git checkout claude/confident-hamilton-4zdz0f   # 아직 main에 합쳐지기 전이라면
npm run setup                                    # npm 패키지 + Python 서버 의존성 설치
```

### 3. 브라우저에서 보기 (가장 빠름)

```bash
npm run dev:web
```

API 서버(`:8000`)와 웹 앱(`:8081`)이 함께 뜨고 브라우저가 열립니다. 안 열리면 <http://localhost:8081>로 접속하세요.
개발자 도구에서 모바일 화면(예: iPhone 14, 390×844)으로 보면 디자인과 같은 비율로 보입니다.

- 촬영 화면에서 노트북 카메라를 쓸 수 있고, **앨범에서 가져오기**로 정면 · 왼쪽 · 오른쪽 사진 파일을 올려도 됩니다.
- 첫 스캔 때 서버가 얼굴 인식 · 머리카락 분리 모델(합쳐서 약 20MB)을 한 번 내려받아서 조금 더 걸려요.

### 4. 폰에서 보기 (Expo Go)

```bash
npm run dev
```

1. 터미널에 QR 코드가 나오면 폰의 **Expo Go**(Android) 또는 **카메라 앱**(iPhone)으로 찍습니다.
2. 폰과 컴퓨터가 **같은 Wi-Fi**에 있어야 합니다. 앱은 개발 서버가 떠 있는 컴퓨터의 `:8000` 포트로 API에 자동으로 붙어요.
3. macOS에서 "Python이 들어오는 연결을 허용할까요?"가 뜨면 **허용**하세요. 그래야 폰에서 API에 닿습니다.

### 서버 없이 둘러보기 (데모 모드)

API를 띄우지 않고 앱만 실행해도 됩니다(`npm run mobile:web` 또는 `npm run mobile`).
가입 화면 아래의 **서버 없이 데모 모드로 둘러보기**를 누르면 기기 안에서만 동작하는 샘플 얼굴로 모든 흐름을
체험할 수 있어요. 이때 촬영한 사진은 3D로 만들지 않고 샘플 얼굴을 보여줍니다.

## 둘러볼 흐름

1. 스플래시 → **내 얼굴 만들기** → 가입
2. 촬영 가이드 → 정면 / 왼쪽 45도 / 오른쪽 45도 촬영 (셔터를 길게 누르면 3초 타이머)
3. 3D 생성 대기 → **내 얼굴이 준비되었어요!** (드래그해서 돌려보기)
4. 스튜디오: 부위 탭 → 프리셋 또는 슬라이더, 되돌리기/다시하기, **원본 보기**를 누르고 있으면 원본
5. **적용하기** → 비교하기: 나란히 / 슬라이더 / 번갈아 보기, 각도 선택, 오른쪽 위 버튼으로 비교 이미지 저장
6. **이 룩 저장하기** → 내 룩 목록 → **비교**로 다시 열기 (Before 라벨을 누르면 다른 룩과 비교)

## 자주 쓰는 명령

| 명령 | 하는 일 |
| --- | --- |
| `npm run dev:web` | API + 웹 앱 |
| `npm run dev` | API + Expo 개발 서버 (폰 / 시뮬레이터) |
| `npm run api` | API 서버만 (`http://localhost:8000/docs`에서 API 문서) |
| `npm run mobile` / `npm run mobile:web` | 앱만 |
| `npm test` | 얼굴 엔진 + API 테스트 |
| `npm run typecheck` | TypeScript 검사 |

## 문제 해결

| 증상 | 해결 |
| --- | --- |
| 가입 화면에 "API 서버에 연결할 수 없어요" | `npm run api`가 떠 있는지 확인하세요. 폰이라면 같은 Wi-Fi인지, 방화벽이 8000 포트를 막지 않는지 확인하세요. |
| Expo Go에서 "Project is incompatible with this version of Expo Go" | 스토어에서 Expo Go를 최신으로 업데이트하세요(이 프로젝트는 Expo SDK 57). |
| 폰 브라우저로 `http://<컴퓨터 IP>:8081`에 접속했더니 카메라가 안 켜짐 | 브라우저는 https나 localhost에서만 카메라를 허용해요. 폰은 Expo Go로 보거나 **앨범에서 가져오기**를 쓰세요. |
| Linux 서버에서 `libEGL.so.1` 오류 | `sudo apt-get install libegl1 libgles2` (MediaPipe가 필요로 함) |
| 처음부터 다시 해보고 싶음 | 서버 데이터: `services/api/var/` 폴더 삭제. 앱: 프로필 → 로그아웃 (웹은 사이트 데이터 삭제) |

## 설정

API는 `BM_` 접두사 환경 변수(또는 `services/api/.env`)로 설정합니다. 예시는 `services/api/.env.example`에 있어요.
앱은 `EXPO_PUBLIC_API_URL`로 API 주소를 고정할 수 있고, 비워두면 개발 서버가 떠 있는 컴퓨터의 `:8000`을 씁니다.

## AI 고화질 보기 켜기

비교 화면의 **AI 고화질** 버튼은 편집한 3D 미리보기와 정면 사진을 이미지 AI에 보내 사진 같은 결과를 만들어요.
`services/api/.env`에 키를 하나 넣고 서버를 다시 켜면 동작합니다.

```bash
BM_GEMINI_API_KEY=...    # Google AI Studio 키 → Nano Banana Pro (기본)
BM_OPENAI_API_KEY=...    # OpenAI 키 → GPT Image 2 (BM_AI_PROVIDER=openai 로 선택)
```

- 같은 룩 · 같은 각도는 한 번만 생성하고 저장해 두어서 다시 볼 때는 비용이 들지 않아요.
- 사용자당 하루 생성 한도는 `BM_AI_DAILY_LIMIT`(기본 20장)로 정해요.
- 두 엔진을 내 사진으로 직접 비교하려면:
  `cd services/api && uv run python scripts/compare_ai_providers.py 정면사진.jpg 3D미리보기.jpg --values '{"noseBridge":0.6}'`
- 키가 없으면 버튼을 눌러도 "아직 설정되지 않았어요"라고만 안내해요. 데모 모드에서는 쓸 수 없어요.

## 개인정보

원본 사진과 3D 얼굴은 로그인한 계정에만 저장됩니다. 파일 URL은 서명된 링크로만 내려가고, 프로필에서
얼굴 데이터나 계정을 삭제하면 서버의 사진 · 3D 모델 · 룩 · AI 이미지가 함께 지워집니다.
AI 고화질 보기를 켜면 그 요청의 정면 사진과 3D 미리보기가 선택한 AI 회사(Google 또는 OpenAI)로 전송돼요.
출시 전에는 이용자 동의 문구와 각 회사의 데이터 보관 정책을 확인해야 해요.

## 사용한 외부 자료

- 얼굴 인식 · 머리카락/피부 분리: Google MediaPipe Face Landmarker, Selfie Multiclass Segmenter (Apache-2.0)
- 머리 · 귀 · 목 형태: MakeHuman hm08 기본 메시 (CC0). `services/api/scripts/build_head_template.py`가
  원본을 내려받아(SHA-256 고정) 얼굴 부분을 잘라내고 `head_template.npz`로 만들어요.
