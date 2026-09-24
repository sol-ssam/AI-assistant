import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  getToken,
} from "firebase/app-check";

import { app } from "./config";

let appCheckInstance = null;

// Firebase App Check
// - 실제 배포 사이트: reCAPTCHA Enterprise 사용
// - 로컬 개발: Firebase App Check Debug Provider 사용
// - 사이트 키는 .env의 VITE_RECAPTCHA_ENTERPRISE_SITE_KEY에서 불러온다.

export function initAppCheck() {
  if (appCheckInstance) return appCheckInstance;

  const siteKey =
    import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY;

  if (import.meta.env.DEV) {
    // 로컬 개발용 Debug Provider
    self.FIREBASE_APPCHECK_DEBUG_TOKEN =
      import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true;
  }

  if (!siteKey) {
    console.warn(
      "[AppCheck] VITE_RECAPTCHA_ENTERPRISE_SITE_KEY가 설정되지 않아 " +
        "App Check를 초기화하지 않았습니다."
    );

    return null;
  }

  appCheckInstance = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });

  return appCheckInstance;
}
export async function testAppCheckToken() {
  const appCheck = initAppCheck();

  if (!appCheck) {
    console.error("[AppCheck Test] App Check가 초기화되지 않았습니다.");
    return;
  }

  try {
    const result = await getToken(appCheck, true);

    console.log(
      "[AppCheck Test] 토큰 발급 성공:",
      Boolean(result?.token)
    );
  } catch (error) {
    console.error("[AppCheck Test] 토큰 발급 실패:", error);
  }
}