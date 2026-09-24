import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./config";
import { todayDateString } from "../utils/date";

// workDays: 일요일 0 ~ 토요일 6(Date.getUTCDay()과 같은 체계 - utils/date.js의
// weekdayNumberOf가 이 체계로 계산한다). 기본값은 월~금.
const DEFAULT_SETTINGS = {
  briefingTime: "08:20",
  lastBriefingDate: null,
  workDays: [1, 2, 3, 4, 5],
  workStartTime: "09:00",
  workEndTime: "18:00",
  focusMinMinutes: 60,
  // 5-3-3: 완료 업무 자동 정리 - 0(사용 안 함)/30/90(일). 새 필드가 없는 기존 사용자는
  // 아래 기본값(0, 사용 안 함)으로 시작하므로 마이그레이션 없이도 자동 정리가 절대
  // 임의로 켜지지 않는다.
  completedTaskAutoTrashDays: 0,
  // 5-3-3: 자동 정리(완료 업무 휴지통 이동 + 휴지통 30일 경과 영구 삭제)를 마지막으로
  // "성공"한 날짜(YYYY-MM-DD, Asia/Seoul). shouldTriggerAutoBriefing/lastBriefingDate와
  // 같은 패턴 - 오늘 아직 성공하지 못했으면 다시 시도한다.
  lastTrashSweepDate: null,
};

export async function getSettings(uid) {
  const ref = doc(db, "settings", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? { ...DEFAULT_SETTINGS, ...snap.data() } : DEFAULT_SETTINGS;
}

export async function markBriefingShownToday(uid) {
  const ref = doc(db, "settings", uid);
  await setDoc(ref, { lastBriefingDate: todayDateString() }, { merge: true });
}

// 사용자가 SettingsPage에서 직접 바꾸는 브리핑 기준 시간. 08:20은 기본값일 뿐이며
// 여기서 언제든 다른 시간으로 바꿀 수 있다. lastBriefingDate/자동 브리핑 로직은 그대로다.
export async function updateBriefingTime(uid, briefingTime) {
  const ref = doc(db, "settings", uid);
  await setDoc(ref, { briefingTime }, { merge: true });
}

// 근무 요일·근무시간·집중 시간 기준. 새 필드가 없는 기존 사용자는 getSettings()의
// DEFAULT_SETTINGS 병합으로 위 기본값을 그대로 받으므로, 이 화면을 한 번도 열지 않은
// 사용자도 정상 동작한다(마이그레이션 불필요).
export async function updateWorkHoursSettings(uid, { workDays, workStartTime, workEndTime, focusMinMinutes }) {
  const ref = doc(db, "settings", uid);
  await setDoc(ref, { workDays, workStartTime, workEndTime, focusMinMinutes }, { merge: true });
}

// 완료 업무 자동 정리 기간 - 0(사용 안 함)/30/90. SettingsPage에서 일반 Google 사용자에게만
// 노출한다(게스트에게는 이 설정 UI 자체를 보여주지 않는다).
export async function updateCompletedTaskAutoTrashDays(uid, completedTaskAutoTrashDays) {
  const ref = doc(db, "settings", uid);
  await setDoc(ref, { completedTaskAutoTrashDays }, { merge: true });
}

// firebase/trashSweep.js가 자동 정리를 전부 성공적으로 마쳤을 때만 호출한다 - 일부만
// 성공하면 이 값을 기록하지 않아, 다음 진입에서 남은 대상을 다시 시도할 수 있게 한다.
export async function markTrashSweepDone(uid) {
  const ref = doc(db, "settings", uid);
  await setDoc(ref, { lastTrashSweepDate: todayDateString() }, { merge: true });
}
