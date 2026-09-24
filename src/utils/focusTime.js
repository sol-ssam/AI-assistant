// 근무 요일·근무시간 설정과 오늘 일정을 바탕으로, 오늘 남은(또는 하루 전체) 집중 가능
// 시간 구간을 결정론적으로 계산한다. AI를 호출하지 않는다 - 순수 시간 계산이다.
// 시간 파싱/포맷은 timeConflictDetection.js의 toMinutes/minutesToHHMM을 그대로
// 재사용한다(같은 "HH:MM <-> 분" 변환을 두 파일에서 따로 구현하지 않는다).
import { toMinutes, minutesToHHMM } from "./timeConflictDetection";
import { weekdayNumberOf } from "./date";

// ok: false면 근무시간 설정 자체가 유효하지 않다는 뜻(예: 종료가 시작보다 빠름, 잘못된
//   시간 형식, 최소 집중 시간이 양수가 아님) - 이때는 슬롯을 계산하지 않는다.
// isWorkDay: ok가 true일 때만 의미 있음. 오늘이 근무 요일이 아니면 false, slots는 항상 [].
// slots: { startTime, endTime, minutes }[] - 시작 시각 오름차순.
export function computeFocusSlots({ events, today, workDays, workStartTime, workEndTime, focusMinMinutes }) {
  const start = toMinutes(workStartTime);
  const end = toMinutes(workEndTime);
  const minFocus = Number(focusMinMinutes);

  if (start == null || end == null || end <= start || !Number.isFinite(minFocus) || minFocus <= 0) {
    return { ok: false, isWorkDay: false, slots: [] };
  }

  const weekday = weekdayNumberOf(today);
  const workDaySet = new Set(Array.isArray(workDays) ? workDays : []);
  if (!workDaySet.has(weekday)) {
    return { ok: true, isWorkDay: false, slots: [] };
  }

  // 오늘의 유효한(취소 아님, 시작·종료 둘 다 있음, 종료가 시작보다 늦음) 일정만 쓰고,
  // 근무시간 범위 밖으로 벗어난 부분은 잘라낸다(근무시간 밖 일정은 여기서 자연히 제외되거나
  // 걸치는 부분만 반영된다).
  const busy = [];
  for (const e of events || []) {
    if (e.status === "취소") continue;
    const s = toMinutes(e.startTime);
    const en = toMinutes(e.endTime);
    if (s == null || en == null || en <= s) continue;
    const clippedStart = Math.max(s, start);
    const clippedEnd = Math.min(en, end);
    if (clippedEnd > clippedStart) busy.push([clippedStart, clippedEnd]);
  }

  // 서로 겹치거나 맞닿은 구간을 하나로 병합한다.
  busy.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [s, en] of busy) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) {
      last[1] = Math.max(last[1], en);
    } else {
      merged.push([s, en]);
    }
  }

  // 근무시간 범위에서 병합된 일정 구간을 빼면 빈 구간(=집중 가능 후보)이 남는다.
  const gaps = [];
  let cursor = start;
  for (const [s, en] of merged) {
    if (s > cursor) gaps.push([cursor, s]);
    cursor = Math.max(cursor, en);
  }
  if (cursor < end) gaps.push([cursor, end]);

  const slots = gaps
    .filter(([s, en]) => en - s >= minFocus)
    .map(([s, en]) => ({ startTime: minutesToHHMM(s), endTime: minutesToHHMM(en), minutes: en - s }));

  return { ok: true, isWorkDay: true, slots };
}

// "3시간", "2시간 30분", "45분"처럼 분 단위 길이를 한국어로 표시한다. 홈 브리핑과
// localQueries.js의 로컬 응답이 이 형식을 함께 쓴다.
export function formatFocusDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}
