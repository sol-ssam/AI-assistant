// 휴지통 자동 정리(5-3-3) 관련 "순수 판정 로직"만 모아둔 파일 - Firestore를 전혀
// import하지 않는다. firebase/trashSweep.js가 실제 조회·쓰기를 담당하고, 이 파일은 그
// 결과를 어떤 문서에 적용할지만 계산한다. Firestore 없이 배열/객체만으로 동작하므로
// 별도 테스트 러너를 설치하지 않고도(이 프로젝트는 새 패키지를 설치하지 않는다) 순수
// Node 스크립트로 경계값을 검증할 수 있다.
import { dateStringInSeoul, daysBetween } from "./date";

// 휴지통 항목(일정·업무 공통)이 자동 영구 삭제되기까지의 보관 기간(일). 완료 업무
// 자동 정리 기간(30/90일)과는 별개의 값이다 - 헷갈리지 않도록 이름을 분리했다.
export const TRASH_AUTO_PURGE_DAYS = 30;

// isoTimestamp(예: deletedAt, completedAt) 기준으로 todayStr(YYYY-MM-DD, Asia/Seoul)까지
// 며칠이 지났는지 계산한다. isoTimestamp가 없거나 유효한 날짜로 해석되지 않으면 null을
// 돌려준다 - 호출부는 null을 "판단 불가 → 대상에서 제외"로 다뤄야 한다(임의 보정 금지).
export function daysElapsedSince(isoTimestamp, todayStr) {
  if (typeof isoTimestamp !== "string" || isoTimestamp === "") return null;
  const dateStr = dateStringInSeoul(isoTimestamp);
  if (!dateStr) return null;
  return daysBetween(dateStr, todayStr);
}

// 휴지통 목록 화면에서 "N일 후 자동 삭제"를 보여줄 때 쓴다. 음수가 나오지 않도록
// 0 이상으로 고정한다(요구사항). deletedAt이 유효하지 않으면 null(표시하지 않음).
export function daysUntilAutoPurge(deletedAt, todayStr) {
  const elapsed = daysElapsedSince(deletedAt, todayStr);
  if (elapsed === null) return null;
  return Math.max(0, TRASH_AUTO_PURGE_DAYS - elapsed);
}

// 완료 업무 자동 휴지통 이동 대상 판정.
// 조건(전부 만족해야 함): completed === true, 아직 휴지통에 없음(deletedAt 없음),
// autoTrashDays(설정값, 0=사용 안 함)가 0보다 큼, completedAt이 유효한 값이며 그 기준
// 경과일이 autoTrashDays 이상.
// - completedAt이 없거나 유효하지 않은 업무는 절대 포함하지 않는다(임의 보정 금지 - 요구사항).
// - deletedAt이 있는(이미 휴지통) 업무는 방어적으로 다시 제외한다 - 호출부가 항상
//   활성 목록(listActiveDocsByOwner)만 넘기더라도, 이 함수 자체만으로도 안전하게 동작해야
//   순수 함수로서 독립적으로 테스트할 수 있다.
export function isTaskEligibleForAutoTrash(task, autoTrashDays, todayStr) {
  if (!task) return false;
  if (!(autoTrashDays > 0)) return false;
  if (task.completed !== true) return false;
  if (task.deletedAt) return false;
  const elapsed = daysElapsedSince(task.completedAt, todayStr);
  if (elapsed === null) return false;
  return elapsed >= autoTrashDays;
}

// 휴지통 30일 자동 영구 삭제 대상 판정(일정·업무 공통 - 업무에는 googleCalendarId 필드
// 자체가 없으므로 아래 제외 조건이 자연히 적용되지 않는다).
// - googleCalendarId가 존재하면 calendarSync 값과 무관하게 항상 제외한다(요구사항: 안전
//   우선 - calendarSync가 false여도 연결 정보가 남아 있으면 자동 삭제하지 않는다).
// - deletedAt이 없거나 유효하지 않으면 제외한다(휴지통 문서가 아니거나 판단 불가).
export function isDocEligibleForAutoPurge(docData, todayStr) {
  if (!docData) return false;
  if (docData.googleCalendarId) return false;
  const elapsed = daysElapsedSince(docData.deletedAt, todayStr);
  if (elapsed === null) return false;
  return elapsed >= TRASH_AUTO_PURGE_DAYS;
}

// 오늘 이미 성공적으로 자동 정리를 실행했는지 - settings.lastTrashSweepDate가 오늘과
// 다르면(한 번도 성공하지 못했으면) 다시 실행해야 한다. briefing.js의
// shouldTriggerAutoBriefing과 같은 "설정 문서의 마지막 실행일 vs 오늘" 패턴이다.
export function shouldRunTrashSweep(settings, todayStr) {
  return settings?.lastTrashSweepDate !== todayStr;
}
