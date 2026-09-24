import { doc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { WORK_DATA_COLLECTIONS, deleteAllInCollection } from "../firebase/resetData";
import { signOutUser } from "../firebase/authService";

// '미리보기 종료' 전용 정리. Anonymous(미리보기) 사용자가 체험 중 만든 모든 데이터를 지운다.
//
// - "preview_로 시작하는 ID"가 아니라 ownerId == 현재 익명 UID로 조회한 문서만 지운다.
//   그래서 seed 문서뿐 아니라 체험 중 직접/AI로 추가한 일정·업무·시간표 변경·진도 기록도
//   모두 지워지고, 다른 사용자(다른 Preview UID, Google 사용자)의 문서는 조회 결과에 포함되지
//   않으므로 삭제될 수 없다(Firestore Rules도 같은 조건으로 이중 방어한다).
// - 삭제 로직은 기존 deleteAllInCollection(ownerId 조회 + 400개 단위 batch 삭제)을 그대로 쓴다.
// - 한 컬렉션이 실패해도 나머지는 계속 지우고(재시도 때 이어서 정리된다), 마지막에 실패가 있으면
//   오류를 던진다. 이때 settings는 지우지 않는다 - 모든 업무 데이터 삭제가 성공한 뒤에만 지운다.
export async function cleanupPreviewUserData(user) {
  if (!user || user.isAnonymous !== true || !user.uid) {
    throw new Error("cleanupPreviewUserData는 미리보기(익명) 사용자에게만 사용할 수 있습니다.");
  }
  const uid = user.uid;

  const failed = [];
  for (const name of WORK_DATA_COLLECTIONS) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await deleteAllInCollection(name, uid);
    } catch (error) {
      console.error(`[Preview cleanup] ${name} 삭제 실패:`, error?.code, error?.message);
      failed.push(name);
    }
  }
  if (failed.length > 0) {
    throw new Error(`미리보기 데이터 삭제에 실패한 컬렉션이 있습니다: ${failed.join(", ")}`);
  }

  // settings/{uid}는 ownerId 방식이 아니라 문서 ID가 곧 uid다.
  await deleteDoc(doc(db, "settings", uid));
}

// 미리보기 종료 전체 순서: 업무 데이터 삭제 → settings 삭제 → (전부 성공한 뒤에만) signOut.
// signOut 후에는 request.auth가 없어 자기 데이터를 지울 수 없으므로 반드시 삭제가 먼저다.
// 삭제가 실패하면 예외를 그대로 던지고 signOut하지 않는다 - 호출부가 다시 시도할 수 있다.
export async function endPreviewSession(user) {
  await cleanupPreviewUserData(user);
  await signOutUser();
}
