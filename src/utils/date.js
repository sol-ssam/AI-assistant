const SEOUL_TZ = "Asia/Seoul";

// YYYY-MM-DD (Asia/Seoul 기준)
export function todayDateString() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function todayDisplayString() {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: SEOUL_TZ,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
}

// 임의의 시각(Date 또는 ISO 문자열)을 Asia/Seoul 기준 YYYY-MM-DD로 변환한다. todayDateString()과
// 같은 Intl 방식을 쓰되 "지금"이 아니라 주어진 시각 기준이다 - tasks.completedAt처럼 이미
// 저장된 UTC 타임스탬프(new Date().toISOString())를 서울 기준 "오늘"과 비교할 때 쓴다(예:
// "오늘 완료한 업무" 판정). 유효하지 않은 입력이면 null을 돌려준다.
export function dateStringInSeoul(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function nowHourMinuteInSeoul() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SEOUL_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour").value);
  const minute = Number(parts.find((p) => p.type === "minute").value);
  return { hour, minute };
}

// "월", "화", "수", "목", "금", "토", "일" (Asia/Seoul 기준, WEEKDAYS 상수와 동일한 표기)
export function todayWeekdayKorean() {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: SEOUL_TZ,
    weekday: "short",
  }).format(new Date());
}

// 브라우저의 로컬 타임존과 무관하게 순수 캘린더 날짜 연산만 한다.
// (new Date(dateStr).toISOString() 방식은 로컬 타임존에 따라 하루가 밀리는 문제가 있어 사용하지 않는다.)
export function addDaysToDateString(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d));
  utcDate.setUTCDate(utcDate.getUTCDate() + days);
  const yyyy = utcDate.getUTCFullYear();
  const mm = String(utcDate.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utcDate.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// todayWeekdayKorean()과 같은 표기("월"~"일")를, 오늘이 아닌 임의의 YYYY-MM-DD에 대해 계산한다.
// EventsPage.jsx가 일정 날짜별 그룹 제목("9월 9일(화)")을 만들 때처럼, 미래/과거 날짜의
// 요일이 필요한 곳에서 쓴다.
export function weekdayKoreanOf(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("ko-KR", { timeZone: SEOUL_TZ, weekday: "short" }).format(utcDate);
}

// 근무 요일(settings.workDays) 비교용 숫자 요일: 일요일 0 ~ 토요일 6. weekdayKoreanOf와
// 같은 "순수 캘린더 날짜" 방식(Date.UTC로 만든 뒤 getUTCDay)으로 계산해 브라우저 로컬
// 타임존에 흔들리지 않는다. 이 프로젝트의 기존 요일 표시(WEEKDAYS, todayWeekdayKorean 등)는
// 한글 문자열 체계를 쓰므로 그대로 두고, 숫자 체계가 필요한 새 기능(근무시간 설정)에서만
// 이 함수를 쓴다.
export function weekdayNumberOf(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// toDateStr - fromDateStr을 일(day) 단위로 계산한다(양수면 toDateStr이 더 미래). 마감일이
// 오늘보다 며칠 전/후인지 판단하는 데 쓴다 - addDaysToDateString과 같은 "순수 캘린더 날짜"
// 원칙(Date.UTC 기반)을 따른다.
export function daysBetween(fromDateStr, toDateStr) {
  const [fy, fm, fd] = fromDateStr.split("-").map(Number);
  const [ty, tm, td] = toDateStr.split("-").map(Number);
  const fromUTC = Date.UTC(fy, fm - 1, fd);
  const toUTC = Date.UTC(ty, tm - 1, td);
  return Math.round((toUTC - fromUTC) / 86400000);
}

// dateStr이 from~to(둘 다 포함) 범위에 있는지, 문자열 비교로 안전하게 확인한다.
export function isDateInRange(dateStr, from, to) {
  return dateStr >= from && dateStr <= to;
}

// 주어진 YYYY-MM-DD 날짜를 사람이 읽기 쉬운 "9월 9일" 형태로 표시한다. 올해가 아닌
// 날짜는 "2025년 9월 9일"처럼 연도를 함께 표시한다. 최근 기록처럼 여러 날짜가 섞여
// 나열되는 화면에서 쓴다.
export function formatDateDisplay(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const currentYear = Number(todayDateString().slice(0, 4));
  return y === currentYear ? `${m}월 ${d}일` : `${y}년 ${m}월 ${d}일`;
}

// from~to(둘 다 포함) 사이의 모든 날짜를 YYYY-MM-DD 배열로 나열한다.
export function enumerateDateRange(from, to) {
  const dates = [];
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard < 400) {
    dates.push(cursor);
    cursor = addDaysToDateString(cursor, 1);
    guard += 1;
  }
  return dates;
}

