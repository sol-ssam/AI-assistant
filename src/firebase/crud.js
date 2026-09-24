import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "./config";

// Phase 1의 firestore.rules가 허용하는 컬렉션들 — ownerId 필드로 소유자를 구분한다.
// 정렬은 클라이언트에서 처리해 별도 복합 색인(composite index) 없이 동작하도록 한다.

export async function createDoc(collectionName, uid, data) {
  const ref = await addDoc(collection(db, collectionName), {
    ...data,
    ownerId: uid,
  });
  return ref.id;
}

export async function updateDocById(collectionName, id, data) {
  await updateDoc(doc(db, collectionName, id), data);
}

export async function deleteDocById(collectionName, id) {
  await deleteDoc(doc(db, collectionName, id));
}

export async function listDocsByOwner(collectionName, uid) {
  const q = query(collection(db, collectionName), where("ownerId", "==", uid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ===== 일정(events)·업무(tasks) 휴지통(soft delete) 전용 헬퍼 =====
//
// listDocsByOwner()는 위 계약(ownerId의 모든 문서를 그대로 반환) 그대로 둔다 - 초기화
// (resetData.js)·게스트 종료(demo/cleanupPreviewData.js)와 events/tasks 외의 다른 컬렉션
// (timetable, progress_* 등)에서도 여전히 "전체 조회"가 필요하기 때문이다. 대신 일정·업무
// 화면·브리핑·AI가 쓸 "활성 문서만" 조회하는 함수와, 휴지통 화면이 쓸 "휴지통 문서만"
// 조회하는 함수를 별도로 추가한다.
//
// 활성/휴지통 판정 기준은 단 하나: !doc.deletedAt. 기존 문서에는 deletedAt 필드 자체가
// 없으므로 항상 활성 문서로 취급된다(마이그레이션 불필요).
function isTrashedDoc(docData) {
  return !!docData?.deletedAt;
}

export async function listActiveDocsByOwner(collectionName, uid) {
  const all = await listDocsByOwner(collectionName, uid);
  return all.filter((d) => !isTrashedDoc(d));
}

// 휴지통 화면 전용 - ownerId로 한 번만 읽은 뒤 클라이언트에서 deletedAt이 있는 문서만
// 남긴다. deletedAt에 대한 별도 Firestore where절/복합 색인을 요구하지 않는다.
export async function listTrashedDocsByOwner(collectionName, uid) {
  const all = await listDocsByOwner(collectionName, uid);
  return all.filter((d) => isTrashedDoc(d));
}

// 휴지통 이동(soft delete) - 문서의 기존 필드는 전혀 건드리지 않고 아래 3개 필드만
// 추가·갱신한다. deleteReason: 사용자가 직접 삭제하면 "manual", AI 비서가 삭제하면 "ai".
export async function softDeleteDocById(collectionName, id, deleteReason) {
  const now = new Date().toISOString();
  await updateDoc(doc(db, collectionName, id), {
    deletedAt: now,
    deleteReason,
    updatedAt: now,
  });
}

// 휴지통 복원 - deletedAt/deleteReason 필드 자체를 지운다(deleteField). null로 남기지
// 않는 이유: 복원된 문서가 "이 필드가 아예 없는 기존 활성 문서"와 완전히 같은 모양이 되어
// 활성/휴지통 판정 기준(!doc.deletedAt)과 항상 일관되게 동작한다. status/completed/
// completedAt/Calendar 연결 필드/반복 필드/준비사항 등 그 외 필드는 전혀 건드리지 않는다.
export async function restoreDocById(collectionName, id) {
  await updateDoc(doc(db, collectionName, id), {
    deletedAt: deleteField(),
    deleteReason: deleteField(),
    updatedAt: new Date().toISOString(),
  });
}

// Firestore batch 쓰기 한도(500)보다 여유 있게 잡는다 - resetData.js의 BATCH_CHUNK_SIZE와
// 같은 값이다(자동 정리에서만 쓰는 값이라 그 파일을 import하지 않고 여기 별도로 둔다).
const AUTO_SWEEP_BATCH_CHUNK_SIZE = 400;

// 여러 문서를 한 번에 휴지통으로 이동한다(soft delete의 batch 버전) - 5-3-3 완료 업무
// 자동 정리처럼 "한 번에 여러 문서"를 처리해야 하는 경우 전용이다. 단건 삭제
// (softDeleteDocById)는 그대로 두고 새 함수만 추가했다 - 기존 호출부는 영향받지 않는다.
export async function softDeleteDocsBatch(collectionName, ids, deleteReason) {
  const now = new Date().toISOString();
  for (let i = 0; i < ids.length; i += AUTO_SWEEP_BATCH_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + AUTO_SWEEP_BATCH_CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((id) => {
      batch.update(doc(db, collectionName, id), { deletedAt: now, deleteReason, updatedAt: now });
    });
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
}

// 여러 문서를 한 번에 영구 삭제한다(deleteDocById의 batch 버전) - 휴지통 30일 자동 영구
// 삭제 전용이다. 특정 id 목록만 지운다는 점에서 "컬렉션 전체"를 지우는
// resetData.js의 deleteAllInCollection과 다르다.
export async function deleteDocsBatch(collectionName, ids) {
  for (let i = 0; i < ids.length; i += AUTO_SWEEP_BATCH_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + AUTO_SWEEP_BATCH_CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((id) => batch.delete(doc(db, collectionName, id)));
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
}

// 여러 문서를 하나의 Firestore batch로 한 번에 생성한다 - 반복 일정·업무(utils/recurrence.js
// 사용처)처럼 "전부 성공하거나 전부 실패해야 하는" 다건 생성 전용이다. writeBatch는 단일
// 요청으로 커밋되므로 중간까지만 쓰이는 부분 성공이 없다. 일반 단건 저장(createDoc)은
// 그대로 두고 새 함수만 추가했다 - 기존 호출부는 전혀 영향받지 않는다. Firestore batch
// 한도(500)보다 이 앱의 반복 상한(50)이 훨씬 작으므로 청크 분할은 하지 않는다.
export async function createDocsBatch(collectionName, uid, docsData) {
  const batch = writeBatch(db);
  const refs = docsData.map(() => doc(collection(db, collectionName)));
  refs.forEach((ref, i) => {
    batch.set(ref, { ...docsData[i], ownerId: uid });
  });
  await batch.commit();
  return refs.map((ref) => ref.id);
}
