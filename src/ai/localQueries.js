import { getTodayEvents, getTodayDueTasks } from "../firebase/collections";
import { listActiveDocsByOwner } from "../firebase/crud";
import { getSettings } from "../firebase/settingsService";
import { todayDisplayString, todayDateString } from "../utils/date";
import { computeFocusSlots, formatFocusDuration } from "../utils/focusTime";
import { rankTasksByPriority, taskPriorityReasonLabel } from "../utils/taskUrgency";
import { findAllConflicts, formatOverlapRange } from "../utils/timeConflictDetection";
import { computeEndOfDaySummary } from "../utils/endOfDaySummary";
import { derivePreparationReminders } from "../utils/briefingDerive";

// 아주 흔한 정형 질문은 자연어 이해가 사실상 필요 없으므로, Gemini를 호출하지 않고
// 기존 브리핑용 조회 함수와 Home.jsx가 쓰는 것과 똑같은 계산 유틸리티(focusTime.js,
// taskUrgency.js, timeConflictDetection.js)만으로 바로 답을 만든다. 여기 없는 표현은
// 전부 Gemini로 넘어간다. 어떤 경우에도 계산 로직을 이 파일에서 다시 구현하지 않는다 -
// Home의 "집중 가능 시간"/"오늘의 업무 우선순위"/일정 충돌 표시와 항상 같은 결과를 준다.

const TODAY_SUMMARY_PHRASES = new Set([
  "오늘 뭐 있어",
  "오늘 뭐있어",
  "오늘 뭐야",
  "오늘 일정 뭐있어",
  "오늘 일정 알려줘",
  "오늘 일정이 뭐야",
  "오늘 뭐 해야 해",
  "오늘 뭐해야해",
  "오늘 할 일",
  "오늘 할일",
  "오늘 할일 알려줘",
]);

const FOCUS_TIME_PHRASES = new Set([
  "오늘 빈 시간 알려줘",
  "오늘 집중할 시간 있어",
  "오늘 집중 가능 시간 알려줘",
]);

const TASK_PRIORITY_PHRASES = new Set([
  "오늘 뭐부터 해야 해",
  "업무 우선순위 알려줘",
  "할 일 우선순위 정리해줘",
]);

const CONFLICT_PHRASES = new Set(["오늘 일정 겹쳐", "오늘 일정 충돌 확인해줘"]);

const END_OF_DAY_PHRASES = new Set(["오늘 업무 정리해줘", "퇴근 전에 정리해줘", "내일 준비할 것 알려줘"]);

const PREPARATION_PHRASES = new Set(["오늘 준비할 일정 알려줘", "내일 회의 준비할 것 있어"]);

function normalize(text) {
  return text.trim().replace(/[?!.]+$/g, "").replace(/\s+/g, " ");
}

async function answerTodaySummary(uid) {
  const [events, dueTasks] = await Promise.all([getTodayEvents(uid), getTodayDueTasks(uid)]);

  const lines = [`${todayDisplayString()} 기준으로 알려드릴게요.`];

  lines.push(
    events.length > 0
      ? `일정: ${events.map((e) => `${e.startTime ?? ""} ${e.title}`.trim()).join(", ")}`
      : "일정: 등록된 일정이 없습니다."
  );

  lines.push(
    dueTasks.length > 0
      ? `오늘 마감 업무: ${dueTasks.map((t) => t.title).join(", ")}`
      : "오늘 마감인 업무는 없습니다."
  );

  return lines.join("\n");
}

// Home.jsx의 "집중 가능 시간" 카드와 완전히 같은 입력(오늘 일정 + settings의 근무시간
// 필드)과 같은 함수(computeFocusSlots)를 써서 같은 결과를 만든다.
async function answerFocusTime(uid) {
  const [events, settings] = await Promise.all([getTodayEvents(uid), getSettings(uid)]);
  const today = todayDateString();

  const focus = computeFocusSlots({
    events,
    today,
    workDays: settings.workDays,
    workStartTime: settings.workStartTime,
    workEndTime: settings.workEndTime,
    focusMinMinutes: settings.focusMinMinutes,
  });

  if (!focus.ok) return "근무시간 설정을 확인해 주세요.";
  if (!focus.isWorkDay) return "오늘은 설정된 근무일이 아닙니다.";
  if (focus.slots.length === 0) return "설정한 기준 이상의 집중 가능 시간이 없습니다.";

  const lines = [`${todayDisplayString()} 기준 집중 가능 시간이에요.`];
  lines.push(
    focus.slots.map((s) => `${s.startTime}~${s.endTime}(${formatFocusDuration(s.minutes)})`).join(", ")
  );
  return lines.join("\n");
}

// Home.jsx의 "오늘의 업무 우선순위" 카드와 같은 함수(rankTasksByPriority)로 상위 5개를
// 뽑고, 같은 근거 문구(taskPriorityReasonLabel)로 왜 그 순서인지 함께 알려준다.
async function answerTaskPriority(uid) {
  const allTasks = await listActiveDocsByOwner("tasks", uid);
  const today = todayDateString();
  const ranked = rankTasksByPriority(allTasks, today).slice(0, 5);

  if (ranked.length === 0) return "우선 처리할 미완료 업무가 없습니다.";

  const lines = [`${todayDisplayString()} 기준 업무 우선순위예요.`];
  lines.push(ranked.map((t) => `${t.title}(${taskPriorityReasonLabel(t, today)})`).join(", "));
  return lines.join("\n");
}

// Home.jsx의 "오늘의 주요 확인"에 뜨는 일정 충돌과 같은 함수(findAllConflicts)로 계산한다.
async function answerConflicts(uid) {
  const events = await getTodayEvents(uid);
  const pairs = findAllConflicts(events);

  if (pairs.length === 0) return "오늘 일정에 겹치는 시간이 없습니다.";

  const lines = [`${todayDisplayString()} 겹치는 일정이 있어요.`];
  lines.push(
    pairs.map((p) => `${p.a.title}와 ${p.b.title}이(가) ${formatOverlapRange(p.a, p.b)}에 겹칩니다.`).join(" ")
  );
  return lines.join("\n");
}

// Home.jsx의 "퇴근 전 정리" 카드와 같은 함수(computeEndOfDaySummary)를 써서 같은 결과를
// 돌려준다. 오늘 완료 업무/남은 업무(기한 지남+오늘 마감)/내일 일정/내일 마감을 그대로
// 안내한다 - 데이터를 고치거나 다음 날로 이월하지 않는다(순수 조회·계산).
async function answerEndOfDaySummary(uid) {
  const [allEvents, allTasks] = await Promise.all([
    listActiveDocsByOwner("events", uid),
    listActiveDocsByOwner("tasks", uid),
  ]);
  const today = todayDateString();
  const summary = computeEndOfDaySummary({ events: allEvents, tasks: allTasks, today });

  const lines = [`${todayDisplayString()} 기준 퇴근 전 정리예요.`];
  lines.push(
    summary.completedToday.length > 0
      ? `오늘 완료: ${summary.completedToday.map((t) => t.title).join(", ")}`
      : "오늘 완료한 업무 기록이 없습니다."
  );
  lines.push(
    summary.remainingTasks.length > 0
      ? `아직 남은 업무: ${summary.remainingTasks.map((t) => t.title).join(", ")}`
      : "남은 업무가 없습니다."
  );
  lines.push(
    summary.tomorrowEvents.length > 0
      ? `내일 일정: ${summary.tomorrowEvents.map((e) => `${e.startTime ?? ""} ${e.title}`.trim()).join(", ")}`
      : "내일 일정이 없습니다."
  );
  lines.push(
    summary.tomorrowDueTasks.length > 0
      ? `내일 마감: ${summary.tomorrowDueTasks.map((t) => t.title).join(", ")}`
      : "내일 마감인 업무가 없습니다."
  );

  return lines.join("\n");
}

// Home.jsx의 "오늘의 주요 확인"에 함께 뜨는 준비사항 알림과 같은 함수
// (derivePreparationReminders)를 쓴다. 실제로 준비사항이 있는(그리고 아직 완료로 체크하지
// 않은, 취소되지 않은) 일정만 안내한다 - 없는데 있다고 지어내지 않는다.
async function answerPreparationReminders(uid) {
  const allEvents = await listActiveDocsByOwner("events", uid);
  const today = todayDateString();
  const reminders = derivePreparationReminders(allEvents, today);

  if (reminders.length === 0) return "오늘·내일 준비할 일정이 없습니다.";

  const lines = [`${todayDisplayString()} 기준 준비할 일정이에요.`];
  lines.push(
    reminders.map((e) => `${e.date === today ? "오늘" : "내일"} ${e.title}: ${e.preparationNote}`).join(" / ")
  );
  return lines.join("\n");
}

// 사용자 데이터를 못 읽으면(각 함수 내부의 Firestore 호출이 실패하면) 여기서 조용히
// 성공한 것처럼 꾸미지 않는다 - try/catch로 감싸지 않고 그대로 던져서, 호출부
// (AssistantPage.jsx/HomeQuickAssistant.jsx)의 기존 오류 처리가 "AI 비서 기능을 사용할
// 수 없습니다" 안내를 보여주게 한다.
export async function tryLocalQuery(rawText, uid) {
  const text = normalize(rawText);

  if (TODAY_SUMMARY_PHRASES.has(text)) return answerTodaySummary(uid);
  if (FOCUS_TIME_PHRASES.has(text)) return answerFocusTime(uid);
  if (TASK_PRIORITY_PHRASES.has(text)) return answerTaskPriority(uid);
  if (CONFLICT_PHRASES.has(text)) return answerConflicts(uid);
  if (END_OF_DAY_PHRASES.has(text)) return answerEndOfDaySummary(uid);
  if (PREPARATION_PHRASES.has(text)) return answerPreparationReminders(uid);

  return null;
}
