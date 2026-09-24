// 회의/협업·협의는 "참석 확정"(attending === true)인 경우에만 Calendar 동기화 대상이 된다.
// attending이 false거나 아직 정해지지 않은(null/undefined) 경우는 대상이 아니다.
// 그 외 유형(업무 일정/교육·연수/출장·외근/개인 일정/기타 - 사용자가 직접 등록한 자신의
// 일정)은 항상 대상이 될 수 있다 - 일반 직장인용 신규 유형은 원칙적으로 모두 본인
// 일정이므로 단건 Calendar 동기화에서 불필요하게 제외되지 않는다.
import { ATTENDANCE_BASED_EVENT_TYPES } from "./constants";

export function isCalendarEligible(event) {
  if (!event) return false;
  if (ATTENDANCE_BASED_EVENT_TYPES.includes(event.type)) return event.attending === true;
  return true;
}

export const ATTENDING_OPTIONS = [
  { value: "true", label: "참석" },
  { value: "false", label: "불참" },
  { value: "unknown", label: "아직 모름" },
];

// select/radio 등 문자열 입력값을 실제 attending 값(true/false/null)으로 변환한다.
export function parseAttendingValue(raw) {
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}

export function attendingToSelectValue(attending) {
  if (attending === true) return "true";
  if (attending === false) return "false";
  return "unknown";
}
