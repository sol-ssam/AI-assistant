import { createDoc, createDocsBatch, updateDocById, listDocsByOwner, listActiveDocsByOwner, softDeleteDocById } from "../firebase/crud";
import { todayDateString } from "../utils/date";
import { createCalendarEvent, listCalendarEvents, MissingEndTimeError } from "../calendar/calendarApi";
import { isCalendarEligible } from "../utils/calendarEligibility";
import { ATTENDANCE_BASED_EVENT_TYPES, normalizeEventType } from "../utils/constants";
import { generateRecurrenceDates, generateSeriesId } from "../utils/recurrence";

const MAX_RESULTS = 15;

// execUpdateEvent/execDeleteEvent/execSyncEventToCalendar/execSearchEvents 네 곳 모두
// "활성 일정을 가져온 뒤 .type으로 무언가를 판단"하는 같은 모양이라 하나로 합쳤다.
// 과거(교사용) 유형 값(academic/school/council/committee)이 남아 있는 문서도 여기서
// 정규화해 두면, 그 뒤의 참석 대상 판정(ATTENDANCE_BASED_EVENT_TYPES.includes)·Calendar
// 자격 판정(isCalendarEligible)·검색 시 유형 비교가 전부 새 유형 값 기준으로 정확히
// 동작한다 - Firestore 문서 자체는 바꾸지 않는다(읽은 배열만 정규화).
async function loadNormalizedEvents(uid) {
  const events = await listActiveDocsByOwner("events", uid);
  return events.map((e) => ({ ...e, type: normalizeEventType(e.type) }));
}

// Gemini에게 돌려주는 검색 결과는 항상 "필요한 최소 필드"만 남긴다.
// memo, ownerId, createdAt/updatedAt 같은 부가 정보는 전달하지 않는다.
function trimEvent(e) {
  return {
    id: e.id,
    title: e.title,
    date: e.date,
    startTime: e.startTime,
    endTime: e.endTime,
    type: e.type,
    customType: e.customType || undefined,
    attending: e.attending ?? undefined,
    status: e.status,
    calendarSync: !!e.calendarSync,
  };
}
function trimTask(t) {
  return { id: t.id, title: t.title, dueDate: t.dueDate, priority: t.priority, completed: t.completed };
}

// 준비사항 필드는 preparationNote가 있을 때만 함께 저장한다(Firestore는 undefined 값을
// 허용하지 않으므로, 없으면 아예 필드 자체를 넣지 않는다) - "준비사항 없음: 빈 문자열
// 또는 필드 없음"이라는 요구사항과 일치한다.
function buildPreparationFields(args) {
  if (!args.preparationNote) return {};
  return {
    preparationNote: args.preparationNote,
    preparationCompleted: typeof args.preparationCompleted === "boolean" ? args.preparationCompleted : false,
  };
}

// calendarHelpers: { getValidAccessToken, connect } - AssistantPage에서 useGoogleCalendar()로
// 얻은 것을 그대로 전달받는다. Gemini에게는 이 객체나 access token 값 자체를 절대 넘기지
// 않는다 - Gemini는 addToCalendar/attending 같은 "의도"만 함수 인자로 전달할 뿐이고,
// 실제 Google Calendar API 호출은 여기(클라이언트 코드)에서 수행한다.
async function execAddEvent(args, uid, calendarHelpers) {
  const now = new Date().toISOString();
  // tools.js의 eventTypeSchema가 새 7개 값만 enum으로 제공하므로 Gemini가 정상적으로
  // 동작하는 한 args.type은 이미 새 값이다. normalizeEventType()은 혹시 모델이 예전
  // 값(academic/school/council 등)을 잘못 채워 보내는 경우에 대비한 안전망이다(요구사항:
  // AI가 새 일정에 예전 유형 값을 생성하지 않도록) - 이 함수 안에서는 항상 이 값만 쓴다.
  const type = normalizeEventType(args.type);
  const attending = ATTENDANCE_BASED_EVENT_TYPES.includes(type) ? (typeof args.attending === "boolean" ? args.attending : null) : null;
  const preparationFields = buildPreparationFields(args);

  // ---- 반복 등록: EventsPage.jsx의 반복 생성과 완전히 같은 utils/recurrence.js
  // (generateRecurrenceDates/generateSeriesId)와 firebase/crud.js(createDocsBatch)를
  // 그대로 재사용한다 - 계산이나 batch 저장 로직을 이 파일에 따로 만들지 않는다.
  // 반복 일정은 Google Calendar에 자동 동기화하지 않는다(요구사항) - addToCalendar가
  // true여도 여기서는 무시한다.
  if (args.repeatType) {
    if (!args.repeatEndDate) {
      return { success: false, reason: "반복 종료일이 필요합니다. 언제까지 반복할지 먼저 확인해 주세요." };
    }
    const result = generateRecurrenceDates({
      startDate: args.date,
      repeatType: args.repeatType,
      repeatEndDate: args.repeatEndDate,
    });
    if (!result.ok) {
      return { success: false, reason: result.reason };
    }

    const seriesId = generateSeriesId();
    const docs = result.dates.map((date, index) => ({
      title: args.title,
      date,
      startTime: args.startTime ?? "",
      endTime: args.endTime ?? "",
      type,
      customType: type === "other" ? args.customType ?? "" : "",
      status: "예정",
      memo: args.memo ?? "",
      attending,
      ...preparationFields,
      source: "ai",
      calendarSync: false,
      googleCalendarId: null,
      seriesId,
      repeatType: args.repeatType,
      repeatEndDate: args.repeatEndDate,
      occurrenceIndex: index,
      isRecurringOccurrence: true,
      createdAt: now,
      updatedAt: now,
    }));

    const ids = await createDocsBatch("events", uid, docs);
    return {
      success: true,
      count: ids.length,
      seriesId,
      repeatType: args.repeatType,
      title: args.title,
      calendarSync: false,
    };
  }

  // ---- 기존 단건 등록(반복 아님) - 그대로 유지 ----
  const eligible = isCalendarEligible({ type, attending });

  let calendarSync = false;
  let googleCalendarId = null;
  let calendarNote;

  if (args.addToCalendar && eligible && calendarHelpers) {
    try {
      let token = await calendarHelpers.getValidAccessToken();
      if (!token && calendarHelpers.connect) {
        await calendarHelpers.connect();
        token = await calendarHelpers.getValidAccessToken();
      }
      if (token) {
        googleCalendarId = await createCalendarEvent(token, {
          title: args.title,
          date: args.date,
          startTime: args.startTime,
          endTime: args.endTime,
          memo: args.memo,
        });
        calendarSync = true;
      } else {
        calendarNote = "Google Calendar가 연결되어 있지 않아 동기화하지 못했습니다.";
      }
    } catch (err) {
      calendarNote =
        err instanceof MissingEndTimeError
          ? err.message
          : "Google Calendar 동기화에 실패했습니다.";
    }
  } else if (args.addToCalendar && !eligible) {
    calendarNote =
      type === "meeting" || type === "collaboration"
        ? "참석 여부가 확정되지 않아 Google Calendar에는 추가하지 않았습니다."
        : undefined;
  }

  const id = await createDoc("events", uid, {
    title: args.title,
    date: args.date,
    startTime: args.startTime ?? "",
    endTime: args.endTime ?? "",
    type,
    customType: type === "other" ? args.customType ?? "" : "",
    status: "예정",
    memo: args.memo ?? "",
    attending,
    ...preparationFields,
    source: "ai",
    calendarSync,
    googleCalendarId,
    createdAt: now,
    updatedAt: now,
  });

  return {
    success: true,
    id,
    title: args.title,
    date: args.date,
    calendarSync,
    ...(calendarNote ? { calendarNote } : {}),
  };
}

async function execUpdateEvent(args, uid) {
  const { eventId, ...fields } = args;
  const events = await loadNormalizedEvents(uid);
  const target = events.find((e) => e.id === eventId);
  if (!target) return { success: false, reason: "해당 id의 일정을 찾을 수 없습니다." };

  await updateDocById("events", eventId, { ...fields, updatedAt: new Date().toISOString() });
  return { success: true, id: eventId };
}

// "취소"(updateEvent status="취소")와는 완전히 다른 동작이지만, 더 이상 Firestore 문서를
// 완전히 지우지는 않는다 - 휴지통으로 이동(soft delete)만 하고 Google Calendar는 전혀
// 건드리지 않는다(요구사항). calendarSync/googleCalendarId를 그대로 보존해서, 휴지통에서
// 복원하면 Calendar 연결 상태가 그대로 이어진다. Calendar에서까지 완전히 지우는 결정은
// AI가 대신 내리지 않는다 - 사용자가 직접 설정의 휴지통 화면에서 영구 삭제를 선택해야
// 한다. alsoDeleteFromCalendar 파라미터는 이제 받지 않는다(tools.js에서도 제거).
async function execDeleteEvent(args, uid) {
  const events = await loadNormalizedEvents(uid);
  const target = events.find((e) => e.id === args.eventId);
  if (!target) return { success: false, reason: "해당 id의 일정을 찾을 수 없습니다." };

  await softDeleteDocById("events", args.eventId, "ai");

  return {
    success: true,
    id: args.eventId,
    title: target.title,
    movedToTrash: true,
    calendarKept: !!(target.calendarSync && target.googleCalendarId),
  };
}

// 이미 Firestore에 존재하는 일정을 Google Calendar에 "연결"만 한다. addEvent와 달리
// 새 Firestore 문서를 만들지 않는다 - 후속 대화("이것도 캘린더에 추가해줘")에서 같은
// 일정이 중복 생성되는 것을 막기 위한 전용 도구다.
async function execSyncEventToCalendar(args, uid, calendarHelpers) {
  const events = await loadNormalizedEvents(uid);
  const target = events.find((e) => e.id === args.eventId);
  if (!target) return { success: false, reason: "해당 id의 일정을 찾을 수 없습니다." };

  if (target.calendarSync && target.googleCalendarId) {
    return { success: true, id: target.id, alreadySynced: true };
  }

  const eligible = isCalendarEligible({ type: target.type, attending: target.attending });
  if (!eligible) {
    return {
      success: false,
      reason:
        target.type === "meeting" || target.type === "collaboration"
          ? "참석 여부가 확정되지 않아 Calendar에 추가할 수 없습니다."
          : "이 일정은 현재 Calendar 동기화 대상이 아닙니다.",
    };
  }

  if (!calendarHelpers) {
    return { success: false, reason: "Google Calendar 연결이 필요합니다." };
  }

  try {
    let token = await calendarHelpers.getValidAccessToken();
    if (!token && calendarHelpers.connect) {
      await calendarHelpers.connect();
      token = await calendarHelpers.getValidAccessToken();
    }
    if (!token) return { success: false, reason: "Google Calendar 연결이 필요합니다." };

    const googleCalendarId = await createCalendarEvent(token, {
      title: target.title,
      date: target.date,
      startTime: target.startTime,
      endTime: target.endTime,
      memo: target.memo,
    });

    await updateDocById("events", target.id, {
      calendarSync: true,
      googleCalendarId,
      updatedAt: new Date().toISOString(),
    });

    return { success: true, id: target.id, calendarSync: true };
  } catch (err) {
    const reason =
      err instanceof MissingEndTimeError ? err.message : "Google Calendar 동기화에 실패했습니다.";
    return { success: false, reason };
  }
}

async function execSearchEvents(args, uid) {
  const dateFrom = args.dateFrom || todayDateString();
  const dateTo = args.dateTo || dateFrom;
  const all = await loadNormalizedEvents(uid);
  const filtered = all
    .filter((e) => e.date >= dateFrom && e.date <= dateTo)
    .filter((e) => !args.type || e.type === normalizeEventType(args.type))
    .sort((a, b) => `${a.date}${a.startTime ?? ""}`.localeCompare(`${b.date}${b.startTime ?? ""}`))
    .slice(0, MAX_RESULTS);
  return { results: filtered.map(trimEvent) };
}

async function execAddTask(args, uid) {
  const now = new Date().toISOString();

  // ---- 반복 등록: EventsPage.jsx/TasksPage.jsx의 반복 생성과 같은 함수를 재사용한다.
  // 각 회차는 dueDate만 반복 날짜로 바뀌고 나머지 필드(제목/중요도/메모)는 동일하다.
  if (args.repeatType) {
    if (!args.repeatEndDate) {
      return { success: false, reason: "반복 종료일이 필요합니다. 언제까지 반복할지 먼저 확인해 주세요." };
    }
    const result = generateRecurrenceDates({
      startDate: args.dueDate,
      repeatType: args.repeatType,
      repeatEndDate: args.repeatEndDate,
    });
    if (!result.ok) {
      return { success: false, reason: result.reason };
    }

    const seriesId = generateSeriesId();
    const docs = result.dates.map((dueDate, index) => ({
      title: args.title,
      dueDate,
      priority: args.priority ?? "medium",
      memo: args.memo ?? "",
      completed: false,
      source: "ai",
      seriesId,
      repeatType: args.repeatType,
      repeatEndDate: args.repeatEndDate,
      occurrenceIndex: index,
      isRecurringOccurrence: true,
      createdAt: now,
      updatedAt: now,
    }));

    const ids = await createDocsBatch("tasks", uid, docs);
    return { success: true, count: ids.length, seriesId, repeatType: args.repeatType, title: args.title };
  }

  const id = await createDoc("tasks", uid, {
    title: args.title,
    dueDate: args.dueDate,
    priority: args.priority ?? "medium",
    memo: args.memo ?? "",
    completed: false,
    source: "ai",
    createdAt: now,
    updatedAt: now,
  });
  return { success: true, id, title: args.title, dueDate: args.dueDate };
}

async function execUpdateTask(args, uid) {
  const { taskId, ...fields } = args;
  const tasks = await listActiveDocsByOwner("tasks", uid);
  const target = tasks.find((t) => t.id === taskId);
  if (!target) return { success: false, reason: "해당 id의 업무를 찾을 수 없습니다." };

  // completed가 함께 전달되면(주로 완료 취소: completed=false) TasksPage.jsx의
  // toggleCompleted/AI의 completeTask와 같은 규칙으로 completedAt을 같이 맞춘다 -
  // completed만 바뀌고 completedAt이 예전 값으로 남는 기존 불일치를 막는다(요구사항).
  // completed가 없는 일반 필드(title/dueDate/priority/memo) 수정은 이 로직의 영향을
  // 전혀 받지 않는다.
  const completedFields =
    typeof fields.completed === "boolean" ? { completedAt: fields.completed ? new Date().toISOString() : null } : {};

  await updateDocById("tasks", taskId, { ...fields, ...completedFields, updatedAt: new Date().toISOString() });
  return { success: true, id: taskId };
}

async function execCompleteTask(args, uid) {
  const tasks = await listActiveDocsByOwner("tasks", uid);
  const target = tasks.find((t) => t.id === args.taskId);
  if (!target) return { success: false, reason: "해당 id의 업무를 찾을 수 없습니다." };

  // completedAt은 TasksPage.jsx의 체크박스 완료 처리와 정확히 같은 형식(ISO 문자열)으로
  // 기록한다 - 퇴근 전 정리("오늘 완료한 업무")가 이 값을 읽는다.
  const now = new Date().toISOString();
  await updateDocById("tasks", args.taskId, { completed: true, completedAt: now, updatedAt: now });
  return { success: true, id: args.taskId, title: target.title };
}

async function execSearchTasks(args, uid) {
  const all = await listActiveDocsByOwner("tasks", uid);
  const filtered = all
    .filter((t) => (args.dueFrom ? t.dueDate >= args.dueFrom : true))
    .filter((t) => (args.dueTo ? t.dueDate <= args.dueTo : true))
    .filter((t) => (typeof args.completed === "boolean" ? t.completed === args.completed : true))
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
    .slice(0, MAX_RESULTS);
  return { results: filtered.map(trimTask) };
}

// Google Calendar에서 특정 날짜의 일정을 조회한다 - Firestore에는 절대 쓰지 않는다(순수
// 조회). 이미 이 사용자의 events에 같은 googleCalendarId로 연결된 일정은
// alreadyImported로 표시한다 - 출처가 manual/ai/google_import 무엇이든 googleCalendarId가
// 같으면 이미 업무비서에 등록된 것으로 본다. 여기서는 listActiveDocsByOwner가 아니라
// listDocsByOwner(휴지통 문서까지 포함한 전체 조회)를 그대로 쓴다 - 휴지통에 있는 일정과
// 같은 googleCalendarId를 다시 "가져오기"로 중복 생성하면, 나중에 그 휴지통 항목을
// 복원할 때 같은 Calendar 일정이 앱에 두 번 존재하게 된다. inTrash는 그 항목이 지금
// 휴지통에 있다는 뜻이다 - Gemini가 "이미 가져왔지만 휴지통에 있다"처럼 정확히 안내할 수
// 있게 한다.
async function execGetGoogleCalendarEvents(args, uid, calendarHelpers) {
  if (!calendarHelpers) {
    return { success: false, reason: "Google Calendar 연결 기능을 사용할 수 없습니다." };
  }
  let token = await calendarHelpers.getValidAccessToken();
  if (!token && calendarHelpers.connect) {
    await calendarHelpers.connect();
    token = await calendarHelpers.getValidAccessToken();
  }
  if (!token) {
    return { success: false, reason: "Google Calendar 연결이 필요합니다." };
  }

  const [candidates, existingEvents] = await Promise.all([
    listCalendarEvents(token, args.date),
    listDocsByOwner("events", uid),
  ]);

  const importedIds = new Set(existingEvents.filter((e) => e.googleCalendarId).map((e) => e.googleCalendarId));
  const trashedIds = new Set(
    existingEvents.filter((e) => e.googleCalendarId && e.deletedAt).map((e) => e.googleCalendarId)
  );

  return {
    success: true,
    date: args.date,
    events: candidates.map((c) => ({
      ...c,
      alreadyImported: importedIds.has(c.id),
      inTrash: trashedIds.has(c.id),
    })),
  };
}

// 직전 조회 후보 중 사용자가 고른 것만 저장한다. Gemini가 넘긴 title/date/time은 전혀
// 받지 않는다(tool 파라미터에 없음) - googleEventIds(실제 Google event id)만 받아서,
// 그 날짜를 다시 listCalendarEvents로 조회해 실제 Google 데이터를 확인한 뒤에만
// 저장한다. Gemini가 존재하지 않는 id를 지어내도 candidates에서 찾지 못해 저장되지
// 않는다 - 저장되는 내용의 원본은 항상 이 시점에 다시 확인한 Google Calendar API
// 데이터다.
async function execImportGoogleCalendarEvents(args, uid, calendarHelpers) {
  if (!calendarHelpers) {
    return { success: false, reason: "Google Calendar 연결 기능을 사용할 수 없습니다." };
  }
  let token = await calendarHelpers.getValidAccessToken();
  if (!token && calendarHelpers.connect) {
    await calendarHelpers.connect();
    token = await calendarHelpers.getValidAccessToken();
  }
  if (!token) {
    return { success: false, reason: "Google Calendar 연결이 필요합니다." };
  }

  const requestedIds = Array.isArray(args.googleEventIds) ? args.googleEventIds : [];
  if (requestedIds.length === 0) {
    return { success: false, reason: "가져올 일정을 확인하지 못했습니다." };
  }

  // execGetGoogleCalendarEvents와 같은 이유로 listDocsByOwner(휴지통 포함 전체 조회)를
  // 그대로 쓴다 - 휴지통에 있는 일정의 googleCalendarId도 importedIds에 포함되어야
  // 중복 가져오기(및 복원 후 중복 문서)를 막을 수 있다.
  const [candidates, existingEvents] = await Promise.all([
    listCalendarEvents(token, args.date),
    listDocsByOwner("events", uid),
  ]);

  const importedIds = new Set(existingEvents.filter((e) => e.googleCalendarId).map((e) => e.googleCalendarId));
  const now = new Date().toISOString();

  const imported = [];
  const skipped = [];

  for (const id of requestedIds) {
    const candidate = candidates.find((c) => c.id === id);
    if (!candidate) {
      skipped.push({ id, reason: "not_found" });
      continue;
    }
    if (importedIds.has(id)) {
      skipped.push({ id, reason: "already_imported", title: candidate.title });
      continue;
    }

    await createDoc("events", uid, {
      title: candidate.title,
      date: candidate.date,
      startTime: candidate.startTime,
      endTime: candidate.endTime,
      type: "other",
      customType: "",
      status: "예정",
      memo: "",
      attending: null,
      source: "google_import",
      calendarSync: true,
      googleCalendarId: candidate.id,
      createdAt: now,
      updatedAt: now,
    });
    imported.push({ id, title: candidate.title, date: candidate.date });
  }

  return { success: true, imported, skipped };
}

export const TOOL_EXECUTORS = {
  addEvent: execAddEvent,
  updateEvent: execUpdateEvent,
  deleteEvent: execDeleteEvent,
  syncEventToCalendar: execSyncEventToCalendar,
  searchEvents: execSearchEvents,
  addTask: execAddTask,
  updateTask: execUpdateTask,
  completeTask: execCompleteTask,
  searchTasks: execSearchTasks,
  getGoogleCalendarEvents: execGetGoogleCalendarEvents,
  importGoogleCalendarEvents: execImportGoogleCalendarEvents,
};
