import { addDaysToDateString } from "./date";

// events/tasks 컬렉션을 각각 한 번만 읽은 뒤, 브리핑에 필요한 여러 조각(오늘/기한초과/
// 다가오는 항목 등)을 전부 클라이언트에서 걸러낸다. Firestore 쪽에서는 ownerId 하나로만
// 조회하고, 날짜 비교나 정렬 같은 부가 조건은 여기서 처리해 불필요한 복합 색인을 만들지 않는다.

export function deriveTodayEvents(allEvents, today) {
  return allEvents
    .filter((e) => e.date === today)
    .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
}

export function deriveUpcomingEvents(allEvents, today, withinDays = 7) {
  const limit = addDaysToDateString(today, withinDays);
  return allEvents.filter((e) => e.date > today && e.date <= limit);
}

export function deriveOverdueTasks(allTasks, today) {
  return allTasks.filter((t) => !t.completed && t.dueDate < today);
}

export function deriveTodayDueTasks(allTasks, today) {
  return allTasks.filter((t) => !t.completed && t.dueDate === today);
}

export function deriveUpcomingTasks(allTasks, today, withinDays = 7) {
  const limit = addDaysToDateString(today, withinDays);
  return allTasks.filter((t) => !t.completed && t.dueDate > today && t.dueDate <= limit);
}

// 오늘·내일 일정 중 "아직 준비가 끝나지 않은" 것만 골라 브리핑에 알려준다. 취소된 일정과
// 준비 완료로 체크된 일정은 제외한다. Home.jsx와 localQueries.js가 이 함수를 공유한다.
export function derivePreparationReminders(allEvents, today) {
  const tomorrow = addDaysToDateString(today, 1);
  return allEvents
    .filter(
      (e) =>
        !!e.preparationNote &&
        e.preparationCompleted !== true &&
        e.status !== "취소" &&
        (e.date === today || e.date === tomorrow)
    )
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.startTime ?? "").localeCompare(b.startTime ?? "");
    });
}
