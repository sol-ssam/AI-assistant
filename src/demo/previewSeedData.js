// '게스트로 체험하기'(Firebase Anonymous 사용자) 전용 샘플 데이터 빌더.
//
// - Firestore를 전혀 건드리지 않는 순수 함수다. AI로 생성하지 않고, 항상 같은 입력
//   (uid, today)에 같은 결과를 돌려주는 고정(deterministic) seed다.
// - 문서 형식은 실제 앱이 쓰는 events/tasks schema와 정확히 같다. 시간표·진도·학사일정 같은
//   교육용 컬렉션은 더 이상 만들지 않는다(일반 직장인용 전환 - 게스트에게도 일정과 업무만
//   보여준다).
// - 실제 회사명·사람 이름·개인정보는 쓰지 않는다.
// - 날짜는 특정 연도에 고정하지 않는다. today(Asia/Seoul 기준 YYYY-MM-DD)를 기준으로
//   today ± N일로 만들어서, 게스트가 언제 로그인하든 "오늘 일정"과 "오늘 마감"/"기한 지남"
//   업무가 항상 오늘의 브리핑에 나타난다.
import { addDaysToDateString } from "../utils/date";

// 스키마가 시간표/진도 포함 버전(1)에서 events/tasks만 남기는 버전으로 바뀌었으므로 올린다.
// 이 값은 settings에 기록만 될 뿐 재시딩을 트리거하지는 않는다(ensurePreviewData 참고) -
// 이미 이전 버전으로 체험을 시작한 게스트가 있다면 새로고침으로 새 샘플이 섞여 들어가지
// 않는다(같은 uid로는 어차피 다시 로그인할 수 없는 익명 세션이라 실무 영향은 없다).
export const PREVIEW_SEED_VERSION = 2;

// 오늘 오전 10시 "주간 업무회의", 오늘 오후 2시 "프로젝트 중간 점검", 내일 오전 11시
// "거래처 미팅", 며칠 뒤 "월간 실적 공유". attending은 전부 true로 둔다 - 게스트 본인이
// 참석하는 회의로 확정된 상태를 보여줘 이후 "Google Calendar에도 추가해줘" 같은 AI 비서
// 시나리오도 그대로 시험해 볼 수 있게 한다(게스트는 Calendar 연결 자체가 막혀 있으므로
// 실제로 연동되지는 않는다).
const EVENT_SAMPLES = [
  {
    key: "meeting_weekly",
    offset: 0,
    startTime: "10:00",
    endTime: "11:00",
    type: "meeting",
    title: "주간 업무회의",
    attending: true,
  },
  {
    key: "meeting_project",
    offset: 0,
    startTime: "14:00",
    endTime: "15:00",
    type: "meeting",
    title: "프로젝트 중간 점검",
    attending: true,
    // 준비사항 기능(5-2단계) 샘플 - 게스트도 "준비할 일정"과 홈의 준비 완료 체크를 바로
    // 체험할 수 있도록 이 항목에만 준비사항을 하나 넣는다. 반복 항목은 게스트 세션이
    // 반복될수록 문서가 계속 쌓일 수 있어 의도적으로 추가하지 않는다.
    preparationNote: "진행 현황 자료와 발표 파일 확인",
  },
  {
    key: "meeting_partner",
    offset: 1,
    startTime: "11:00",
    endTime: "12:00",
    type: "meeting",
    title: "거래처 미팅",
    attending: true,
  },
  {
    key: "meeting_monthly",
    offset: 4,
    startTime: "",
    endTime: "",
    type: "meeting",
    title: "월간 실적 공유",
    attending: true,
  },
];

// 기한이 하루 지난 "거래처 요청사항 확인", 오늘 마감인 "주간 업무보고 작성", 이틀 뒤 마감인
// "발표자료 초안 작성", 며칠 뒤 마감인 "월간 실적 보고서 제출". 오늘의 브리핑이 다루는
// 네 영역(기한 지남/오늘 마감/다가오는 업무 + 위 일정으로 오늘·다가오는 일정)이 로그인 즉시
// 전부 채워지도록 offset을 고른다.
const TASK_SAMPLES = [
  { key: "partner_followup", offset: -1, title: "거래처 요청사항 확인", priority: "high", completed: false },
  { key: "weekly_report", offset: 0, title: "주간 업무보고 작성", priority: "high", completed: false },
  { key: "presentation_draft", offset: 2, title: "발표자료 초안 작성", priority: "medium", completed: false },
  { key: "monthly_report", offset: 6, title: "월간 실적 보고서 제출", priority: "medium", completed: false },
];

export function buildPreviewSeed({ uid, today, nowIso }) {
  if (!uid) throw new Error("buildPreviewSeed: uid가 필요합니다.");

  const docs = [];
  // 문서 ID에는 반드시 현재 익명 사용자의 UID를 넣는다. ID가 모든 게스트 사용자에게 같으면
  // 이전 게스트가 만든 문서와 충돌해서, 새 사용자의 쓰기가 create가 아니라 "남의 문서
  // update"로 판정되어 Rules에서 거부된다. 같은 사용자가 재시도해도(ensurePreviewData의
  // inflight/previewInitialized 가드와 별개로) 같은 문서를 덮어쓸 뿐 중복 생성되지 않는다.
  const docId = (suffix) => `preview_${uid}_${suffix}`;
  const add = (collection, id, data) => docs.push({ collection, id, data: { ...data, ownerId: uid } });
  const stamps = { createdAt: nowIso, updatedAt: nowIso };

  for (const e of EVENT_SAMPLES) {
    add("events", docId(`event_${e.key}`), {
      title: e.title,
      date: addDaysToDateString(today, e.offset),
      startTime: e.startTime,
      endTime: e.endTime,
      type: e.type,
      customType: "",
      status: "예정",
      memo: "",
      attending: e.attending ?? null,
      source: "manual",
      calendarSync: false,
      googleCalendarId: null,
      preparationNote: e.preparationNote ?? "",
      preparationCompleted: false,
      ...stamps,
    });
  }

  for (const t of TASK_SAMPLES) {
    add("tasks", docId(`task_${t.key}`), {
      title: t.title,
      dueDate: addDaysToDateString(today, t.offset),
      priority: t.priority,
      memo: "",
      completed: t.completed,
      source: "manual",
      ...stamps,
    });
  }

  return { docs, generatedFor: today };
}

// seed를 Firestore에 쓰기 전 마지막으로 확인하는 안전장치. events/tasks 외의 컬렉션(옛
// timetable/progress_* 등 교육용 컬렉션 포함)에는 게스트 샘플을 절대 새로 쓰지 않는다는
// 것을 코드로 강제한다 - 나중에 누가 위 상수를 고치다 실수로 교육용 컬렉션을 다시 추가해도
// 여기서 즉시 실패해 잘못된 데이터가 쓰이지 않는다.
export function assertPreviewSeedIntegrity(seed, uid) {
  const fail = (msg) => {
    throw new Error(`Preview seed 검증 실패: ${msg}`);
  };

  if (seed.docs.length === 0) fail("생성된 샘플 문서가 없습니다.");
  if (seed.docs.some((d) => d.data.ownerId !== uid)) fail("ownerId가 현재 사용자 UID가 아닌 문서가 있습니다.");
  if (new Set(seed.docs.map((d) => `${d.collection}/${d.id}`)).size !== seed.docs.length) {
    fail("문서 ID가 중복됩니다.");
  }
  const idPrefix = `preview_${uid}_`;
  if (seed.docs.some((d) => !d.id.startsWith(idPrefix))) fail("UID namespace가 없는 문서 ID가 있습니다.");

  const allowedCollections = new Set(["events", "tasks"]);
  if (seed.docs.some((d) => !allowedCollections.has(d.collection))) {
    fail("게스트 샘플은 events/tasks 외의 컬렉션에 생성할 수 없습니다.");
  }
}
