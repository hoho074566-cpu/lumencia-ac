# 루멘시아 모바일 V1.1

폰 브라우저에서 플레이하는 **루멘시아 아카데미 AI RPG** 프로토타입입니다.
OpenAI API는 서버에서 GM 글과 구조화된 상태 변경값만 만들고, 초상화와 이벤트 CG는 웹앱이 GitHub에서 직접 표시합니다.

## 이번 버전에 들어간 것

- 모바일 채팅형 RPG UI / PWA 홈 화면 추가
- **일상 Luna / 중요 장면 Terra 자동 라우팅**
- 다음 한 턴만 강제로 Terra를 쓰는 버튼
- GPT-5.6 **Pro reasoning mode** 선택 기능
- Responses API + Structured Outputs
- NPC `speaker_key + expression`에 따른 초상화 자동 표시와 DEFAULT 폴백
- 이벤트 CG ID 자동 표시 구조
- 자유 입력 + 상황별 선택지 최대 3개
- 폰 내부 자동 세이브 / JSON 내보내기·불러오기
- 날짜·요일·시간 자동 진행
- 관계·사건·PC 지식·NPC별 기억·NPC 현재 위치/목표 구조화 저장
- 오래된 기억 전체를 무작정 보내지 않고, 현재 장면과 관련된 기억을 우선 전달
- 스탯/스킬 숨은 경험 100 누적 시 자동 등급 상승
- 누적 토큰과 API 비용 추정
- API 호출 없이 화면을 확인하는 데모 모드
- 선택형 개인 접속 토큰으로 공개 URL 무단 사용 방지

## 가장 빠른 배포 방법

### 1. GitHub 저장소 만들기

이 ZIP을 풀고 **내용물 전체**를 새 GitHub 저장소 최상단에 올립니다.
저장소 첫 화면에서 아래 파일들이 바로 보여야 합니다.

```text
index.html
app.js
assets.js
package.json
api/
```

ZIP을 감싸는 상위 폴더 하나를 통째로 올리면 안 됩니다.

### 2. Vercel에 연결

1. Vercel에서 **Add New → Project**
2. 방금 만든 GitHub 저장소 Import
3. Framework Preset은 자동 감지 또는 `Other`
4. Build Command / Output Directory는 비워둔 채 Deploy

### 3. API 키 등록

Vercel 프로젝트의 **Settings → Environment Variables**에서 등록합니다.

필수:

```text
OPENAI_API_KEY = 본인의 OpenAI API secret key
```

강력 권장:

```text
LUMENSIA_ACCESS_TOKEN = 본인만 아는 긴 무작위 암호
```

선택:

```text
OPENAI_MODEL_LUNA = gpt-5.6-luna
OPENAI_MODEL_TERRA = gpt-5.6-terra
```

등록 후 **Redeploy** 합니다.

> API 키는 `app.js`, `.env`, GitHub 저장소, 휴대폰 설정창에 직접 넣지 마세요. `OPENAI_API_KEY`는 Vercel 서버 환경변수에만 둡니다.

### 4. 폰에서 실행

- Vercel이 준 주소를 Chrome 또는 Samsung Internet으로 엽니다.
- `LUMENSIA_ACCESS_TOKEN`을 설정했다면 앱의 ⚙ 설정에서 같은 값을 입력합니다.
- 브라우저 메뉴 → **홈 화면에 추가**를 누르면 앱처럼 실행할 수 있습니다.

## 첫 실행 권장 순서

1. ⚙ 설정에서 **데모 모드** 켜기
2. `등록 이미지 빠른 점검` 실행
3. `첫 장면 시작`으로 UI와 릴리아 초상화 확인
4. 정상이라면 데모 모드를 끄고 실제 API 플레이

기본값은:

- 모델 라우팅: 자동
- 평범한 장면: Luna
- 전투·정치·비밀·중요 관계 장면: Terra
- 추론: Luna low / Terra medium

**TERRA 1턴** 버튼은 다음 입력 한 번만 Terra로 강제합니다.
**Pro 추론 모드**는 Terra를 사용하며 훨씬 느리고 비용이 커질 수 있으므로 정말 중요한 장면에만 권장합니다.

## 치매 방지 구조

모델의 대화 기억에만 맡기지 않습니다. 브라우저 세이브가 다음을 영구 보관합니다.

- 현재 날짜·요일·시간·장소
- PC 스탯·스킬 숨은 경험·장비·소지금
- NPC 관계와 관계 변화 이유
- 주요 NPC의 최근 위치·상태·현재 목표
- 진행/완료 사건
- PC가 실제로 획득한 정보
- NPC별 기억과 세계 공통 기억
- 최근 턴과 누적 장면 요약

매 턴 모델은 이 세이브의 **관련 부분**을 전달받고 `state_delta`만 제안합니다. 앱이 변화량을 제한하고 적용합니다.

## 이미지 추가

`assets.js`에 URL을 넣습니다.

```js
lilia: {
  name: '릴리아',
  default: '.../lilia_default.png',
  expressions: {
    smile: '.../lilia_smile.png',
    angry: '.../lilia_angry.png'
  }
}
```

등록된 표정이 없으면 자동으로 DEFAULT를 사용합니다.

이벤트 CG:

```js
cg: {
  lilia_duel_01: 'https://raw.githubusercontent.com/.../lilia_duel_01.png'
}
```

모델은 앱이 전달한 CG ID 목록에 있는 값만 반환할 수 있습니다.

## 세이브 관련

- 자동 저장 위치: 해당 폰 브라우저의 localStorage
- 브라우저 데이터 삭제 시 함께 사라질 수 있으므로 종종 **내보내기** 권장
- 다른 폰에서는 JSON 파일을 **불러오기**로 복원

## 파일 설명

- `index.html`, `styles.css`, `app.js`: 모바일 UI와 세이브 처리
- `assets.js`: 초상화/CG 라우팅
- `api/chat.js`: OpenAI Responses API 호출
- `api/lib/canon-data.js`: WORLD/NPC/SPEECH/PC 원본 자료
- `api/lib/schema.js`: 모델 출력 구조
- `api/lib/router.js`: Luna/Terra/Pro 라우팅
- `api/lib/memory.js`: 장기 세이브에서 관련 기억 선별
- `api/lib/character-registry.js`: 등록 NPC 키 검증

## 현재 한계

- 세이브는 아직 폰 한 대의 브라우저에 저장됨
- 이벤트 CG 목록은 직접 `assets.js`에 추가해야 함
- 세계관 파일은 서버 코드에 포함되어 배포되며, 수정 후 재배포가 필요함
- 첫 API 호출은 고정 설정 캐시가 아직 없어 이후 호출보다 비쌀 수 있음

