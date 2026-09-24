// Google Calendar API 접근에는 Firebase Authentication의 Google 로그인과는 별개의
// OAuth 동의가 필요하다. Firebase Auth는 로그인/신원 확인용이고, Calendar 같은 추가
// 범위(scope)에 대한 access token은 별도로 받아야 한다.
//
// 이 프로젝트는 Spark(무료) 요금제만 쓰고 별도 서버가 없으므로, refresh token이 필요한
// 서버사이드 OAuth("Authorization Code" 플로우 + client secret)는 쓸 수 없다. 대신
// Google Identity Services(GIS)의 "Token Client"를 사용한다 - 공개 OAuth 클라이언트 ID
// 만으로 브라우저에서 바로 access token을 받을 수 있는 공식 클라이언트 전용 방식이다.
//
// 한계: 이 방식은 refresh token을 주지 않는다. access token은 보통 1시간 정도만
// 유효하고, 만료되면 사용자가 다시 "연결하기"를 눌러야 한다(같은 브라우저 세션이면
// 대부분 별도 동의 없이 조용히 재발급된다). 브라우저를 껐다 켜면 다시 연결해야 한다.
// 이건 서버 없이 만들 수 있는 구조의 근본적인 한계이며, Blaze/Cloud Functions 없이
// 처리하기 위한 의도적인 선택이다.

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

let scriptLoadPromise = null;
let tokenClient = null;

function loadGisScript() {
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Identity Services 스크립트를 불러오지 못했습니다."));
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

async function getTokenClient() {
  const clientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) {
    throw new Error(
      "VITE_GOOGLE_OAUTH_CLIENT_ID가 설정되지 않았습니다. .env 파일을 확인해 주세요."
    );
  }

  await loadGisScript();

  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: CALENDAR_SCOPE,
      callback: () => {}, // requestAccessToken() 호출마다 콜백을 새로 지정한다.
    });
  }

  return tokenClient;
}

// 사용자에게 Google Calendar 접근 동의를 요청하고, 성공하면 access token을 반환한다.
// 이미 같은 세션에서 동의한 적이 있다면 대부분 팝업 없이 조용히 재발급된다.
export async function requestCalendarAccessToken({ interactive = true } = {}) {
  const client = await getTokenClient();

  return new Promise((resolve, reject) => {
    client.callback = (response) => {
      if (response.error) {
        reject(new Error(response.error));
        return;
      }
      resolve({
        accessToken: response.access_token,
        expiresAt: Date.now() + Number(response.expires_in ?? 3600) * 1000,
      });
    };
    client.error_callback = (err) => {
      reject(new Error(err?.message || "Google Calendar 연결이 취소되었습니다."));
    };
    if (interactive) {
      client.requestAccessToken();
    } else {
      client.requestAccessToken({ prompt: "" });
    }
  });
}

export function isGoogleCalendarConfigured() {
  return !!import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID;
}
