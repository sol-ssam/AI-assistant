# 교사용 AI 업무 비서

> 교사의 수업, 일정과 할 일을 한곳에서 관리하고 AI가 업무 처리를 지원하는 개인 맞춤형 업무 비서

## 1. 프로젝트 소개

* 주 사용자: 교사
* 문제 영역: 행정·업무 효율화
* 결과물 형태: 웹앱
* 완성 상태: 시연 가능

## 2. 해결하려는 문제

담임과 수업, 여러 업무를 동시에 수행하다 보면 회의, 일정, 할 일, 수업 진도 등 많은 정보를 놓치기 쉽습니다. 여러 곳에 흩어진 정보를 반복해서 기록하고 확인해야 하는 번거로움과 정보 정리 및 수업 시수 계산에 드는 시간을 줄이고자 했습니다.

## 3. 해결 방법

기존에 제작했던 안정적인 교사용 업무 비서를 바탕으로, 실제 업무에 자주 사용하는 핵심 기능을 선별하여 소규모 웹앱으로 재구성했습니다. 일정, 업무, 시간표, 학사일정과 수업 진도를 한 공간에서 관리하고, 반복적인 정보 정리와 수업 시수 계산을 지원하도록 구성했습니다. 또한 AI 비서를 통해 필요한 정보를 질문하거나 일정과 업무 처리를 요청할 수 있도록 했습니다.

## 4. 핵심 기능

* 등록된 수업, 일정과 업무를 종합하여 오늘의 브리핑을 제공합니다.
* 시간표와 학사일정을 바탕으로 수업 진도와 예상·실제 수업 시수를 관리합니다.
* 일정, 할 일과 업무 자료를 한곳에서 관리합니다.
* AI 비서에게 필요한 정보를 질문하고 일정과 업무 처리를 요청할 수 있습니다.
* Google Calendar와 주요 일정을 연결하여 저장할 수 있습니다.
* 잘못 입력한 경우 수정해야 할 항목과 이유를 구체적으로 안내합니다.

## 5. 사용 흐름

1. Google 계정으로 로그인합니다.
2. 시간표, 학사일정, 일정과 업무 정보를 등록합니다.
3. 수업 진도, 할 일과 필요한 자료를 한곳에서 관리합니다.
4. 필요한 경우 Google Calendar를 연결하여 일정을 저장합니다.
5. 오늘의 브리핑을 확인하고 AI 비서에게 필요한 내용을 질문하거나 업무 처리를 요청합니다.

## 6. 검토 및 개선

### 자기 점검

* 고친 것: AI 기능 연결 오류
* 문제: Firebase AI Logic과 Google Cloud의 reCAPTCHA Enterprise를 연결하는 과정에서 설정 오류가 발생하여 AI 기능이 작동하지 않았습니다.
* 개선 방법: 오류 내용을 확인하고 reCAPTCHA Enterprise API를 활성화한 뒤 올바른 보안 키를 새로 만들어 연결했습니다.
* 분류: 오늘 고침
* 추후 보완할 것: 다른 교사도 AI 기능을 간편하게 연결할 수 있도록 배포와 설정 과정을 개선하고 싶습니다.

### AI 점검

* 고친 것: 잘못 입력했을 때 무엇을 수정해야 하는지 알기 어려운 문제
* 개선 전: 잘못 입력하면 저장되지 않았지만 그 이유를 알기 어려웠습니다.
* 개선 후: 잘못된 입력란 아래에 구체적인 오류 메시지를 표시하고 해당 입력란으로 이동하도록 개선했습니다.
* 분류: 오늘 고침
* 추후 보완할 것: 입력 과정을 단순화하려면 여러 입력 항목과 기능을 모두 검토하고 수정해야 하므로, 제한된 시간 안에 진행하기 어려워 추후 보완하기로 했습니다.

## 7. 성찰과 성장

* 사람이 직접 확인한 일: 이전에 만들었던 안정적인 버전과 현재 앱의 설정을 비교하며 문제가 생긴 부분을 찾고, 수정 후 기능이 제대로 작동하는지 직접 확인했습니다.
* 개인정보 처리: Google 로그인과 사용자별 업무 데이터 저장을 위해 필요한 정보를 처리하며, 개인정보 처리방침을 통해 처리 목적과 방법을 안내합니다. 학생 개인정보나 민감한 내용은 AI에 입력하지 않도록 주의해야 합니다.
* 배운 점: 이전에는 개인적으로 사용하는 프로그램을 만드는 데 집중했다면, 이제는 꼭 필요한 기능을 선별하여 소규모 웹앱으로 구성하고 직접 배포해 다른 사람들과 공유할 수 있게 되었습니다. 또한 AI가 사용자의 요청을 이해하고 일정과 업무를 처리하는 과정을 구현하며 AI 에이전트의 구조와 개발 방법을 더 깊이 이해하게 되었습니다.
* 다음 계획: 현재는 일정과 업무를 직접 입력하는 과정이 다소 복잡하고, 앱을 복제해 사용하는 과정에서 AI 연결과 보안 설정도 어렵습니다. 앞으로 입력 화면을 단순화하고, 다른 교사들이 자신의 Google AI 키를 안전하고 간편하게 연결할 수 있도록 배포 과정을 개선하고 싶습니다.

## 8. 사용 도구

* ChatGPT
* Claude
* Antigravity

## 9. GitHub 저장소

https://github.com/sol-ssam/teacher-work-assistant

## 10. 바로 사용하기

https://teacher-work-assistant.vercel.app/

---

아래부터는 이 프로젝트를 실행·배포하거나 직접 살펴보고 싶은 분들을 위한 안내입니다.

## 11. 기술 구성

| 구분 | 기술 | 역할 |
|---|---|---|
| 프레임워크 | [Vite](https://vite.dev/) + [React](https://react.dev/) | 화면 개발과 빌드 |
| 라우팅 | React Router | 페이지 간 이동 |
| 로그인 | Firebase Authentication (Google 로그인) | 사용자 인증 |
| 데이터베이스 | Cloud Firestore | 사용자별 업무 데이터 저장 |
| AI | Firebase AI Logic + Google Gemini(`gemini-3.1-flash-lite`) | AI 비서 대화, 문서·시간표·학사일정 분석 |
| 보안 | Firebase App Check + Google reCAPTCHA Enterprise | 정상적인 요청인지 확인해 부정 사용 방지 |
| 일정 연동 | Google Calendar API + Google Identity Services | Google 계정으로 캘린더 접근 권한 요청 및 일정 동기화 |
| 문서 분석 보조 | mammoth, xlsx(SheetJS) | 워드/엑셀 파일을 텍스트로 변환해 AI에 전달 |
| 배포 | [Vercel](https://vercel.com/) | 프론트엔드 정적 호스팅 |
| 코드 검사 | oxlint | 코드 스타일·오류 검사 |

실제 사용 중인 라이브러리는 `package.json`에서 확인할 수 있습니다.

## 12. 프로젝트 구조

```
src/
├── pages/       # 화면 단위 컴포넌트 (홈, 일정, 업무, 시간표, 진도, 설정, 로그인 등)
├── components/  # 여러 화면이 함께 쓰는 UI 조각 (사이드바, 모달, 오류 메시지 등)
├── contexts/    # 로그인 사용자, Google Calendar 연결 상태 등 전역 상태
├── firebase/    # Firebase 초기화, 인증, Firestore 읽기/쓰기, App Check, AI 인스턴스
├── calendar/    # Google Calendar 인증(OAuth) 및 API 호출
├── ai/          # AI 비서 대화, 문서/시간표/학사일정 분석, AI가 호출하는 기능(도구) 정의
├── utils/       # 날짜 계산, 진도 비교, 입력값 검증 등 여러 화면이 공유하는 로직
└── styles/      # 전역 디자인 토큰(색상, 여백 등)
```

## 13. 로컬 실행 방법

```bash
npm install
npm run dev
```

- 로컬 개발에는 프로젝트 루트에 `.env.local` 파일을 만들어 사용합니다. (`.env.example`을 참고해 값을 채워주세요.)
- `.env`, `.env.local`과 실제 키 값은 GitHub 저장소에 절대 커밋하지 않습니다. (`.gitignore`에 이미 포함되어 있습니다.)
- 로컬에서 App Check 동작을 확인하려면 별도의 실제 인증 없이도 통과되는 **Firebase Debug Token**을 사용합니다. 처음 실행하면 브라우저 콘솔에 디버그 토큰이 출력되며, 이를 Firebase 콘솔의 App Check → Debug Tokens에 등록하면 됩니다.
- 이 디버그 토큰은 로컬 개발 전용입니다. Vercel 등 운영 환경 변수에는 절대 넣지 않습니다.

## 14. 환경변수

`.env.local`(로컬) 또는 Vercel 프로젝트 설정(운영)에 아래 값을 등록합니다. 실제 값은 각자의 Firebase/Google Cloud 프로젝트에서 발급받아 채워야 하며, 이 저장소에는 값을 기록하지 않습니다.

```env
# Firebase 프로젝트 설정 (Firebase 콘솔 > 프로젝트 설정 > 내 앱)
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# Firebase App Check용 reCAPTCHA Enterprise 사이트 키
VITE_RECAPTCHA_ENTERPRISE_SITE_KEY=

# Google Calendar 연동용 OAuth 클라이언트 ID (공개 클라이언트 ID, client secret 아님)
VITE_GOOGLE_OAUTH_CLIENT_ID=

# 로컬 개발 전용, 선택 사항 - App Check Debug Token
VITE_APPCHECK_DEBUG_TOKEN=

# 선택 사항 - 개인정보 처리방침(/privacy) 하단에 표시할 문의 이메일. 비워두면 "문의 채널이 아직 설정되지 않았습니다."로 표시됩니다.
VITE_PRIVACY_CONTACT_EMAIL=
```

> Firebase 웹 설정값과 reCAPTCHA 사이트 키는 브라우저에 노출되어도 되는 클라이언트 설정값이지만, 그렇다고 이 문서에 실제 값을 적지는 않습니다. 각자 발급받은 값을 `.env.local`/Vercel에만 등록해 주세요.
> 이 프로젝트는 별도의 Gemini 비밀 API 키(예: `GEMINI_API_KEY`)를 사용하지 않습니다. AI 기능은 Firebase AI Logic을 통해 위 Firebase 설정값만으로 동작합니다.

## 15. Firebase 설정

다른 Firebase 프로젝트로 이 앱을 배포하려면 아래 순서로 준비합니다.

1. [Firebase 콘솔](https://console.firebase.google.com/)에서 새 프로젝트를 만듭니다.
2. 프로젝트에 웹 앱을 등록하고, 발급되는 설정값을 위 14번 환경변수에 채웁니다.
3. **Authentication**에서 로그인 방법 중 **Google**을 활성화합니다.
4. **Firestore Database**를 생성합니다.
5. 이 저장소에 포함된 `firestore.rules`를 Firebase 콘솔에 그대로 적용합니다. (Firebase CLI를 쓴다면 `firebase deploy --only firestore:rules`)
6. **Build > AI Logic** 메뉴에서 Firebase AI Logic을 설정하고, Gemini Developer API 백엔드를 사용하도록 활성화합니다.

## 16. App Check 및 reCAPTCHA Enterprise 설정

App Check는 정상적인 내 앱에서 온 요청인지 확인해 Firestore/AI 사용량이 부정하게 소모되는 것을 막아줍니다.

1. Firebase 콘솔의 **App Check**에서 앞서 등록한 웹 앱을 등록합니다.
2. Google Cloud 콘솔에서 같은 프로젝트의 **reCAPTCHA Enterprise API**를 활성화합니다.
   - ⚠️ Google Cloud Marketplace에서 reCAPTCHA Enterprise "제품"을 구독/등록하는 것과 **API 자체를 활성화하는 것은 다릅니다.** API가 활성화되어 있지 않으면 App Check 토큰 교환 과정에서 `400` 오류가 발생할 수 있습니다.
3. 같은 Google Cloud 프로젝트에서 **웹사이트용 점수 기반(Score-based) reCAPTCHA Enterprise 키**를 새로 만듭니다.
4. 이 키에 실제 사용할 **Vercel 운영 도메인**을 등록합니다.
   - 로컬 개발 주소(`localhost`)는 운영용 키에 등록하지 않습니다. 로컬에서는 13번의 Debug Token을 사용합니다.
5. 발급받은 reCAPTCHA 키 ID를 **Firebase App Check 설정**과 **Vercel 환경변수(`VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`)** 양쪽에 동일하게 등록합니다.
6. App Check를 곧바로 "적용(Enforce)" 상태로 두지 말고, 먼저 **모니터링(Unenforced)** 상태로 얼마간 운영하며 정상 요청이 App Check를 잘 통과하는지 확인한 뒤 적용 상태로 전환하는 것을 권장합니다.

## 17. Google Calendar 설정

이 앱은 Google Identity Services의 토큰 클라이언트 방식을 사용합니다. 별도 서버가 없어도 브라우저에서 바로 접근 토큰을 받을 수 있는 대신, 리프레시 토큰 없이 짧은 유효기간(약 1시간) 토큰만 사용합니다.

1. Google Cloud 콘솔에서 **Google Calendar API**를 활성화합니다.
2. **OAuth 동의 화면**을 설정합니다.
3. **OAuth 클라이언트 ID**를 "웹 애플리케이션" 유형으로 새로 만듭니다.
4. **승인된 JavaScript 원본(Authorized JavaScript origins)**에 실제 Vercel 운영 주소를 등록합니다. (이 방식은 별도의 리디렉션 URI 등록이 필요하지 않습니다.)
5. 발급된 OAuth 클라이언트 ID를 Vercel 환경변수(`VITE_GOOGLE_OAUTH_CLIENT_ID`)에 등록합니다.
6. OAuth 동의 화면이 "테스트" 상태라면, 실제로 Google Calendar 연동을 사용할 계정을 **테스트 사용자**로 등록해야 합니다.
7. 학교(기관)에서 발급한 Google Workspace 계정은 관리자 정책에 따라 타사 앱 연동이 제한될 수 있습니다.

## 18. Vercel 배포 방법

1. [Vercel](https://vercel.com/)에서 이 GitHub 저장소를 새 프로젝트로 연결합니다.
2. Framework Preset이 Vite로 인식되는지, 빌드 명령(`npm run build`)과 출력 폴더(`dist`)가 올바른지 확인합니다.
3. 14번의 환경변수를 Vercel 프로젝트 설정에 등록합니다.
4. Production으로 배포합니다.
5. 환경변수를 변경한 경우에는 다시 배포해야 반영됩니다. 반대로 Firestore 보안 규칙이나 Firebase 콘솔 설정만 바꾼 경우에는 Vercel을 다시 배포할 필요가 없습니다.
6. 이 저장소는 Vite로 만든 SPA(단일 페이지 앱)이므로, `vercel.json`에 모든 경로를 `index.html`로 연결하는 rewrite 설정이 포함되어 있습니다. 이 설정 덕분에 `/privacy`, `/terms`처럼 로그인 없이 열리는 하위 경로를 주소창에 직접 입력하거나 새로고침해도 404가 발생하지 않습니다. 이 설정은 그대로 유지해야 합니다.
7. 배포할 때마다 새로 생성되는 미리보기(preview) 주소가 아니라, 고정된 **Production 도메인**을 16번(reCAPTCHA)과 17번(OAuth) 설정에 등록해야 합니다.

## 19. 다른 교사를 위한 포크 및 독립 배포 방법

### 운영 중인 공용 앱 이용

- 운영자가 허용한 사용자가 10번의 배포 주소에 접속해 자신의 Google 계정으로 로그인합니다.
- 모든 데이터는 로그인한 계정별로 구분되어 저장되며, 다른 사용자의 데이터를 볼 수 없습니다.
- Google OAuth 동의 화면이 테스트 상태라면, 운영자가 미리 그 계정을 테스트 사용자로 등록해 두어야 로그인·캘린더 연동이 가능합니다.
- Google Calendar 연동은 각자 자신의 Google 계정으로 직접 연결합니다.

### 저장소를 포크하여 독립적으로 배포

1. 이 저장소를 자신의 GitHub 계정으로 포크합니다.
2. 자신의 Firebase 프로젝트, Google Cloud 프로젝트, Vercel 프로젝트를 15~18번 순서에 따라 준비합니다.
3. 자신의 환경변수를 14번에 맞춰 등록합니다.
4. 이후에는 자신의 프로젝트 사용량과 데이터로 완전히 독립적으로 운영됩니다.

현재는 API 키 하나만 넣으면 곧바로 모든 기능이 동작하는 완전한 원클릭 배포 방식은 아니며, 위와 같이 Firebase·Google Cloud·Vercel을 각각 준비하는 과정이 필요합니다.

## 20. 보안과 개인정보 주의사항

- 학생의 이름, 상담 내용, 건강정보 등 개인정보와 민감정보는 AI 비서나 문서 분석 등 어떤 입력창에도 입력하지 않도록 안내합니다.
- API 키, OAuth 클라이언트 ID, App Check Debug Token 등은 GitHub에 커밋하지 않습니다.
- Firestore 보안 규칙을 테스트용으로 전체 허용해 둔 상태로 운영하지 않습니다.
- 모든 업무 데이터는 사용자의 `uid`(Firestore 문서의 `ownerId`)를 기준으로 접근이 제한됩니다.
- App Check는 16번 안내처럼 충분히 모니터링한 뒤 적용 상태로 전환합니다.
- AI가 생성한 답변이나 AI가 대신 등록·수정한 일정·업무는 반드시 사용자가 최종 확인합니다.

## 21. 현재 제한사항

- Google OAuth 동의 화면이 테스트 상태인 경우, 등록된 테스트 사용자만 Google Calendar 인증을 진행할 수 있습니다.
- 학교 등 기관에서 발급한 Google Workspace 계정은 기관의 보안 정책에 따라 로그인이나 캘린더 연동이 제한될 수 있습니다.
- Google Calendar 접근 토큰은 브라우저 메모리에만 짧게 보관되며 새로고침하거나 연결이 끊기면 다시 연결해야 하므로, 연결 상태나 권한에 따라 캘린더 저장이 제한될 수 있습니다.
- AI 비서와 Firestore 사용량은 각 배포자가 연결한 Firebase/Google Cloud 프로젝트의 할당량과 요금제를 따릅니다.
- 계정 탈퇴(Firebase Authentication 계정 자체 삭제)나 데이터 내보내기/백업 기능은 아직 제공하지 않습니다. 설정 화면의 데이터 초기화는 Firestore에 저장된 업무 데이터만 삭제합니다.

## 22. 향후 개선 계획

아래는 아직 구현되지 않은, 앞으로 검토할 방향입니다.

- 일정과 업무를 수동으로 등록하는 입력 과정 단순화
- 필수 항목과 선택 항목을 화면에서 더 명확하게 구분
- 저장소를 포크한 교사가 더 쉽게 배포할 수 있도록 설정 안내와 과정 개선
- Firebase AI Logic(공용 프로젝트) 대신, 각 배포자가 자신의 Gemini API 환경을 안전하게 연결할 수 있는 방식 검토
- API 키를 브라우저에 직접 노출하지 않는 서버 측 호출 방식 검토
- 개인정보 및 보안 관련 안내를 지속적으로 보완

## 23. 이용약관과 개인정보 처리방침

- 개인정보 처리방침: `/privacy`
- 이용약관: `/terms`

두 페이지 모두 로그인하지 않은 상태에서도 열람할 수 있습니다.

## 24. 라이선스 및 문의

라이선스는 별도 확인이 필요합니다.

문의: [운영자 정보 입력 필요]
