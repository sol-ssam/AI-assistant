import {
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "./config";
import { listActiveDocsByOwner } from "./crud";
import { todayDateString, todayWeekdayKorean, addDaysToDateString } from "../utils/date";

// 모든 문서는 ownerId 필드로 소유자를 구분한다 (Firestore Security Rules와 짝을 이룸).

function toDocs(snapshot) {
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// 아래 5개 함수는 ownerId로 컬렉션 전체를 한 번 읽은 뒤, 날짜/완료여부 등은 전부
// 클라이언트에서 걸러낸다. 예전에는 where(여러 필드)+orderBy를 함께 쓰는 조합이 있어
// Firestore 복합 색인이 필요할 수 있었는데, 이 프로젝트의 원칙(개인용 앱이라 데이터
// 규모가 작으므로 클라이언트 필터링을 우선한다)에 맞춰 정리했다. 함수 이름과 반환
// 형태는 그대로이므로 이 함수들을 쓰는 다른 코드(AI 비서 등)는 수정할 필요가 없다.
// listDocsByOwner 대신 listActiveDocsByOwner를 써서, 휴지통으로 이동(soft delete)한
// 일정·업무는 브리핑 등 이 함수들을 쓰는 모든 화면에서 자동으로 제외된다.

export async function getTodayEvents(uid) {
  const today = todayDateString();
  const all = await listActiveDocsByOwner("events", uid);
  return all
    .filter((e) => e.date === today)
    .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
}

export async function getTodayDueTasks(uid) {
  const today = todayDateString();
  const all = await listActiveDocsByOwner("tasks", uid);
  return all.filter((t) => t.dueDate === today && !t.completed);
}

export async function getUpcomingTasks(uid, withinDays = 7) {
  const today = todayDateString();
  const limitStr = addDaysToDateString(today, withinDays);
  const all = await listActiveDocsByOwner("tasks", uid);
  return all.filter((t) => !t.completed && t.dueDate > today && t.dueDate <= limitStr);
}

export async function getTodayTimetableOverrides(uid) {
  const today = todayDateString();
  const q = query(
    collection(db, "timetable_overrides"),
    where("ownerId", "==", uid),
    where("date", "==", today)
  );
  const snap = await getDocs(q);
  return toDocs(snap);
}

export async function getClassProgress(uid) {
  const q = query(collection(db, "class_progress"), where("ownerId", "==", uid));
  const snap = await getDocs(q);
  return toDocs(snap);
}

// --- Phase 3: 오늘의 브리핑 완성을 위해 추가된 조회 함수들 ---

export async function getTodayBaseTimetable(uid) {
  const day = todayWeekdayKorean();
  const q = query(
    collection(db, "timetable"),
    where("ownerId", "==", uid),
    where("dayOfWeek", "==", day)
  );
  const snap = await getDocs(q);
  return toDocs(snap).sort((a, b) => (a.period ?? 0) - (b.period ?? 0));
}

export async function getOverdueTasks(uid) {
  const today = todayDateString();
  const all = await listActiveDocsByOwner("tasks", uid);
  return all.filter((t) => !t.completed && t.dueDate < today);
}

export async function getUpcomingEvents(uid, withinDays = 7) {
  const today = todayDateString();
  const limitStr = addDaysToDateString(today, withinDays);
  const all = await listActiveDocsByOwner("events", uid);
  return all.filter((e) => e.date > today && e.date <= limitStr);
}
