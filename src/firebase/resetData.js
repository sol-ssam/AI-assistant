import { doc, deleteDoc, writeBatch } from "firebase/firestore";
import { db } from "./config";
import { listDocsByOwner } from "./crud";

// "업무 데이터"로 분류되어 초기화 대상이 되는 컬렉션들.
export const WORK_DATA_COLLECTIONS = [
  "timetable",
  "timetable_overrides",
  "lesson_plan",
  "class_progress",
  "events",
  "tasks",
  "source_documents",
  "homeroom_timetable",
  "progress_plans",
  "progress_checks",
  "school_day_schedules",
  "lesson_adjustments",
  "progress_current",
  "progress_history",
];

// Firestore 배치 쓰기 한도(500)보다 여유 있게 잡는다.
const BATCH_CHUNK_SIZE = 400;

// ownerId로 조회한 뒤 그 문서 id만 청크 단위 배치로 삭제한다. 다른 사용자의 문서는
// 애초에 이 조회 결과에 포함되지 않으므로 삭제될 수 없다.
// ownerId로 조회한 뒤 그 문서 id만 청크 단위 배치로 삭제한다. 다른 사용자의 문서는
// 애초에 이 조회 결과에 포함되지 않으므로 삭제될 수 없다. 데이터 초기화 외에도(예: 시간표
// 가져오기에서 기존 시간표를 교체할 때) 재사용한다.
export async function deleteAllInCollection(collectionName, uid) {
  const docs = await listDocsByOwner(collectionName, uid);
  for (let i = 0; i < docs.length; i += BATCH_CHUNK_SIZE) {
    const chunk = docs.slice(i, i + BATCH_CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((d) => batch.delete(doc(db, collectionName, d.id)));
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
  return docs;
}

// 업무 데이터(시간표~문서 분석 기록)만 삭제하고 settings/{uid}는 남긴다.
// 반환값의 deletedEvents는 삭제된 events 문서 목록으로, 호출부가 Google Calendar
// 정리 여부를 판단하는 데 사용한다. failedCollections는 실패한 컬렉션 이름 목록이다.
export async function resetWorkData(uid) {
  const failedCollections = [];
  let deletedEvents = [];

  for (const name of WORK_DATA_COLLECTIONS) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const docs = await deleteAllInCollection(name, uid);
      if (name === "events") deletedEvents = docs;
    } catch (e) {
      console.error(`[Reset] ${name} failed:`, e);
      failedCollections.push(name);
    }
  }

  return { deletedEvents, failedCollections };
}

// 업무 데이터 + settings/{uid}까지 삭제한다. Firebase Authentication 계정 자체는
// 건드리지 않는다.
export async function resetAllUserData(uid) {
  const result = await resetWorkData(uid);
  try {
    await deleteDoc(doc(db, "settings", uid));
  } catch (e) {
    console.error("[Reset] settings failed:", e);
    result.failedCollections.push("settings");
  }
  return result;
}
