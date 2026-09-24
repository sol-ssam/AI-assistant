import { createContext, useCallback, useContext, useRef, useState } from "react";
import { requestCalendarAccessToken, isGoogleCalendarConfigured } from "../calendar/googleAuth";

const GoogleCalendarContext = createContext(null);

// 이 프로젝트는 서버가 없어 refresh token을 쓸 수 없으므로, access token은 이 컨텍스트의
// 메모리(state)에만 잠깐 보관한다. 새로고침하거나 브라우저를 닫으면 사라지고, 다시
// "연결하기"를 눌러야 한다. Firestore나 localStorage에는 절대 저장하지 않는다.
export function GoogleCalendarProvider({ children }) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const tokenRef = useRef(null); // { accessToken, expiresAt }

  const configured = isGoogleCalendarConfigured();

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const token = await requestCalendarAccessToken({ interactive: true });
      tokenRef.current = token;
      setConnected(true);
    } catch (e) {
      setError(e.message || "Google Calendar 연결에 실패했습니다.");
      setConnected(false);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    tokenRef.current = null;
    setConnected(false);
    setError(null);
  }, []);

  // 실제 Calendar API를 호출하기 직전에 쓴다. 토큰이 곧 만료되거나 없으면 조용히
  // 재발급을 시도하고, 그마저 실패하면 null을 반환한다 - 이 경우 호출부는 "Google
  // Calendar 연결이 필요합니다" 정도로 안내하고 Firestore 처리는 계속 진행해야 한다.
  const getValidAccessToken = useCallback(async () => {
    const current = tokenRef.current;
    const bufferMs = 60 * 1000;
    if (current && current.expiresAt - bufferMs > Date.now()) {
      return current.accessToken;
    }

    try {
      const token = await requestCalendarAccessToken({ interactive: false });
      tokenRef.current = token;
      setConnected(true);
      return token.accessToken;
    } catch {
      setConnected(false);
      return null;
    }
  }, []);

  return (
    <GoogleCalendarContext.Provider
      value={{ configured, connected, connecting, error, connect, disconnect, getValidAccessToken }}
    >
      {children}
    </GoogleCalendarContext.Provider>
  );
}

export function useGoogleCalendar() {
  const ctx = useContext(GoogleCalendarContext);
  if (!ctx) throw new Error("useGoogleCalendar는 GoogleCalendarProvider 내부에서만 사용할 수 있습니다.");
  return ctx;
}
