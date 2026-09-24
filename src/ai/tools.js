import { Schema } from "firebase/ai";

// 이 파일은 "선언"만 담당한다. 실제 Firestore 접근은 toolExecutors.js에서
// 기존 firebase/collections.js, firebase/crud.js 함수를 통해서만 이루어진다.
// Gemini는 여기 정의된 함수 이름과 파라미터 구조 밖의 어떤 컬렉션이나 쿼리도 만들어낼 수 없다.

const eventTypeSchema = Schema.enumString({
  description:
    "일정 구분. work=업무 일정, meeting=회의, collaboration=협업·협의(부서 간 논의 포함), training=교육·연수, business_trip=출장·외근, personal=개인 일정, other=기타(사용자가 직접 말한 구분명을 customType에 채운다). 새로 등록하거나 수정하는 일정에는 이 7개 값만 사용한다 - academic/school/council처럼 예전에 쓰이던 값은 절대 새로 채우지 않는다.",
  enum: ["work", "meeting", "collaboration", "training", "business_trip", "personal", "other"],
});

const prioritySchema = Schema.enumString({
  description: "업무 중요도",
  enum: ["high", "medium", "low"],
});

const dateSchema = (description) => Schema.string({ description: `${description} (YYYY-MM-DD 형식)` });

// 매주/매월 반복 등록(addEvent/addTask 공용). repeatType이 채워지면 repeatEndDate도
// 반드시 함께 채워야 한다 - 하나만 있으면 실행기가 실패를 돌려준다. 최대 1년·50회
// 제한은 utils/recurrence.js가 결정론적으로 검사한다(여기서는 추측하지 않는다).
const repeatTypeSchema = Schema.enumString({
  description:
    "반복 유형. weekly=매주, monthly=매월. 사용자가 '매주', '매월'이라고 명확히 말한 경우에만 채운다 - 반복 여부를 임의로 추측하지 않는다.",
  enum: ["weekly", "monthly"],
});
const repeatEndDateSchema = dateSchema(
  "반복을 끝낼 마지막 날짜. repeatType을 채웠다면 이 값도 반드시 함께 받아야 한다 - 사용자가 종료일을 말하지 않았다면 이 함수를 호출하지 말고 먼저 언제까지 반복할지 확인한다"
);

export const addEventDeclaration = {
  name: "addEvent",
  description:
    "사용자가 자신의 일정으로 명확히 확인한 경우에만 새 일정을 등록한다. 참석 여부가 불명확한 회의는 이 함수를 호출하지 말고 먼저 사용자에게 확인한다.",
  parameters: Schema.object({
    properties: {
      title: Schema.string({ description: "일정 제목" }),
      date: dateSchema("일정 날짜"),
      startTime: Schema.string({ description: "시작 시간 (HH:MM, 24시간제)" }),
      endTime: Schema.string({ description: "종료 시간 (HH:MM, 24시간제)" }),
      type: eventTypeSchema,
      customType: Schema.string({
        description:
          "type이 other(기타)일 때만 사용한다. 사용자가 말한 구분명을 그대로 채운다 (예: '거래처 미팅'). 그 외 type에서는 채우지 않는다.",
      }),
      attending: Schema.boolean({
        description:
          "type이 meeting(회의) 또는 collaboration(협업·협의)일 때만 사용한다. 사용자가 참석한다고 명확히 말했으면 true, 불참이라고 말했으면 false로 채운다. 참석 여부가 불명확하면 이 필드를 채우지 말고, 애초에 이 함수를 호출하기 전에 먼저 사용자에게 참석 여부를 물어봐야 한다.",
      }),
      addToCalendar: Schema.boolean({
        description:
          "사용자가 '캘린더에도 추가해줘', 'Google 캘린더에 넣어줘'처럼 Google Calendar 동기화를 명확히 요청한 경우에만 true로 채운다. 사용자가 캘린더에 대해 언급하지 않았다면 이 필드를 채우지 않는다 - 동기화 의사를 임의로 추측하지 않는다. 반복 일정(repeatType이 있는 경우)에는 이 값이 있어도 무시된다 - 반복 일정은 자동으로 Google Calendar에 동기화되지 않는다.",
      }),
      memo: Schema.string({ description: "짧은 메모 (선택)" }),
      preparationNote: Schema.string({
        description:
          "이 일정을 위해 미리 준비할 자료나 확인할 사항. 사용자가 명확히 말한 내용만 그대로 채운다 - 임의로 만들어내지 않는다.",
      }),
      preparationCompleted: Schema.boolean({
        description:
          "준비를 이미 마쳤다고 사용자가 명확히 말한 경우에만 true로 채운다. 보통 새로 등록하는 일정은 준비가 아직 안 끝났을 것이므로 대부분 채우지 않는다(그러면 준비사항이 있는 한 자동으로 false로 저장된다).",
      }),
      repeatType: repeatTypeSchema,
      repeatEndDate: repeatEndDateSchema,
    },
    optionalProperties: [
      "startTime",
      "endTime",
      "customType",
      "attending",
      "addToCalendar",
      "memo",
      "preparationNote",
      "preparationCompleted",
      "repeatType",
      "repeatEndDate",
    ],
  }),
};

export const updateEventDeclaration = {
  name: "updateEvent",
  description:
    "이미 등록된 일정 하나를 수정한다. eventId는 searchEvents 결과의 id를 사용한다. 취소된 일정은 여기서 status를 '취소'로 바꾼다 (기록은 남긴다) - 실제로 지우려면 deleteEvent를 쓴다.",
  parameters: Schema.object({
    properties: {
      eventId: Schema.string({ description: "수정할 일정의 id (searchEvents 결과에서 얻음)" }),
      title: Schema.string({ description: "새 제목 (변경 시)" }),
      date: dateSchema("새 날짜 (변경 시)"),
      startTime: Schema.string({ description: "새 시작 시간 (변경 시)" }),
      endTime: Schema.string({ description: "새 종료 시간 (변경 시)" }),
      type: eventTypeSchema,
      customType: Schema.string({
        description: "type을 other(기타)로 바꿀 때만 사용. 사용자가 말한 구분명을 채운다.",
      }),
      attending: Schema.boolean({
        description: "type이 meeting 또는 collaboration일 때, 참석 여부가 바뀌었으면 채운다.",
      }),
      status: Schema.string({ description: "상태: 예정/완료/취소 (변경 시)" }),
      memo: Schema.string({ description: "새 메모 (변경 시)" }),
      preparationNote: Schema.string({
        description:
          "이 일정을 위해 미리 준비할 자료나 확인할 사항 (변경 시). 사용자가 명확히 말한 내용만 그대로 채운다 - 임의로 만들어내지 않는다.",
      }),
      preparationCompleted: Schema.boolean({
        description:
          "사용자가 '준비 다 했어', '자료 확인했어'처럼 준비를 마쳤다고 명확히 말한 경우에만 true로 채운다. 이건 그 일정의 준비 상태일 뿐, 일정 자체의 완료/취소(status)와는 별개다 - '준비 완료'라는 말을 일정 완료나 취소로 해석하지 않는다. 어떤 일정을 말하는지 특정할 수 없으면 이 필드를 채우지 말고 먼저 searchEvents로 찾아 사용자에게 확인한다.",
      }),
    },
    optionalProperties: [
      "title",
      "date",
      "startTime",
      "endTime",
      "type",
      "customType",
      "attending",
      "status",
      "memo",
      "preparationNote",
      "preparationCompleted",
    ],
  }),
};

export const deleteEventDeclaration = {
  name: "deleteEvent",
  description:
    "일정을 앱의 휴지통으로 이동한다(영구 삭제가 아니다 - Firestore 문서는 그대로 남아 있고 나중에 복원할 수 있다). Google Calendar에 연결되어 있던 일정이어도 Calendar 쪽은 전혀 건드리지 않고 그대로 둔다 - Calendar에서까지 완전히 삭제하려면 사용자가 직접 설정의 휴지통 화면에서 영구 삭제를 선택해야 한다(이 함수로는 할 수 없다). 사용자가 '취소됐어'라고만 말했다면 이 함수 대신 updateEvent로 status를 '취소'로 바꿔야 한다 - '삭제해줘', '지워줘'처럼 실제 삭제(휴지통 이동) 의도가 명확할 때만 이 함수를 쓴다. 대상이 모호하면 먼저 searchEvents로 찾고, 여러 개가 검색되면 임의로 고르지 말고 사용자에게 어떤 일정인지 물어본다. 반복 일정 전체를 한 번에 삭제하는 기능은 없다 - 이 함수는 회차 하나만 휴지통으로 옮긴다.",
  parameters: Schema.object({
    properties: {
      eventId: Schema.string({ description: "휴지통으로 옮길 일정의 id" }),
    },
  }),
};

export const syncEventToCalendarDeclaration = {
  name: "syncEventToCalendar",
  description:
    "이미 Firestore에 등록되어 있는 기존 일정을 Google Calendar에 연결한다. 새 일정을 만들지 않는다 - '이것도 캘린더에 추가해줘', '방금 만든 일정 캘린더에 넣어줘'처럼 이미 언급된 일정을 가리킬 때 addEvent를 다시 호출하지 말고 이 함수를 쓴다. 이미 Calendar에 연결되어 있으면 중복으로 새로 만들지 않는다.",
  parameters: Schema.object({
    properties: {
      eventId: Schema.string({ description: "Calendar에 연결할 기존 일정의 id" }),
    },
  }),
};

export const searchEventsDeclaration = {
  name: "searchEvents",
  description: "날짜 범위 또는 구분으로 등록된 일정을 검색한다.",
  parameters: Schema.object({
    properties: {
      dateFrom: dateSchema("검색 시작 날짜 (선택, 생략 시 오늘)"),
      dateTo: dateSchema("검색 종료 날짜 (선택, 생략 시 dateFrom과 동일)"),
      type: eventTypeSchema,
    },
    optionalProperties: ["dateFrom", "dateTo", "type"],
  }),
};

export const addTaskDeclaration = {
  name: "addTask",
  description: "새로운 업무(할 일)를 마감일과 함께 등록한다.",
  parameters: Schema.object({
    properties: {
      title: Schema.string({ description: "업무명" }),
      dueDate: dateSchema("마감일"),
      priority: prioritySchema,
      memo: Schema.string({ description: "짧은 메모 (선택)" }),
      repeatType: repeatTypeSchema,
      repeatEndDate: repeatEndDateSchema,
    },
    optionalProperties: ["priority", "memo", "repeatType", "repeatEndDate"],
  }),
};

export const updateTaskDeclaration = {
  name: "updateTask",
  description: "이미 등록된 업무 하나를 수정한다. taskId는 searchTasks 결과의 id를 사용한다.",
  parameters: Schema.object({
    properties: {
      taskId: Schema.string({ description: "수정할 업무의 id" }),
      title: Schema.string({ description: "새 업무명 (변경 시)" }),
      dueDate: dateSchema("새 마감일 (변경 시)"),
      priority: prioritySchema,
      memo: Schema.string({ description: "새 메모 (변경 시)" }),
      completed: Schema.boolean({
        description:
          "완료 상태를 직접 바꿀 때만 채운다. 주로 '완료 취소해줘', '아직 다 못했어'처럼 이미 완료 처리된 업무를 다시 미완료로 되돌릴 때(false) 쓴다. 새로 완료 처리하는 것은 이 필드 대신 completeTask를 우선 사용한다 - completed를 true로 채우면 completeTask와 동일하게 완료 시각도 함께 기록된다.",
      }),
    },
    optionalProperties: ["title", "dueDate", "priority", "memo", "completed"],
  }),
};

export const completeTaskDeclaration = {
  name: "completeTask",
  description: "업무를 완료 처리한다. taskId는 searchTasks 결과의 id를 사용한다.",
  parameters: Schema.object({
    properties: {
      taskId: Schema.string({ description: "완료 처리할 업무의 id" }),
    },
  }),
};

export const searchTasksDeclaration = {
  name: "searchTasks",
  description: "마감일 범위 또는 완료 여부로 업무를 검색한다.",
  parameters: Schema.object({
    properties: {
      dueFrom: dateSchema("검색 시작 마감일 (선택)"),
      dueTo: dateSchema("검색 종료 마감일 (선택)"),
      completed: Schema.boolean({ description: "완료 여부로 필터 (선택)" }),
    },
    optionalProperties: ["dueFrom", "dueTo", "completed"],
  }),
};

export const getGoogleCalendarEventsDeclaration = {
  name: "getGoogleCalendarEvents",
  description:
    "특정 날짜의 Google Calendar 일정을 조회한다 - 조회 전용이며 Firestore에 절대 저장하지 않는다. 결과를 후보 목록으로 사용자에게 보여주기만 한다. '가져와줘'라고 말했어도 조회 직후 자동으로 전부 저장하지 않는다 - 사용자가 어떤 것을 가져올지 고르면 그때 importGoogleCalendarEvents를 별도로 호출한다. alreadyImported가 true인 항목은 이미 업무비서에 등록되어 있다는 뜻이다.",
  parameters: Schema.object({
    properties: {
      date: dateSchema("조회할 날짜"),
    },
  }),
};

export const importGoogleCalendarEventsDeclaration = {
  name: "importGoogleCalendarEvents",
  description:
    "직전에 getGoogleCalendarEvents로 조회한 후보 중 사용자가 실제로 선택한 일정만 Firestore events에 저장한다. 제목/날짜/시간을 네가 새로 만들어서 넘기지 않는다 - 반드시 방금 조회 결과에 있던 실제 Google event id만 googleEventIds에 담아 전달한다. 실행기가 그 id로 Google Calendar를 다시 조회해 실제 데이터를 확인한 뒤 저장하므로, 존재하지 않는 id를 지어내면 저장되지 않는다. 이미 업무비서에 등록된(alreadyImported) 일정은 다시 저장하지 않는다.",
  parameters: Schema.object({
    properties: {
      date: dateSchema("조회했던 날짜 (직전 getGoogleCalendarEvents에 쓴 것과 같은 날짜)"),
      googleEventIds: Schema.array({
        items: Schema.string(),
        description: "사용자가 선택한 일정들의 실제 Google event id 목록",
      }),
    },
  }),
};

export const TOOLS = [
  {
    functionDeclarations: [
      addEventDeclaration,
      updateEventDeclaration,
      deleteEventDeclaration,
      syncEventToCalendarDeclaration,
      searchEventsDeclaration,
      addTaskDeclaration,
      updateTaskDeclaration,
      completeTaskDeclaration,
      searchTasksDeclaration,
      getGoogleCalendarEventsDeclaration,
      importGoogleCalendarEventsDeclaration,
    ],
  },
];
