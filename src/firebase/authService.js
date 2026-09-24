import { signInWithPopup, signInAnonymously, signOut } from "firebase/auth";
import { auth, googleProvider } from "./config";

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

// '미리보기로 체험하기' - Firebase Anonymous 로그인. 호출할 때마다 사용자별로 고유한 익명
// UID가 생긴다(모든 체험 사용자가 하나의 공용 계정을 쓰지 않는다). 샘플 데이터 준비는 여기서
// 하지 않고, AuthContext가 익명 사용자를 감지했을 때 처리한다.
export async function signInAsPreviewUser() {
  const result = await signInAnonymously(auth);
  return result.user;
}

export async function signOutUser() {
  await signOut(auth);
}
