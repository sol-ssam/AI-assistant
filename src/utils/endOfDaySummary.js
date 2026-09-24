// 퇴근 전 정리 - 오늘 기준으로 "오늘 완료한 업무", "아직 완료하지 않은 기한 초과 업무",
// "아직 완료하지 않은 오늘 마감 업무", "내일 일정", "내일 마감 업무"를 순수하게 계산한다.
// AI를 호출하지 않고, 이미 불러온 events/tasks 배열을 그대로 읽어 파생시킬 뿐이다 -
// 데이터를 자동으로 고치거나 내일로 이월하지 않는다. Home.jsx와 localQueries.js가 이
// 함수 하나를 공유한다.
import { addDaysToDateString, dateStringInSeoul } from "./date";

function sortByDueDate(tasks) {
  return [...tasks].sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
}

export function computeEndOfDaySummary({ events, tasks, today }) {
  const tomorrow = addDaysToDateString(today, 1);

  // completedAt은 new Date().toISOString()(UTC) 형식으로 저장된다 - 문자열 앞부분만
  // 잘라 비교하면 자정 전후 서울 기준 날짜와 어긋날 수 있어, dateStringInSeoul로 정확히
  // 서울 기준 날짜로 변환한 뒤 비교한다. completedAt이 없는 과거 완료 업무는 조용히
  // 제외될 뿐 오류를 내지 않는다.
  const completedToday = (tasks || []).filter(
    (t) => t.completed && t.completedAt && dateStringInSeoul(t.completedAt) === today
  );

  const remainingTasks = sortByDueDate((tasks || []).filter((t) => !t.completed && t.dueDate <= today));

  const tomorrowEvents = (events || [])
    .filter((e) => e.date === tomorrow && e.status !== "취소")
    .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));

  const tomorrowDueTasks = sortByDueDate((tasks || []).filter((t) => !t.completed && t.dueDate === tomorrow));

  // 완료한 업무는 마감일이 아니라 "언제 끝냈는지"가 더 자연스러운 순서다 - 가장 최근에
  // 완료한 것부터 보여준다.
  const completedTodaySorted = [...completedToday].sort((a, b) =>
    (b.completedAt ?? "").localeCompare(a.completedAt ?? "")
  );

  return {
    completedToday: completedTodaySorted,
    remainingTasks,
    tomorrowEvents,
    tomorrowDueTasks,
  };
}
