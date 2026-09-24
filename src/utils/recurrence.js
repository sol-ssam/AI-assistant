// 매주/매월 반복 일정·업무의 각 회차 날짜를 결정론적으로 계산하는 순수 함수 모음이다.
// AI를 호출하지 않는다. EventsPage.jsx/TasksPage.jsx(직접 UI)와 toolExecutors.js
// (AI 비서)가 이 파일 하나를 그대로 공유한다 - 같은 반복 계산을 두 곳에 따로
// 구현하지 않는다.
import { addDaysToDateString } from "./date";

export const MAX_RECURRENCE_OCCURRENCES = 50;
// "최대 1년" - 윤년을 넉넉히 포함해 366일로 잡는다(딱 1년짜리 반복이 하루 차이로
// 잘못 거부되지 않게 하기 위함이다).
export const MAX_RECURRENCE_SPAN_DAYS = 366;

// startDate(=YYYY-MM-DD)와 같은 일자를 monthsToAdd개월 뒤에서 찾는다. 그 달에 같은
// 일자가 없으면(예: 1월 31일 -> 2월) 그 달의 마지막 날을 쓴다. 다음 달 계산은 항상
// "원래 일자"를 기준으로 다시 계산한다(직전 회차의 결과가 아니라) - 그래서 1월 31일
// 반복은 2월에는 말일(28/29일)로 밀리더라도, 31일이 있는 3월에는 다시 31일로
// 돌아온다(요구사항 예시와 동일).
function addMonthsClamped(year, month, day, monthsToAdd) {
  const total = month - 1 + monthsToAdd;
  const targetYear = year + Math.floor(total / 12);
  const targetMonth = (((total % 12) + 12) % 12) + 1; // 1~12
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const targetDay = Math.min(day, daysInTargetMonth);
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

// 앱이 생성하는, 사용자나 AI가 임의로 만들지 않는 반복 그룹 식별자. crypto.randomUUID가
// 있는 모든 최신 브라우저에서는 충돌 가능성이 사실상 없는 UUID를 쓰고, 없는 환경만
// timestamp+난수로 대체한다. 새 컬렉션은 만들지 않는다 - events/tasks 문서의 필드일 뿐이다.
export function generateSeriesId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `series-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// startDate부터 repeatEndDate(포함)까지, repeatType에 따라 실제 발생 날짜 배열을 만든다.
// - weekly: 7일씩 증가
// - monthly: addMonthsClamped로 "가능하면 같은 일자, 없으면 그 달의 말일"
// 실패하면 { ok:false, reason }을 돌려주고 dates는 만들지 않는다 - 호출부(UI 폼 검증,
// AI 실행기)가 이 reason을 그대로 사용자에게 보여줄 수 있을 만큼 구체적으로 쓴다.
export function generateRecurrenceDates({ startDate, repeatType, repeatEndDate }) {
  if (repeatType !== "weekly" && repeatType !== "monthly") {
    return { ok: false, reason: "반복 유형이 올바르지 않습니다." };
  }
  if (!startDate) {
    return { ok: false, reason: "시작일(또는 마감일)이 필요합니다." };
  }
  if (!repeatEndDate) {
    return { ok: false, reason: "반복 종료일을 입력해 주세요." };
  }
  if (repeatEndDate < startDate) {
    return { ok: false, reason: "반복 종료일은 시작일(또는 마감일)보다 빠를 수 없습니다." };
  }

  const maxEndByDuration = addDaysToDateString(startDate, MAX_RECURRENCE_SPAN_DAYS);
  if (repeatEndDate > maxEndByDuration) {
    return { ok: false, reason: "반복 기간은 최대 1년까지 설정할 수 있습니다." };
  }

  const [y, m, d] = startDate.split("-").map(Number);
  const dates = [];

  for (let i = 0; ; i++) {
    const date = repeatType === "weekly" ? addDaysToDateString(startDate, i * 7) : addMonthsClamped(y, m, d, i);
    if (date > repeatEndDate) break;
    dates.push(date);
    if (dates.length > MAX_RECURRENCE_OCCURRENCES) {
      return {
        ok: false,
        reason: `반복 횟수가 최대 ${MAX_RECURRENCE_OCCURRENCES}회를 초과합니다. 종료일을 줄여 주세요.`,
      };
    }
  }

  if (dates.length === 0) {
    return { ok: false, reason: "생성할 반복 일정이 없습니다." };
  }

  return { ok: true, dates };
}
