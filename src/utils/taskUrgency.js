import { daysBetween } from "./date";
import { TASK_PRIORITY_LABEL } from "./constants";

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

// 마감일 지남/오늘 마감/다가오는 마감 순서 다음, 같은 그룹 안에서는 priority(높음 우선) → 마감일 순으로 정렬한다.
export function sortByPriorityThenDate(tasks) {
  return [...tasks].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 1;
    const pb = PRIORITY_ORDER[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    return (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
  });
}

// ---- 오늘의 업무 우선순위(홈 브리핑) ----
// sortByPriorityThenDate와는 목적이 다르다 - 저 함수는 이미 같은 마감 구간으로 좁혀진
// 목록(오늘 마감만, 기한 지남만 등) 하나를 priority→날짜로 정렬할 때 쓰고, 아래 함수들은
// "미완료 업무 전체"를 마감 구간(기한 지남/오늘/1~2일/3~7일/그 이후) 단위로 먼저 묶은
// 뒤에만 그 정렬 기준을 적용한다. 같은 계산을 중복 구현하지 않도록 여기서도
// PRIORITY_ORDER를 그대로 재사용한다.

// 0=기한 지남, 1=오늘 마감, 2=1~2일 안, 3=3~7일 안, 4=그 이후(또는 마감일 없음).
function dueBucket(dueDate, today) {
  if (!dueDate) return 4;
  if (dueDate < today) return 0;
  if (dueDate === today) return 1;
  const diff = daysBetween(today, dueDate);
  if (diff <= 2) return 2;
  if (diff <= 7) return 3;
  return 4;
}

// "기한 2일 지남" / "오늘 마감" / "내일 마감" / "5일 뒤 마감" / "마감일 없음".
export function dueStatusLabel(dueDate, today) {
  if (!dueDate) return "마감일 없음";
  if (dueDate < today) return `기한 ${daysBetween(dueDate, today)}일 지남`;
  if (dueDate === today) return "오늘 마감";
  const diff = daysBetween(today, dueDate);
  return diff === 1 ? "내일 마감" : `${diff}일 뒤 마감`;
}

// "기한 2일 지남 · 중요도 높음"처럼 정렬 근거를 그대로 사람이 읽을 수 있는 한 줄로
// 보여준다 - 불투명한 점수 대신 실제 기준(마감 상태 + 중요도)을 그대로 노출한다.
export function taskPriorityReasonLabel(task, today) {
  const dueLabel = dueStatusLabel(task.dueDate, today);
  const priorityLabel = TASK_PRIORITY_LABEL[task.priority];
  return priorityLabel ? `${dueLabel} · 중요도 ${priorityLabel}` : dueLabel;
}

// 완료되지 않은 업무를 "1.기한 지남 2.오늘 마감 3.1~2일 안 4.3~7일 안 5.그 이후" 구간으로
// 먼저 묶고, 그 안에서는 중요도(high→medium→low) → 마감일이 빠른 순 → 제목 가나다순으로
// 정렬한다. 다만 기한이 지난 업무(구간 0)끼리는 예외적으로 "오래 지난 업무가 먼저" 오도록
// 마감일(오름차순 = 가장 오래된 것부터)을 중요도보다 먼저 비교한다 - 사용자가 이미 놓친
// 일일수록 중요도와 무관하게 먼저 보여야 한다는 요구사항을 반영한 것이다.
// AI를 호출하지 않는, 완전히 결정론적인 정렬이다.
export function rankTasksByPriority(tasks, today) {
  const incomplete = tasks.filter((t) => !t.completed);
  return incomplete.sort((a, b) => {
    const ba = dueBucket(a.dueDate, today);
    const bb = dueBucket(b.dueDate, today);
    if (ba !== bb) return ba - bb;

    if (ba === 0) {
      const byOverdue = (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
      if (byOverdue !== 0) return byOverdue;
    }

    const pa = PRIORITY_ORDER[a.priority] ?? 1;
    const pb = PRIORITY_ORDER[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;

    const byDate = (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
    if (byDate !== 0) return byDate;

    return (a.title ?? "").localeCompare(b.title ?? "", "ko");
  });
}
