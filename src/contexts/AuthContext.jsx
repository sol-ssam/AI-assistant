import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../firebase/config";
import { ensurePreviewData } from "../demo/initializePreviewData";

const AuthContext = createContext(null);

const PREVIEW_PREPARE_ERROR_MESSAGE = "샘플 데이터를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // '미리보기로 체험하기'(Anonymous) 전용 상태 - Google 사용자에게는 항상 false/빈 문자열이다.
  const [previewPreparing, setPreviewPreparing] = useState(false);
  const [previewError, setPreviewError] = useState("");

  useEffect(() => {
    let runId = 0;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      const myRun = ++runId;

      // Google 사용자(또는 로그아웃 상태) - 기존 동작 그대로다.
      if (!firebaseUser || !firebaseUser.isAnonymous) {
        // 로그아웃(null) 직후에는 방금 실패한 미리보기 오류를 로그인 화면에 남겨 둬야 하므로,
        // 실제로 로그인한 사용자가 생겼을 때만 이전 오류를 지운다.
        if (firebaseUser) setPreviewError("");
        setPreviewPreparing(false);
        setUser(firebaseUser);
        setLoading(false);
        return;
      }

      // Anonymous 사용자 - 샘플 데이터 준비가 끝나기 전에는 user를 노출하지 않아서 Home이
      // 빈 화면으로 잠깐 나타나지 않는다(loading 화면이 계속 보인다).
      setPreviewError("");
      setPreviewPreparing(true);
      setLoading(true);

      ensurePreviewData(firebaseUser)
        .then(() => {
          if (myRun !== runId) return;
          setUser(firebaseUser);
          setPreviewPreparing(false);
          setLoading(false);
        })
        .catch(async (error) => {
          console.error("Preview data initialization failed:", error?.code, error?.message);
          if (myRun !== runId) return;
          setPreviewError(PREVIEW_PREPARE_ERROR_MESSAGE);
          setPreviewPreparing(false);
          // 준비에 실패한 익명 세션은 정리하고 로그인 화면으로 돌려보낸다.
          try {
            await signOut(auth);
          } catch (signOutError) {
            console.error("Preview sign-out after failure failed:", signOutError?.code, signOutError?.message);
          }
          if (myRun === runId) setLoading(false);
        });
    });

    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, previewPreparing, previewError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth는 AuthProvider 내부에서만 사용할 수 있습니다.");
  return ctx;
}
