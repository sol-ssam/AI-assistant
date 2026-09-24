// "기존 데이터와 동일/유사한 일정인지 확인하는 중복 탐지"(conflictDetection.js)와는
// 완전히 다른 기능이다. 이 파일은 "서로 다른 일정이지만 시간이 겹치는지"만 판단한다.
// AI를 사용하지 않고 date/startTime/endTime/status 필드만으로 순수 계산한다.
// 시간 충돌은 저장을 막는 조건이 아니라 경고일 뿐이다 - 호출부(UI)에서 저장 여부는
// 사용자가 결정한다. Home.jsx의 "오늘의 주요 확인"과 EventsPage.jsx의 등록/수정 폼이
// 이 파일의 함수를 그대로 공유한다 - 같은 계산을 두 번 구현하지 않는다.

export function toMinutes(hhmm) {
  if (!hhmm) return null;
  const parts = String(hhmm).split(":");
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

// toMinutes의 역변환 - 분(자정 기준) -> "HH:MM". 집중 가능 시간 구간이나 충돌 구간을
// 사용자에게 보여줄 때 쓴다.
export function minutesToHHMM(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// candidate: { date, startTime, endTime, status } - 새로 승인하려는 일정
// existingEvents: events 컬렉션 전체 배열
// options.excludeId: 수정 중인 일정 자신의 id (자기 자신과는 비교하지 않기 위해 제외한다)
export function findTimeConflicts(candidate, existingEvents, options = {}) {
  const { excludeId } = options;

  // 취소된 일정끼리는(또는 취소된 후보는) 시간을 점유하지 않으므로 충돌 대상이 아니다.
  if (candidate.status === "취소") return [];

  const candStart = toMinutes(candidate.startTime);
  // 새 일정에 시작시간 자체가 없으면(날짜만 있는 경우) 시간 충돌 검사를 하지 않는다.
  if (candStart == null) return [];

  const candEnd = toMinutes(candidate.endTime);

  return existingEvents.filter((ev) => {
    if (excludeId && ev.id === excludeId) return false;
    if (ev.date !== candidate.date) return false;
    if (ev.status === "취소") return false;

    const evStart = toMinutes(ev.startTime);
    // 기존 일정에 시간 정보가 전혀 없으면 시간으로 비교할 수 없으므로 제외한다.
    if (evStart == null) return false;

    const evEnd = toMinutes(ev.endTime);

    if (evEnd != null && candEnd != null) {
      // 둘 다 시작/종료가 있는 일반적인 경우: 범위가 실제로 겹치는지.
      // 끝나는 시간과 다음 일정의 시작 시간이 정확히 같은 경우는 충돌이 아니다.
      return candStart < evEnd && candEnd > evStart;
    }
    if (evEnd != null && candEnd == null) {
      // 기존 일정은 범위가 있고, 새 일정은 시작시간만 있는 경우:
      // 새 일정의 시작 시각이 기존 범위 [evStart, evEnd) 안에 들어가는지.
      return candStart >= evStart && candStart < evEnd;
    }
    if (evEnd == null && candEnd != null) {
      // 기존 일정은 시작시간만 있고, 새 일정은 범위가 있는 경우:
      // 기존 일정의 시작 시각이 새 일정 범위 [candStart, candEnd) 안에 들어가는지.
      return evStart >= candStart && evStart < candEnd;
    }
    // 둘 다 시작시간만 있는 경우: 정확히 같은 시각일 때만 충돌 가능성으로 본다.
    // (15:00과 15:30처럼 다르면, 임의로 길이를 추측해 충돌로 보지 않는다.)
    return evStart === candStart;
  });
}

// events 배열(보통 "오늘 일정"처럼 이미 한 날짜로 좁혀진 목록) 안에서 서로 겹치는 모든
// 쌍을 찾는다. findTimeConflicts가 "후보 하나 vs 기존 여러 개"라면, 이 함수는 "이미 저장된
// 여러 일정끼리" 서로 겹치는지 찾을 때 쓴다(Home.jsx의 브리핑 충돌 표시). 시작/종료 시간이
// 모두 있고 취소되지 않은 일정만 대상으로 하며, 같은 쌍은 한 번만 반환한다.
export function findAllConflicts(events) {
  const usable = events.filter((e) => {
    if (e.status === "취소") return false;
    const s = toMinutes(e.startTime);
    const en = toMinutes(e.endTime);
    return s != null && en != null && en > s;
  });

  const pairs = [];
  for (let i = 0; i < usable.length; i++) {
    for (let j = i + 1; j < usable.length; j++) {
      const a = usable[i];
      const b = usable[j];
      if (a.date !== b.date) continue;
      const aStart = toMinutes(a.startTime);
      const aEnd = toMinutes(a.endTime);
      const bStart = toMinutes(b.startTime);
      const bEnd = toMinutes(b.endTime);
      if (aStart < bEnd && bStart < aEnd) {
        pairs.push({ a, b });
      }
    }
  }
  return pairs;
}

// 두 일정이 실제로 겹치는 구간("10:30~11:00")만 사람이 읽을 수 있는 문자열로 만든다.
// findAllConflicts로 찾은 쌍에만 쓴다(둘 다 시작/종료 시간이 있다고 이미 보장된 상태).
export function formatOverlapRange(a, b) {
  const start = Math.max(toMinutes(a.startTime), toMinutes(b.startTime));
  const end = Math.min(toMinutes(a.endTime), toMinutes(b.endTime));
  return `${minutesToHHMM(start)}~${minutesToHHMM(end)}`;
}
