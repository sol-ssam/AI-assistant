// 일반 직장인용 일정 구분(6단계 최종 정리) - 사용자에게 노출되는 값/라벨은 이 배열
//하나에서만 정의한다. 등록·수정 폼, 필터 select, 배지, 휴지통, 홈 브리핑, AI 도구
// 설명·지침이 전부 이 배열과 EVENT_TYPE_LABEL을 그대로 재사용해야 한다 - 같은 라벨
// 맵을 다른 파일에 다시 만들지 않는다.
export const EVENT_TYPES = [
  { value: "work", label: "업무 일정" },
  { value: "meeting", label: "회의" },
  { value: "collaboration", label: "협업·협의" },
  { value: "training", label: "교육·연수" },
  { value: "business_trip", label: "출장·외근" },
  { value: "personal", label: "개인 일정" },
  { value: "other", label: "기타" },
];

// 참석 여부가 의미 있는 일정 구분(참석이 확정된 경우에만 Google Calendar 추가 가능) -
// 회의와 협업·협의 둘 다 여기 속한다(이전 값 "council"이 "collaboration"으로 이름만
// 바뀌었을 뿐 자리는 그대로다). 새 구분을 추가할 때 이 배열에도 추가하면 된다.
export const ATTENDANCE_BASED_EVENT_TYPES = ["meeting", "collaboration"];

export const EVENT_TYPE_LABEL = Object.fromEntries(
  EVENT_TYPES.map((t) => [t.value, t.label])
);

// 과거(교사용) 일정 유형 값 → 새 유형 값 호환 매핑. 기존 Firestore 문서는 마이그레이션
// 하지 않으므로, 이 값들이 그대로 남아 있는 문서가 있을 수 있다 - normalizeEventType()이
// 화면에 표시하거나 수정 폼에 채우기 직전에 항상 이 매핑을 거치게 한다.
// - academic(학사일정)/school(학교 행사) → work(업무 일정)
// - council(협의회, 직전까지 실제로 쓰이던 값) → collaboration(협업·협의)
// - committee(더 이전 버전에 존재했을 수 있는 값 - 현재 코드에는 없다) → collaboration
const LEGACY_EVENT_TYPE_MAP = {
  academic: "work",
  school: "work",
  council: "collaboration",
  committee: "collaboration",
};

const NEW_EVENT_TYPE_VALUES = new Set(EVENT_TYPES.map((t) => t.value));

// 어떤 값이 와도 항상 EVENT_TYPES에 실제로 존재하는 7개 값 중 하나를 돌려준다.
// - 이미 새 값이면 그대로 돌려준다.
// - 알려진 과거 값이면 매핑된 새 값을 돌려준다.
// - 그 외 알 수 없는 값(빈 문자열, null/undefined, 처음 보는 문자열 포함)은 안전하게
//   "other"로 취급한다(요구사항: 알 수 없는 유형은 기타로 표시).
// Firestore 문서 자체는 이 함수가 절대 바꾸지 않는다 - 표시/수정 폼 채우기/필터·Calendar
// 자격 판정처럼 "읽을 때"만 거치고, 실제로 그 일정을 저장(수정)할 때만 그 결과가 반영된다.
export function normalizeEventType(type) {
  if (NEW_EVENT_TYPE_VALUES.has(type)) return type;
  return LEGACY_EVENT_TYPE_MAP[type] ?? "other";
}

// 목록/브리핑에 실제로 표시할 구분명. type이 "기타"이고 사용자가 customType을
// 입력했으면 "기타" 대신 그 값을 그대로 보여준다. type이 과거 값(academic/school/
// council/committee)이거나 알 수 없는 값이어도 normalizeEventType()을 거치므로 빈
// 라벨이나 원시 내부 값이 그대로 노출되지 않는다.
export function eventTypeDisplayLabel(event) {
  const normalizedType = normalizeEventType(event?.type);
  if (normalizedType === "other" && event?.customType) return event.customType;
  return EVENT_TYPE_LABEL[normalizedType];
}

export const TASK_PRIORITIES = [
  { value: "high", label: "높음" },
  { value: "medium", label: "보통" },
  { value: "low", label: "낮음" },
];

export const TASK_PRIORITY_LABEL = Object.fromEntries(
  TASK_PRIORITIES.map((p) => [p.value, p.label])
);
