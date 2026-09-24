import { doc, writeBatch } from "firebase/firestore";
import { db } from "../firebase/config";
import { getSettings } from "../firebase/settingsService";
import { todayDateString } from "../utils/date";
import { buildPreviewSeed, assertPreviewSeedIntegrity, PREVIEW_SEED_VERSION } from "./previewSeedData";

// 같은 uid에 대해 동시에 두 번 호출돼도(React StrictMode 등) seed 작업이 한 번만 진행되게 한다.
const inflight = new Map();

// Anonymous(미리보기) 사용자의 샘플 데이터를 한 번만 만든다.
//
// - user.isAnonymous === true인 경우에만 동작한다. Google 사용자는 어떤 경우에도 여기서
//   아무것도 쓰지 않고 바로 돌아간다.
// - 모든 seed 문서와 완료 marker(settings/{uid}.previewInitialized)를 "하나의 writeBatch"로
//   커밋한다. 배치는 전부 성공하거나 전부 실패하므로, 중간에 실패한 채로 "초기화 완료"가
//   기록되는 일이 없다.
// - 문서 ID는 고정(deterministic)이면서 사용자 UID를 포함한다(preview_{uid}_...). 같은 사용자가
//   재시도해도 같은 문서를 덮어쓸 뿐 중복되지 않고, 다른 Preview 사용자의 문서와는 절대 충돌하지 않는다.
// - 모든 문서의 ownerId는 현재 익명 사용자의 UID다(기존 Firestore Rules 그대로 통과).
export function ensurePreviewData(user) {
  if (!user || user.isAnonymous !== true) {
    return Promise.resolve({ seeded: false, reason: "not-anonymous" });
  }

  const existing = inflight.get(user.uid);
  if (existing) return existing;

  const task = (async () => {
    const settings = await getSettings(user.uid);
    if (settings.previewInitialized === true) {
      return { seeded: false, reason: "already-initialized" };
    }

    const today = todayDateString();
    const nowIso = new Date().toISOString();
    const seed = buildPreviewSeed({ uid: user.uid, today, nowIso });
    assertPreviewSeedIntegrity(seed, user.uid);

    const batch = writeBatch(db);
    for (const { collection, id, data } of seed.docs) {
      batch.set(doc(db, collection, id), data);
    }
    batch.set(
      doc(db, "settings", user.uid),
      {
        previewInitialized: true,
        previewSeedVersion: PREVIEW_SEED_VERSION,
        previewSeededAt: nowIso,
        previewSeedDate: today,
      },
      { merge: true }
    );
    await batch.commit();

    return { seeded: true, count: seed.docs.length };
  })().finally(() => {
    inflight.delete(user.uid);
  });

  inflight.set(user.uid, task);
  return task;
}
