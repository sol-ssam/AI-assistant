import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useGoogleCalendar } from "../contexts/GoogleCalendarContext";
import { createDoc, createDocsBatch, updateDocById, listActiveDocsByOwner, softDeleteDocById } from "../firebase/crud";
import { createCalendarEvent, updateCalendarEvent, MissingEndTimeError } from "../calendar/calendarApi";
import {
  isCalendarEligible,
  ATTENDING_OPTIONS,
  parseAttendingValue,
  attendingToSelectValue,
} from "../utils/calendarEligibility";
import {
  EVENT_TYPES,
  ATTENDANCE_BASED_EVENT_TYPES,
  eventTypeDisplayLabel,
  normalizeEventType,
} from "../utils/constants";
import { formatDateDisplay, weekdayKoreanOf, todayDateString } from "../utils/date";
import { useFieldErrors, isBlank, isTimeBefore } from "../utils/formValidation";
import { findTimeConflicts } from "../utils/timeConflictDetection";
import { generateRecurrenceDates, generateSeriesId } from "../utils/recurrence";
import FieldError from "../components/FieldError";
import "./crud-shared.css";
import "./EventsPage.css";

const MAX_PREPARATION_NOTE_LENGTH = 300;

const emptyForm = {
  title: "",
  date: "",
  startTime: "",
  endTime: "",
  type: "personal",
  customType: "",
  status: "예정",
  memo: "",
  attending: "unknown",
  addToCalendar: false,
  preparationNote: "",
  repeatType: "none",
  repeatEndDate: "",
};

// 일정 저장 전 확인하는 조건: 제목/날짜 필수, 종료 시간은 시작 시간 이후, "기타" 구분은
// 직접 입력 필수, 준비사항은 300자 이내. 반복(repeatType !== "none")이면 반복 종료일도
// 함께 검증한다 - 실제 날짜 계산(최대 1년·50회, 종료일이 시작일보다 빠른 경우 등)은
// utils/recurrence.js의 generateRecurrenceDates를 그대로 재사용해, 저장 시 쓰는 함수와
// 항상 같은 기준으로 검증한다. Firestore에 실제로 어떤 값이 저장되는지는 그대로 두고,
// 저장을 시도하기 전에 이 조건을 만족하는지만 화면에서 먼저 확인한다.
function validateEventForm(values) {
  const errors = {};
  if (isBlank(values.title)) errors.title = "제목을 입력해 주세요.";
  if (isBlank(values.date)) errors.date = "날짜를 선택해 주세요.";
  if (isTimeBefore(values.startTime, values.endTime)) {
    errors.endTime = "종료 시간은 시작 시간 이후로 설정해 주세요.";
  }
  if (values.type === "other" && isBlank(values.customType)) {
    errors.customType = "구분을 직접 입력해 주세요.";
  }
  if (values.preparationNote && values.preparationNote.length > MAX_PREPARATION_NOTE_LENGTH) {
    errors.preparationNote = `준비사항은 ${MAX_PREPARATION_NOTE_LENGTH}자 이내로 입력해 주세요.`;
  }
  if (values.repeatType && values.repeatType !== "none") {
    if (isBlank(values.repeatEndDate)) {
      errors.repeatEndDate = "반복 종료일을 입력해 주세요.";
    } else if (!isBlank(values.date)) {
      const check = generateRecurrenceDates({
        startDate: values.date,
        repeatType: values.repeatType,
        repeatEndDate: values.repeatEndDate,
      });
      if (!check.ok) errors.repeatEndDate = check.reason;
    }
  }
  return errors;
}

// 폼에 입력 중인 날짜·시간이 기존 일정과 겹치면 저장 전에 미리 보여주는 경고 - 저장을
// 막지 않는다(요구사항). 최대 3건까지 제목·시간을 보여주고, 그 이상은 "외 N건"으로 줄인다.
function ConflictWarning({ conflicts }) {
  if (!conflicts || conflicts.length === 0) return null;
  const shown = conflicts.slice(0, 3);
  const extra = conflicts.length - shown.length;
  return (
    <div className="ep-conflict-warning" aria-live="polite">
      <p className="ep-conflict-warning__lead">
        <span aria-hidden="true">⚠️</span> 다음 일정과 시간이 겹칩니다.
      </p>
      <ul className="ep-conflict-warning__list">
        {shown.map((ev) => (
          <li key={ev.id}>
            {ev.title}({ev.startTime}~{ev.endTime})
          </li>
        ))}
      </ul>
      {extra > 0 && <p className="ep-conflict-warning__more">외 {extra}건</p>}
    </div>
  );
}

// 개발자 확인용 로그에는 사용자가 입력한 제목·메모 등이 섞일 수 있는 error.message를 남기지
// 않고, 오류 종류(code/name)만 남긴다.
function safeErrorInfo(err) {
  return err?.code ?? err?.name ?? "unknown";
}

// 등록/수정 form 안에 표시하는 저장 실패 안내 - 페이지의 기존 결과 메시지(.ep-result-message)와
// 같은 구조·스타일에 닫기 버튼을 붙이고, role="alert"로 스크린리더에 즉시 알린다.
function SaveErrorMessage({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="ep-result-message" role="alert">
      <p className="status status--error">{message.text}</p>
      <button type="button" className="btn-text" aria-label="오류 메시지 닫기" onClick={onClose}>
        닫기
      </button>
    </div>
  );
}

// 등록 form과 인라인 수정 form이 완전히 동일한 필드 UI를 공유한다(중복 방지). 각 form은
// 자기 자신의 state(신규 등록용 form, 또는 그 항목만의 editForm)와 오류 state를 따로 갖고
// 이 컴포넌트에 넘겨줄 뿐이다.
// existingEvents/excludeId: 시간 충돌 경고 계산용 - 등록 form은 전체 events를 그대로,
// 수정 form은 자기 자신(editingId)을 제외하고 비교한다(utils/timeConflictDetection.js).
// showRepeatOptions: 반복 등록 UI(반복/반복 종료일)는 새 일정 등록 폼에서만 보여준다
// (요구사항: 수정 폼에서는 반복 규칙을 다시 확장하거나 문서를 추가 생성하지 않는다) -
// 수정 폼 호출부는 이 prop을 아예 넘기지 않아 기본값 false로 숨겨진다.
function EventFormFields({
  values,
  onChange,
  calendarConfigured,
  connected,
  connecting,
  errors = {},
  registerField,
  idPrefix,
  existingEvents = [],
  excludeId,
  showRepeatOptions = false,
}) {
  const isAttendanceBasedType = ATTENDANCE_BASED_EVENT_TYPES.includes(values.type);
  const eligibleNow = isCalendarEligible({
    type: values.type,
    attending: isAttendanceBasedType ? parseAttendingValue(values.attending) : null,
  });
  const isRepeating = showRepeatOptions && values.repeatType && values.repeatType !== "none";
  const id = (name) => `${idPrefix}-${name}`;
  // 날짜/시작/종료가 전부 있어야 findTimeConflicts가 실제로 비교한다 - 불완전한 입력에는
  // 경고하지 않는다(요구사항). status도 함께 전달해 "취소"로 바꾸는 즉시 경고가 사라진다.
  const conflicts = findTimeConflicts(
    { date: values.date, startTime: values.startTime, endTime: values.endTime, status: values.status },
    existingEvents,
    { excludeId }
  );

  return (
    <>
      <div className={"field field--grow" + (errors.title ? " field--invalid" : "")}>
        <label htmlFor={id("title")}>제목</label>
        <input
          id={id("title")}
          ref={registerField("title")}
          aria-invalid={!!errors.title}
          aria-describedby={errors.title ? id("title-error") : undefined}
          value={values.title}
          onChange={(e) => onChange({ ...values, title: e.target.value })}
        />
        <FieldError id={id("title-error")} message={errors.title} />
      </div>
      <div className={"field" + (errors.date ? " field--invalid" : "")}>
        <label htmlFor={id("date")}>날짜</label>
        <input
          id={id("date")}
          ref={registerField("date")}
          type="date"
          aria-invalid={!!errors.date}
          aria-describedby={errors.date ? id("date-error") : undefined}
          value={values.date}
          onChange={(e) => onChange({ ...values, date: e.target.value })}
        />
        <FieldError id={id("date-error")} message={errors.date} />
      </div>
      <div className="field">
        <label htmlFor={id("startTime")}>시작</label>
        <input
          id={id("startTime")}
          type="time"
          value={values.startTime}
          onChange={(e) => onChange({ ...values, startTime: e.target.value })}
        />
      </div>
      <div className={"field" + (errors.endTime ? " field--invalid" : "")}>
        <label htmlFor={id("endTime")}>종료</label>
        <input
          id={id("endTime")}
          ref={registerField("endTime")}
          type="time"
          aria-invalid={!!errors.endTime}
          aria-describedby={errors.endTime ? id("endTime-error") : undefined}
          value={values.endTime}
          onChange={(e) => onChange({ ...values, endTime: e.target.value })}
        />
        <FieldError id={id("endTime-error")} message={errors.endTime} />
      </div>
      <div className="field">
        <label htmlFor={id("type")}>구분</label>
        <select id={id("type")} value={values.type} onChange={(e) => onChange({ ...values, type: e.target.value })}>
          {EVENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      {isAttendanceBasedType && (
        <div className="field">
          <label htmlFor={id("attending")}>참석 여부</label>
          <select
            id={id("attending")}
            value={values.attending}
            onChange={(e) => onChange({ ...values, attending: e.target.value })}
          >
            {ATTENDING_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {values.type === "other" && (
        <div className={"field" + (errors.customType ? " field--invalid" : "")}>
          <label htmlFor={id("customType")}>직접 입력</label>
          <input
            id={id("customType")}
            ref={registerField("customType")}
            aria-invalid={!!errors.customType}
            aria-describedby={errors.customType ? id("customType-error") : undefined}
            value={values.customType}
            onChange={(e) => onChange({ ...values, customType: e.target.value })}
            placeholder="예: 웨딩 준비"
          />
          <FieldError id={id("customType-error")} message={errors.customType} />
        </div>
      )}
      <div className="field">
        <label>상태</label>
        <select value={values.status} onChange={(e) => onChange({ ...values, status: e.target.value })}>
          <option value="예정">예정</option>
          <option value="완료">완료</option>
          <option value="취소">취소</option>
        </select>
      </div>
      <div className="field field--grow">
        <label>메모</label>
        <input value={values.memo} onChange={(e) => onChange({ ...values, memo: e.target.value })} />
      </div>
      <div className={"field field--grow" + (errors.preparationNote ? " field--invalid" : "")}>
        <label htmlFor={id("preparationNote")}>준비사항 (선택)</label>
        <input
          id={id("preparationNote")}
          aria-invalid={!!errors.preparationNote}
          aria-describedby={errors.preparationNote ? id("preparationNote-error") : undefined}
          value={values.preparationNote ?? ""}
          onChange={(e) => onChange({ ...values, preparationNote: e.target.value })}
          maxLength={MAX_PREPARATION_NOTE_LENGTH}
          placeholder="예: 지난달 실적 자료와 발표 파일 확인"
        />
        <FieldError id={id("preparationNote-error")} message={errors.preparationNote} />
      </div>

      {showRepeatOptions && (
        <>
          <div className="field">
            <label htmlFor={id("repeatType")}>반복</label>
            <select
              id={id("repeatType")}
              value={values.repeatType ?? "none"}
              onChange={(e) => onChange({ ...values, repeatType: e.target.value })}
            >
              <option value="none">없음</option>
              <option value="weekly">매주</option>
              <option value="monthly">매월</option>
            </select>
          </div>
          {isRepeating && (
            <div className={"field" + (errors.repeatEndDate ? " field--invalid" : "")}>
              <label htmlFor={id("repeatEndDate")}>반복 종료일</label>
              <input
                id={id("repeatEndDate")}
                ref={registerField("repeatEndDate")}
                type="date"
                aria-invalid={!!errors.repeatEndDate}
                aria-describedby={errors.repeatEndDate ? id("repeatEndDate-error") : undefined}
                value={values.repeatEndDate ?? ""}
                onChange={(e) => onChange({ ...values, repeatEndDate: e.target.value })}
              />
              <FieldError id={id("repeatEndDate-error")} message={errors.repeatEndDate} />
            </div>
          )}
          {isRepeating && (
            <p className="ep-form__helper">
              반복 항목은 각 날짜에 개별 생성되며, 생성 후에는 한 건씩 수정하거나 삭제할 수
              있습니다.
            </p>
          )}
        </>
      )}

      {calendarConfigured && eligibleNow && !isRepeating && (
        <div className="field field--checkbox">
          <input
            type="checkbox"
            checked={values.addToCalendar}
            onChange={(e) => onChange({ ...values, addToCalendar: e.target.checked })}
          />
          <label>Google Calendar에 추가</label>
          {values.addToCalendar && !connected && (
            <span className="list__meta">{connecting ? " 연결하는 중…" : " (저장 시 Google 연결 창이 뜹니다)"}</span>
          )}
        </div>
      )}
      {calendarConfigured && isAttendanceBasedType && !eligibleNow && !isRepeating && (
        <p className="ep-form__helper">참석으로 표시해야 Google Calendar에 추가할 수 있습니다.</p>
      )}
      {isRepeating && (
        <p className="ep-form__helper">
          반복 일정은 먼저 앱에 등록됩니다. 필요한 일정은 생성 후 개별적으로 Google Calendar에
          연결할 수 있습니다.
        </p>
      )}
      <ConflictWarning conflicts={conflicts} />
    </>
  );
}

export default function EventsPage() {
  const { user } = useAuth();
  const { configured: calendarConfigured, connected, connecting, connect, getValidAccessToken } =
    useGoogleCalendar();

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterType, setFilterType] = useState("all");

  // "다가오는 일정" | "지난 일정". 오늘 날짜(Asia/Seoul, todayDateString)를 기준으로
  // date >= today는 다가오는 일정, date < today는 지난 일정으로 나눈다.
  const [scopeTab, setScopeTab] = useState("upcoming");
  // 월별 accordion 펼침 상태 - 다가오는/지난 일정이 서로 다른 월 집합을 펼쳐 둘 수 있어야
  // 하므로 각자 별도 Set으로 관리한다. 순수 로컬 UI state이고 저장하지 않는다.
  const [expandedUpcomingMonths, setExpandedUpcomingMonths] = useState(() => new Set());
  const [expandedPastMonths, setExpandedPastMonths] = useState(() => new Set());

  // 신규 등록 전용 state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [createCalendarWarning, setCreateCalendarWarning] = useState(null);
  // Firestore 저장 실패 안내(폼은 그대로 열려 있고 입력값도 유지된다). 값 형태: { text } | null.
  // Calendar 동기화 실패(저장은 성공)를 알리는 createResultMessage와는 별개다.
  const [createSaveError, setCreateSaveError] = useState(null);
  // 폼이 닫힌 뒤에도 사용자가 확인해야 하는 결과 메시지 - 반복 등록 성공 안내("N건
  // 등록했어요")뿐 아니라, 단건 등록/수정 자체는 성공했지만 Google Calendar 동기화만
  // 실패한 경우의 경고도 여기로 전달한다. createCalendarWarning/editCalendarWarning은
  // 각 폼 자신의 state라 closeCreateForm()/cancelEdit()이 폼을 닫으며 함께 지워지므로
  // (정상 동작), Firestore 저장은 성공하고 Calendar 동기화만 실패했을 때는 saveEvent()가
  // 폼을 닫기 직전에 이 state로 옮겨 담아 폼이 닫힌 뒤에도 남아있게 한다.
  // 값 형태: { text: string, tone: "success" | "warning" } | null
  const [createResultMessage, setCreateResultMessage] = useState(null);
  const createErrors = useFieldErrors();
  const onCreateChange = createErrors.withErrorClearing(setCreateForm);

  // 인라인 수정 전용 state - 항목이 원래 있던 자리에서 그대로 수정한다.
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editSaving, setEditSaving] = useState(false);
  const [editCalendarWarning, setEditCalendarWarning] = useState(null);
  const [editSaveError, setEditSaveError] = useState(null);
  // 준비 완료 체크를 저장하는 중인 일정 id - 저장이 끝나기 전 중복 클릭을 막는다.
  const [prepUpdatingId, setPrepUpdatingId] = useState(null);
  const editErrors = useFieldErrors();
  const onEditChange = editErrors.withErrorClearing(setEditForm);

  async function load() {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const list = await listActiveDocsByOwner("events", user.uid);
      setEvents(
        // 과거(교사용) 유형 값(academic/school/council/committee)이 남아 있는 문서도
        // 여기서 한 번만 새 유형 값으로 정규화해 둔다 - 이후 이 상태를 그대로 쓰는
        // 필터 비교/배지 클래스/수정 폼 채우기/참석 대상 판정이 전부 자동으로 올바르게
        // 동작한다(요구사항: 표시·수정 시 호환 처리, Firestore 문서 자체는 건드리지
        // 않음 - setEvents는 로컬 state일 뿐이다).
        list
          .map((e) => ({ ...e, type: normalizeEventType(e.type) }))
          .sort((a, b) => {
            const da = `${a.date ?? ""}${a.startTime ?? ""}`;
            const db_ = `${b.date ?? ""}${b.startTime ?? ""}`;
            return da.localeCompare(db_);
          })
      );
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function openCreateForm() {
    setEditingId(null); // 한 번에 하나의 form만 - 수정 중이던 항목이 있으면 닫는다.
    setShowCreateForm(true);
    // createResultMessage는 여기서 지우지 않는다 - 폼을 다시 여는 것만으로 아직 확인하지
    // 않은 이전 결과(특히 Calendar 동기화 실패 경고)가 사라지면 안 된다. 새로운 저장을
    // 시작할 때(saveEvent/createRecurringEvents)와 사용자가 직접 닫을 때만 초기화한다.
  }

  function closeCreateForm() {
    setShowCreateForm(false);
    setCreateForm(emptyForm);
    setCreateCalendarWarning(null);
    setCreateSaveError(null);
    createErrors.clearAll();
  }

  function startEdit(ev) {
    setShowCreateForm(false); // 한 번에 하나의 form만 - 신규 등록 form이 열려 있으면 닫는다.
    setEditingId(ev.id);
    setEditCalendarWarning(null);
    setEditSaveError(null);
    editErrors.clearAll();
    setEditForm({
      title: ev.title ?? "",
      date: ev.date ?? "",
      startTime: ev.startTime ?? "",
      endTime: ev.endTime ?? "",
      // ev.type은 load()에서 이미 normalizeEventType()을 거쳤지만, 여기서 한 번 더
      // 거쳐도 결과는 같다 - 수정 폼의 <select>가 항상 EVENT_TYPES 중 하나로 채워지는
      // 것(빈 값으로 남지 않는 것)을 이 지점만 보고도 알 수 있게 명시적으로 남겨둔다.
      type: normalizeEventType(ev.type),
      customType: ev.customType ?? "",
      status: ev.status ?? "예정",
      memo: ev.memo ?? "",
      attending: attendingToSelectValue(ev.attending),
      addToCalendar: !!ev.calendarSync,
      preparationNote: ev.preparationNote ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(emptyForm);
    setEditCalendarWarning(null);
    setEditSaveError(null);
    editErrors.clearAll();
  }

  // "다가오는 일정"에서 수정 중이던 카드가 "지난 일정" 탭으로 넘어가면 화면에서 사라지는데도
  // editingId/editForm은 그대로 남아 있어, 탭을 오가면 예전 수정 폼이 다시 나타났다 - 기존
  // cancelEdit()을 그대로 재사용해 탭을 바꿀 때 정리한다. 새로 작성 중인 등록 폼
  // (showCreateForm/createForm)은 건드리지 않는다.
  function handleSetScopeTab(tab) {
    cancelEdit();
    setScopeTab(tab);
  }

  // 신규 등록/기존 수정이 공유하는 저장 로직. existingEvent가 있으면 그 document를
  // update하고(Firestore ID 유지, 새 document 생성 안 함), 없으면 새로 생성한다.
  // Google Calendar 연동(생성/PATCH) 로직은 기존 그대로다.
  async function saveEvent(formState, existingEvent, { setSaving, setWarning, setSaveError, onDone }) {
    if (!formState.title || !formState.date) return;
    setSaving(true);
    setWarning(null);
    setSaveError(null);
    // 새로운 저장을 시작하면 이전에 남아 있던 결과 메시지(예: 지난 Calendar 동기화 실패
    // 경고)는 이번 저장과 무관해지므로 지운다.
    setCreateResultMessage(null);
    const now = new Date().toISOString();
    const isAttendanceBasedType = ATTENDANCE_BASED_EVENT_TYPES.includes(formState.type);
    const attending = isAttendanceBasedType ? parseAttendingValue(formState.attending) : null;
    const eligibleNow = isCalendarEligible({ type: formState.type, attending });

    const basePayload = {
      title: formState.title,
      date: formState.date,
      startTime: formState.startTime || "",
      endTime: formState.endTime || "",
      type: formState.type,
      customType: formState.type === "other" ? formState.customType || "" : "",
      status: formState.status,
      memo: formState.memo || "",
      attending,
      // 수정 시 준비사항을 비우면 그대로 빈 문자열로 저장된다(요구사항: 준비사항이
      // 비어 있으면 카드에서 준비 완료 UI 자체를 표시하지 않으므로, preparationCompleted
      // 값은 여기서 건드리지 않아도 된다 - 다시 채우면 예전 완료 여부가 그대로 이어진다).
      preparationNote: (formState.preparationNote || "").trim(),
      updatedAt: now,
    };

    let calendarSync = existingEvent?.calendarSync ?? false;
    let googleCalendarId = existingEvent?.googleCalendarId ?? null;
    // Google Calendar 동기화가 실패한 원인 - Firestore 저장은 그대로 진행하고, 저장까지
    // 성공하면 이 값으로 폼이 닫힌 뒤에도 남는 경고를 보여줄지, 어떤 문구를 보여줄지
    // 판단한다. null이면 동기화를 시도하지 않았거나 성공한 것이다.
    let calendarSyncFailureReason = null; // "missingEndTime" | "noToken" | "syncFailed" | null
    // Calendar 생성/수정 요청 자체는 성공했는지 - 이후 Firestore 저장이 실패했을 때 "Calendar에는
    // 반영됐지만 앱에는 저장되지 못한" 부분 성공 상태를 정확히 안내하기 위한 표시다.
    let calendarWriteSucceeded = false;

    try {
      if (formState.addToCalendar && eligibleNow) {
        let token = await getValidAccessToken();
        if (!token) {
          await connect();
          token = await getValidAccessToken();
        }

        if (token) {
          try {
            if (googleCalendarId) {
              await updateCalendarEvent(token, googleCalendarId, basePayload);
            } else {
              googleCalendarId = await createCalendarEvent(token, basePayload);
            }
            calendarSync = true;
            calendarWriteSucceeded = true;
          } catch (err) {
            calendarSync = false;
            if (err instanceof MissingEndTimeError) {
              setWarning(err.message);
              calendarSyncFailureReason = "missingEndTime";
            } else {
              console.error("[Calendar] sync failed:", err?.status ?? safeErrorInfo(err));
              setWarning("일정은 저장되었지만 Google Calendar 동기화에 실패했습니다.");
              calendarSyncFailureReason = "syncFailed";
            }
          }
        } else {
          setWarning("Google Calendar 연결이 필요합니다. 연결 후 다시 저장해 주세요.");
          calendarSyncFailureReason = "noToken";
        }
      }

      if (existingEvent) {
        await updateDocById("events", existingEvent.id, { ...basePayload, calendarSync, googleCalendarId });
      } else {
        await createDoc("events", user.uid, {
          ...basePayload,
          preparationCompleted: false,
          source: "manual",
          calendarSync,
          googleCalendarId,
          createdAt: now,
        });
      }

      // Firestore 저장은 성공했지만 Calendar 동기화만 실패한 경우 - onDone()이 폼을 닫으며
      // createCalendarWarning/editCalendarWarning도 함께 지우므로, 폼이 닫힌 뒤에도 보이도록
      // 폼과 무관하게 유지되는 결과 메시지로 옮겨 담는다. 원인(종료시간 누락 / 연결·token
      // 실패 / 그 외 API 오류)별로 안내 문구를 구분한다.
      if (calendarSyncFailureReason) {
        const calendarWarningTextByReason = {
          missingEndTime: existingEvent
            ? "일정은 앱에서 수정되었지만 종료시간이 없어 Google Calendar에 반영하지 못했습니다. 종료시간을 입력한 뒤 다시 동기화해 주세요."
            : "일정은 앱에 저장되었지만 종료시간이 없어 Google Calendar에 반영하지 못했습니다. 종료시간을 입력한 뒤 다시 동기화해 주세요.",
          noToken: existingEvent
            ? "일정은 앱에서 수정되었지만 Google Calendar 연결을 확인하지 못해 동기화하지 못했습니다. 설정에서 연결 상태를 확인해 주세요."
            : "일정은 앱에 저장되었지만 Google Calendar 연결을 확인하지 못해 동기화하지 못했습니다. 설정에서 연결 상태를 확인해 주세요.",
          syncFailed: existingEvent
            ? "일정은 앱에서 수정되었지만 Google Calendar 동기화에 실패했습니다. Calendar 연결 상태를 확인해 주세요."
            : "일정은 앱에 저장되었지만 Google Calendar 동기화에 실패했습니다. Calendar 연결 상태를 확인해 주세요.",
        };
        setCreateResultMessage({
          text: calendarWarningTextByReason[calendarSyncFailureReason],
          tone: "warning",
        });
      }

      onDone();
      load();
    } catch (err) {
      console.error("[Events] save failed:", safeErrorInfo(err));
      // Firestore 저장이 성공하지 못했으므로, 위에서 잠깐 표시했을 수 있는 "일정은 저장되었지만
      // ..." 류의 Calendar 경고는 사실과 다르다 - 지우고 저장 실패 안내로 바꾼다. 폼은
      // 닫지 않고 입력값도 그대로 둔다. Calendar 쪽은 자동으로 되돌리거나 다시 호출하지 않는다.
      setWarning(null);
      let text;
      if (calendarWriteSucceeded) {
        text = existingEvent
          ? "Google Calendar에는 변경 내용이 반영되었지만 앱의 일정 변경 내용을 저장하지 못했습니다. Calendar와 앱의 내용이 다를 수 있으니 확인해 주세요."
          : "Google Calendar에는 일정이 반영되었지만 앱에 저장하지 못했습니다. 중복 등록을 피하려면 Calendar 일정을 확인한 뒤 다시 시도해 주세요.";
      } else {
        text = existingEvent
          ? "일정 변경 내용을 저장하지 못했습니다. 입력한 내용을 유지했으니 다시 시도해 주세요."
          : "일정을 저장하지 못했습니다. 입력한 내용을 유지했으니 잠시 후 다시 시도해 주세요.";
      }
      setSaveError({ text });
    } finally {
      setSaving(false);
    }
  }

  // 반복 일정 생성 - 단건 저장(saveEvent)과 별개의 경로다. 날짜 계산은
  // utils/recurrence.js(generateRecurrenceDates)를, 저장은 firebase/crud.js
  // (createDocsBatch)를 AI 비서(execAddEvent)와 똑같이 재사용한다 - 계산이나 batch 저장
  // 로직을 이 페이지에 따로 만들지 않는다. Google Calendar에는 자동으로 동기화하지
  // 않는다(요구사항) - addToCalendar 값 자체를 아예 쓰지 않는다.
  async function createRecurringEvents() {
    const result = generateRecurrenceDates({
      startDate: createForm.date,
      repeatType: createForm.repeatType,
      repeatEndDate: createForm.repeatEndDate,
    });
    if (!result.ok) {
      createErrors.runValidation({ repeatEndDate: result.reason });
      return;
    }

    setCreating(true);
    setCreateCalendarWarning(null);
    setCreateSaveError(null);
    setCreateResultMessage(null);
    try {
      const now = new Date().toISOString();
      const isAttendanceBasedType = ATTENDANCE_BASED_EVENT_TYPES.includes(createForm.type);
      const attending = isAttendanceBasedType ? parseAttendingValue(createForm.attending) : null;
      const preparationNote = (createForm.preparationNote || "").trim();
      const seriesId = generateSeriesId();

      const docs = result.dates.map((date, index) => ({
        title: createForm.title,
        date,
        startTime: createForm.startTime || "",
        endTime: createForm.endTime || "",
        type: createForm.type,
        customType: createForm.type === "other" ? createForm.customType || "" : "",
        status: "예정",
        memo: createForm.memo || "",
        attending,
        preparationNote,
        preparationCompleted: false,
        source: "manual",
        calendarSync: false,
        googleCalendarId: null,
        seriesId,
        repeatType: createForm.repeatType,
        repeatEndDate: createForm.repeatEndDate,
        occurrenceIndex: index,
        isRecurringOccurrence: true,
        createdAt: now,
        updatedAt: now,
      }));

      await createDocsBatch("events", user.uid, docs);
      closeCreateForm();
      setCreateResultMessage({ text: `반복 일정 ${docs.length}건을 등록했습니다.`, tone: "success" });
      load();
    } catch (err) {
      console.error("[Recurring event] batch create failed:", safeErrorInfo(err));
      // batch는 원자적이라 일부 회차만 저장되지 않는다 - 성공 메시지/건수 없이 실패만 안내하고,
      // 폼과 입력값은 그대로 둔다.
      setCreateSaveError({
        text: "반복 일정을 등록하지 못했습니다. 입력한 내용을 유지했으니 잠시 후 다시 시도해 주세요.",
      });
    } finally {
      setCreating(false);
    }
  }

  function submitCreate(e) {
    e.preventDefault();
    if (creating) return;
    if (!createErrors.runValidation(validateEventForm(createForm))) return;

    if (createForm.repeatType && createForm.repeatType !== "none") {
      createRecurringEvents();
      return;
    }

    saveEvent(createForm, null, {
      setSaving: setCreating,
      setWarning: setCreateCalendarWarning,
      setSaveError: setCreateSaveError,
      onDone: closeCreateForm,
    });
  }

  function submitEdit(e) {
    e.preventDefault();
    if (editSaving) return;
    if (!editErrors.runValidation(validateEventForm(editForm))) return;
    const existing = events.find((ev) => ev.id === editingId);
    saveEvent(editForm, existing, {
      setSaving: setEditSaving,
      setWarning: setEditCalendarWarning,
      setSaveError: setEditSaveError,
      onDone: cancelEdit,
    });
  }

  // 카드의 "준비 완료" 체크 - 해당 일정 문서의 준비 완료 필드만 수정한다. 일정 자체의
  // 완료/취소(status)나 Google Calendar에는 영향을 주지 않는다(요구사항).
  // 저장이 실패하면 events state를 건드리지 않으므로(낙관적 갱신 없음) 체크 상태는 실제
  // Firestore 값 그대로 남는다. 이전 준비사항 오류(source: "preparation")만 지우고, 아직
  // 확인하지 않은 Calendar 동기화 경고 등 다른 결과 메시지는 그대로 둔다.
  async function togglePreparation(ev) {
    if (prepUpdatingId) return;
    setPrepUpdatingId(ev.id);
    setCreateResultMessage((prev) => (prev?.source === "preparation" ? null : prev));
    try {
      await updateDocById("events", ev.id, { preparationCompleted: !ev.preparationCompleted });
      load();
    } catch (err) {
      console.error("[Events] preparation toggle failed:", safeErrorInfo(err));
      setCreateResultMessage({
        text: "준비사항 상태를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        tone: "warning",
        source: "preparation",
      });
    } finally {
      setPrepUpdatingId(null);
    }
  }

  // 일반 목록의 삭제 버튼 - 더 이상 Firestore에서 완전히 지우지 않고 휴지통으로
  // 이동(soft delete)만 한다. Calendar 연동 여부와 관계없이 Google Calendar API는 전혀
  // 호출하지 않는다(요구사항) - calendarSync/googleCalendarId를 그대로 보존해서, 휴지통
  // 에서 복원하면 연결 상태가 그대로 이어진다. Calendar에서까지 완전히 지우려면 설정의
  // 휴지통 화면에서 영구 삭제를 선택해야 한다(TrashPage.jsx).
  async function removeEvent(ev) {
    try {
      await softDeleteDocById("events", ev.id, "manual");
      if (editingId === ev.id) cancelEdit();
      setCreateResultMessage({ text: "일정을 휴지통으로 이동했습니다.", tone: "success" });
      load();
    } catch (err) {
      console.error("[Events] move to trash failed:", err);
      setCreateResultMessage({
        text: "일정을 휴지통으로 이동하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        tone: "warning",
      });
    }
  }

  const visible = filterType === "all" ? events : events.filter((e) => e.type === filterType);
  const today = todayDateString();
  // Asia/Seoul 기준 오늘 날짜(todayDateString)로만 비교한다 - 브라우저 UTC 때문에 날짜가
  // 하루씩 밀리는 문제를 피하려고 이 프로젝트 전역에서 이미 쓰는 helper를 그대로 쓴다.
  const upcomingVisible = visible.filter((e) => (e.date || "") >= today);
  // events는 load()에서 이미 날짜+시간 오름차순으로 정렬되어 있다 - 지난 일정은 그 배열을
  // 뒤집기만 하면 가장 최근 날짜가 먼저 오는 순서가 된다.
  const pastVisible = visible.filter((e) => (e.date || "") < today).reverse();

  function formatGroupDate(dateStr) {
    if (!dateStr) return "";
    const isThisYear = dateStr.slice(0, 4) === today.slice(0, 4);
    const display = formatDateDisplay(dateStr);
    const withWeekday = `${display}(${weekdayKoreanOf(dateStr)})`;
    return isThisYear ? withWeekday : `${dateStr.slice(0, 4)}년 ${withWeekday}`;
  }

  // 날짜 기준 grouping (다가오는 일정 카드 - 기존 UI 그대로) - Firestore 구조는 그대로 두고
  // 표시할 때만 묶는다.
  function groupByDate(items) {
    const dateGroups = [];
    for (const ev of items) {
      const last = dateGroups[dateGroups.length - 1];
      if (last && last.date === ev.date) {
        last.items.push(ev);
      } else {
        dateGroups.push({ date: ev.date, items: [ev] });
      }
    }
    return dateGroups;
  }

  function monthKeyOf(dateStr) {
    return (dateStr || "").slice(0, 7); // "YYYY-MM"
  }

  function monthLabelOf(dateStr) {
    const [y, m] = (dateStr || "").split("-");
    return y && m ? `${y}년 ${Number(m)}월` : "";
  }

  // 월별 grouping. Map의 삽입 순서 = 입력 배열의 순서이므로, 다가오는 일정(오름차순 입력)은
  // 가장 가까운 달이, 지난 일정(내림차순 입력)은 가장 최근 달이 자연스럽게 먼저 온다 -
  // 별도로 다시 정렬하지 않는다.
  function groupByMonth(items) {
    const map = new Map();
    for (const ev of items) {
      const key = monthKeyOf(ev.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ev);
    }
    return [...map.entries()].map(([key, monthItems]) => ({
      key,
      label: monthLabelOf(monthItems[0].date),
      items: monthItems,
    }));
  }

  const upcomingMonthGroups = groupByMonth(upcomingVisible);
  const pastMonthGroups = groupByMonth(pastVisible);

  // 기본적으로 가장 가까운(다가오는) / 가장 최근(지난) 월만 펼쳐 둔다. 데이터가 로드된
  // 뒤 이 월 집합이 비어 있을 때만 기본값을 채우고, 그 이후 사용자가 직접 접고 펼치는
  // 조작은 다시 덮어쓰지 않는다.
  useEffect(() => {
    if (upcomingMonthGroups.length > 0 && expandedUpcomingMonths.size === 0) {
      setExpandedUpcomingMonths(new Set([upcomingMonthGroups[0].key]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcomingMonthGroups.map((g) => g.key).join(",")]);

  useEffect(() => {
    if (pastMonthGroups.length > 0 && expandedPastMonths.size === 0) {
      setExpandedPastMonths(new Set([pastMonthGroups[0].key]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pastMonthGroups.map((g) => g.key).join(",")]);

  function toggleUpcomingMonth(key) {
    setExpandedUpcomingMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function togglePastMonth(key) {
    setExpandedPastMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // 지난 일정 compact row용 짧은 날짜 표기("9.18") - 연도는 월 accordion 제목에 이미
  // 표시되므로 행 안에서는 반복하지 않는다.
  function shortDate(dateStr) {
    const [, m, d] = (dateStr || "").split("-");
    return m && d ? `${Number(m)}.${Number(d)}` : dateStr || "";
  }

  // 인라인 수정 form - "다가오는 일정"의 큰 카드에서도, "지난 일정"의 compact row에서도
  // 이 항목이 원래 있던 자리에서 똑같이 열린다(두 곳이 완전히 같은 form을 공유한다).
  function renderEditForm(ev) {
    return (
      <form className="form ep-form ep-form--inline" key={ev.id} onSubmit={submitEdit} noValidate>
        <EventFormFields
          values={editForm}
          onChange={onEditChange}
          calendarConfigured={calendarConfigured}
          connected={connected}
          connecting={connecting}
          errors={editErrors.errors}
          registerField={editErrors.registerField}
          idPrefix="event-edit"
          existingEvents={events}
          excludeId={ev.id}
        />
        {editCalendarWarning && <p className="status status--error">{editCalendarWarning}</p>}
        <SaveErrorMessage message={editSaveError} onClose={() => setEditSaveError(null)} />
        <div className="form__actions">
          <button type="submit" className="btn" disabled={editSaving}>
            {editSaving ? "저장 중…" : "저장"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={cancelEdit}>
            취소
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="page events-page">
      <header className="page__head">
        <h1 className="page__title">일정</h1>
        <p className="page__desc">업무와 개인 일정을 한곳에서 관리해요.</p>
      </header>

      <div className="tt-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={scopeTab === "upcoming"}
          className={"tt-tabs__btn" + (scopeTab === "upcoming" ? " tt-tabs__btn--active" : "")}
          onClick={() => handleSetScopeTab("upcoming")}
        >
          다가오는 일정
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={scopeTab === "past"}
          className={"tt-tabs__btn" + (scopeTab === "past" ? " tt-tabs__btn--active" : "")}
          onClick={() => handleSetScopeTab("past")}
        >
          지난 일정
        </button>
      </div>

      <div className="ep-toolbar">
        <div className="field">
          <label>구분 필터</label>
          <select
            value={filterType}
            onChange={(e) => {
              // 구분 필터를 바꿔 수정 중이던 일정이 목록에서 사라지면, 다시 그 구분으로
              // 돌아왔을 때 예전 수정 폼이 남아 있지 않도록 정리한다(탭 전환과 같은 원칙).
              cancelEdit();
              setFilterType(e.target.value);
            }}
          >
            <option value="all">전체</option>
            {EVENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        {!showCreateForm && (
          <button type="button" className="btn" onClick={openCreateForm}>
            + 일정 추가
          </button>
        )}
      </div>

      {loading && <p className="status">불러오는 중…</p>}
      {error && <p className="status status--error">일정을 불러오지 못했습니다.</p>}

      {!loading && !error && (
        <>
          {showCreateForm && (
            <form className="form ep-form" onSubmit={submitCreate} noValidate>
              <EventFormFields
                values={createForm}
                onChange={onCreateChange}
                calendarConfigured={calendarConfigured}
                connected={connected}
                connecting={connecting}
                errors={createErrors.errors}
                registerField={createErrors.registerField}
                idPrefix="event-create"
                existingEvents={events}
                showRepeatOptions
              />
              {!calendarConfigured && (
                <p className="ep-form__helper">
                  Google Calendar 연동은 설정에서 연결 정보를 등록한 뒤 사용할 수 있습니다.
                </p>
              )}
              <SaveErrorMessage message={createSaveError} onClose={() => setCreateSaveError(null)} />
              <div className="form__actions">
                <button type="submit" className="btn" disabled={creating}>
                  {creating ? "저장 중…" : "추가"}
                </button>
                <button type="button" className="btn btn--ghost" onClick={closeCreateForm}>
                  취소
                </button>
              </div>
            </form>
          )}
          {createCalendarWarning && <p className="status status--error">{createCalendarWarning}</p>}
          {createResultMessage && (
            <div
              className="ep-result-message"
              role={createResultMessage.tone === "warning" ? "alert" : "status"}
              aria-live={createResultMessage.tone === "warning" ? "assertive" : "polite"}
            >
              <p className={"status" + (createResultMessage.tone === "warning" ? " status--error" : "")}>
                {createResultMessage.text}
              </p>
              <button
                type="button"
                className="btn-text"
                aria-label="결과 메시지 닫기"
                onClick={() => setCreateResultMessage(null)}
              >
                닫기
              </button>
            </div>
          )}

          {scopeTab === "upcoming" ? (
            <div className="pp-month-accordion ep-month-accordion">
              {upcomingMonthGroups.length === 0 && <p className="list--empty">다가오는 일정이 없습니다.</p>}
              {upcomingMonthGroups.map((mg) => {
                const monthExpanded = expandedUpcomingMonths.has(mg.key);
                return (
                  <div className="pp-month-accordion__item" key={mg.key}>
                    <button
                      type="button"
                      className="pp-month-accordion__summary"
                      onClick={() => toggleUpcomingMonth(mg.key)}
                      aria-expanded={monthExpanded}
                    >
                      <span>{mg.label}</span>
                      <span className="pp-month-accordion__count">{mg.items.length}개</span>
                      <span aria-hidden="true">{monthExpanded ? "∧" : "∨"}</span>
                    </button>
                    {monthExpanded && (
                      <div className="ep-groups">
                        {groupByDate(mg.items).map((group) => (
                          <section className="ep-group" key={group.date}>
                            <h2 className="ep-group__date">{formatGroupDate(group.date)}</h2>
                            <div className="ep-list">
                              {group.items.map((ev) =>
                                editingId === ev.id ? (
                                  renderEditForm(ev)
                                ) : (
                                  <div className="ep-row" key={ev.id}>
                                    <div className="ep-row__main">
                                      <span className={`badge badge--${ev.type}`}>{eventTypeDisplayLabel(ev)}</span>
                                      {ev.isRecurringOccurrence && (
                                        <span className="badge badge--recurring">반복</span>
                                      )}
                                      <div className="ep-row__text">
                                        <p className="ep-row__title">{ev.title}</p>
                                        <p className="ep-row__meta">
                                          {ev.startTime && `${ev.startTime}${ev.endTime ? ` – ${ev.endTime}` : ""}`}
                                          {ATTENDANCE_BASED_EVENT_TYPES.includes(ev.type) &&
                                            `${ev.startTime ? " · " : ""}${
                                              ev.attending === true
                                                ? "참석"
                                                : ev.attending === false
                                                ? "불참"
                                                : "참석 여부 미정"
                                            }`}
                                          {ev.memo ? ` · ${ev.memo}` : ""}
                                          {ev.status && ev.status !== "예정" ? ` · ${ev.status}` : ""}
                                        </p>
                                        {ev.calendarSync && (
                                          <span className="ep-row__calendar">📅 Calendar 연동됨</span>
                                        )}
                                        {ev.preparationNote && (
                                          <div className="ep-prep">
                                            <p className="ep-prep__note">
                                              <span aria-hidden="true">📝</span> {ev.preparationNote}
                                            </p>
                                            <label className="ep-prep__check">
                                              <input
                                                type="checkbox"
                                                checked={!!ev.preparationCompleted}
                                                disabled={prepUpdatingId === ev.id}
                                                onChange={() => togglePreparation(ev)}
                                              />
                                              준비 완료
                                            </label>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    <div className="list__actions">
                                      <button className="btn-text" onClick={() => startEdit(ev)}>
                                        수정
                                      </button>
                                      <button className="btn-text btn-text--danger" onClick={() => removeEvent(ev)}>
                                        삭제
                                      </button>
                                    </div>
                                  </div>
                                )
                              )}
                            </div>
                          </section>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="pp-month-accordion ep-month-accordion">
              {pastMonthGroups.length === 0 && <p className="list--empty">지난 일정이 없습니다.</p>}
              {pastMonthGroups.map((mg) => {
                const monthExpanded = expandedPastMonths.has(mg.key);
                return (
                  <div className="pp-month-accordion__item" key={mg.key}>
                    <button
                      type="button"
                      className="pp-month-accordion__summary"
                      onClick={() => togglePastMonth(mg.key)}
                      aria-expanded={monthExpanded}
                    >
                      <span>{mg.label}</span>
                      <span className="pp-month-accordion__count">{mg.items.length}개</span>
                      <span aria-hidden="true">{monthExpanded ? "∧" : "∨"}</span>
                    </button>
                    {monthExpanded && (
                      <div className="ep-history-list">
                        {mg.items.map((ev) =>
                          editingId === ev.id ? (
                            renderEditForm(ev)
                          ) : (
                            <div className="ep-history-row" key={ev.id}>
                              <span className="ep-history-row__date">{shortDate(ev.date)}</span>
                              <span className={`badge badge--${ev.type}`}>{eventTypeDisplayLabel(ev)}</span>
                              {ev.isRecurringOccurrence && <span className="badge badge--recurring">반복</span>}
                              {ev.status && ev.status !== "예정" && (
                                <span className="ep-history-row__status">{ev.status}</span>
                              )}
                              <span className="ep-history-row__title">{ev.title}</span>
                              <span className="ep-history-row__time">
                                {ev.startTime && `${ev.startTime}${ev.endTime ? ` – ${ev.endTime}` : ""}`}
                              </span>
                              <span className="ep-history-row__actions">
                                <button className="btn-text" onClick={() => startEdit(ev)}>
                                  수정
                                </button>
                                <button className="btn-text btn-text--danger" onClick={() => removeEvent(ev)}>
                                  삭제
                                </button>
                              </span>
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
