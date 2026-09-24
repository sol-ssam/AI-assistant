import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useGoogleCalendar } from "../contexts/GoogleCalendarContext";
import { listDocsByOwner } from "../firebase/crud";
import {
  getSettings,
  updateBriefingTime,
  updateWorkHoursSettings,
  updateCompletedTaskAutoTrashDays,
} from "../firebase/settingsService";
import { resetWorkData, resetAllUserData } from "../firebase/resetData";
import { deleteCalendarEvent } from "../calendar/calendarApi";
import { useFieldErrors, isBlank, isTimeBefore } from "../utils/formValidation";
import Modal from "../components/Modal";
import FieldError from "../components/FieldError";
import "./crud-shared.css";
import "./SettingsPage.css";

const CONFIRM_WORD = "초기화";

// weekdayNumberOf(utils/date.js)와 같은 체계: 인덱스 0(일)~6(토).
const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const FOCUS_MIN_OPTIONS = [30, 60, 90, 120];
// 완료 업무 자동 정리(5-3-3) - 0은 "사용 안 함"(기본값), 30/90은 완료 후 그만큼 지나면
// 휴지통으로 이동하는 기준일이다.
const AUTO_TRASH_OPTIONS = [
  { value: 0, label: "사용 안 함" },
  { value: 30, label: "완료 후 30일" },
  { value: 90, label: "완료 후 90일" },
];

function validateBriefingForm(briefingTime) {
  const errors = {};
  if (isBlank(briefingTime)) errors.briefingTime = "브리핑 시간을 입력해 주세요.";
  return errors;
}

function validateWorkHoursForm({ workDays, workStartTime, workEndTime }) {
  const errors = {};
  if (!Array.isArray(workDays) || workDays.length === 0) {
    errors.workDays = "근무 요일을 하나 이상 선택해 주세요.";
  }
  if (isBlank(workStartTime)) {
    errors.workStartTime = "근무 시작 시각을 입력해 주세요.";
  }
  if (isBlank(workEndTime)) {
    errors.workEndTime = "근무 종료 시각을 입력해 주세요.";
  } else if (!isBlank(workStartTime) && isTimeBefore(workStartTime, workEndTime)) {
    errors.workEndTime = "종료 시각은 시작 시각보다 늦어야 합니다.";
  }
  return errors;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { configured, connected, connecting, error, connect, disconnect, getValidAccessToken } =
    useGoogleCalendar();
  // 게스트 체험(Firebase Anonymous) 사용자는 Google 계정으로 로그인한 것이 아니므로 Google
  // Calendar를 연결할 OAuth 권한 자체가 없다. Google OAuth/Calendar API 코드는 전혀 건드리지
  // 않고, 이 화면에서 연결 UI만 숨기고 안내로 대체한다 - Google 로그인 사용자의 기존
  // 연결·해제 기능은 이 조건과 무관하게 그대로 동작한다.
  const isGuest = user?.isAnonymous === true;

  const [syncedEventCount, setSyncedEventCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    listDocsByOwner("events", user.uid)
      .then((events) => setSyncedEventCount(events.filter((e) => e.calendarSync && e.googleCalendarId).length))
      .catch(() => setSyncedEventCount(0));
  }, [user]);

  // 브리핑 시간
  const [briefingTime, setBriefingTime] = useState("08:20");
  const [briefingSaving, setBriefingSaving] = useState(false);
  const [briefingSaved, setBriefingSaved] = useState(false);
  const briefingErrors = useFieldErrors();

  // 근무시간 설정 - getSettings()가 DEFAULT_SETTINGS와 병합해 주므로, 새 필드가 없는
  // 기존 사용자/게스트도 항상 유효한 값(월~금 09:00~18:00, 60분)으로 시작한다.
  const [workDays, setWorkDays] = useState([1, 2, 3, 4, 5]);
  const [workStartTime, setWorkStartTime] = useState("09:00");
  const [workEndTime, setWorkEndTime] = useState("18:00");
  const [focusMinMinutes, setFocusMinMinutes] = useState(60);
  const [workHoursSaving, setWorkHoursSaving] = useState(false);
  const [workHoursSaved, setWorkHoursSaved] = useState(false);
  const workHoursErrors = useFieldErrors();

  // 완료 업무 자동 정리(5-3-3) - 게스트에게는 노출하지 않으므로(요구사항) isGuest와
  // 무관하게 항상 state는 두되, 렌더링에서만 조건부로 숨긴다(게스트도 getSettings 자체는
  // 정상 동작하므로 state 분리가 필요 없다).
  const [completedTaskAutoTrashDays, setCompletedTaskAutoTrashDays] = useState(0);
  const [autoTrashSaving, setAutoTrashSaving] = useState(false);
  const [autoTrashSaved, setAutoTrashSaved] = useState(false);

  // settings 문서를 한 번에 읽어 브리핑 시간과 근무시간 설정 값을 함께 채운다. 이 화면이
  // 읽지 않는 다른 필드(homeroomClass 등 이전 단계의 남은 값 포함)는 여기서 손대지 않는다.
  useEffect(() => {
    if (!user) return;
    getSettings(user.uid)
      .then((s) => {
        setBriefingTime(s.briefingTime || "08:20");
        setWorkDays(Array.isArray(s.workDays) && s.workDays.length > 0 ? s.workDays : [1, 2, 3, 4, 5]);
        setWorkStartTime(s.workStartTime || "09:00");
        setWorkEndTime(s.workEndTime || "18:00");
        setFocusMinMinutes(FOCUS_MIN_OPTIONS.includes(s.focusMinMinutes) ? s.focusMinMinutes : 60);
        setCompletedTaskAutoTrashDays(
          AUTO_TRASH_OPTIONS.some((o) => o.value === s.completedTaskAutoTrashDays)
            ? s.completedTaskAutoTrashDays
            : 0
        );
      })
      .catch(() => {});
  }, [user]);

  async function saveBriefingTime() {
    if (!user) return;
    if (!briefingErrors.runValidation(validateBriefingForm(briefingTime))) return;
    setBriefingSaving(true);
    setBriefingSaved(false);
    try {
      await updateBriefingTime(user.uid, briefingTime);
      setBriefingSaved(true);
    } finally {
      setBriefingSaving(false);
    }
  }

  function toggleWorkDay(day) {
    setWorkDays((prev) => {
      const next = prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b);
      return next;
    });
    setWorkHoursSaved(false);
    workHoursErrors.clearFieldError("workDays");
  }

  async function saveWorkHours() {
    if (!user) return;
    if (!workHoursErrors.runValidation(validateWorkHoursForm({ workDays, workStartTime, workEndTime }))) return;
    setWorkHoursSaving(true);
    setWorkHoursSaved(false);
    try {
      await updateWorkHoursSettings(user.uid, { workDays, workStartTime, workEndTime, focusMinMinutes });
      setWorkHoursSaved(true);
    } finally {
      setWorkHoursSaving(false);
    }
  }

  async function saveAutoTrash() {
    if (!user) return;
    setAutoTrashSaving(true);
    setAutoTrashSaved(false);
    try {
      await updateCompletedTaskAutoTrashDays(user.uid, completedTaskAutoTrashDays);
      setAutoTrashSaved(true);
    } finally {
      setAutoTrashSaving(false);
    }
  }

  // 고급 설정(전체 사용자 데이터 초기화)을 기본적으로 접어둬서 실수로 누르기 어렵게 한다.
  const [showAdvanced, setShowAdvanced] = useState(false);

  // resetMode: null | "work" | "all"
  const [resetMode, setResetMode] = useState(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleteCalendarToo, setDeleteCalendarToo] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  function openReset(mode) {
    setResetMode(mode);
    setConfirmText("");
    setDeleteCalendarToo(false);
    setResult(null);
  }

  function closeReset() {
    if (running) return;
    setResetMode(null);
  }

  async function runReset() {
    if (confirmText !== CONFIRM_WORD || !user) return;
    setRunning(true);
    setResult(null);
    try {
      // Google Calendar 삭제를 먼저 시도한다 - Firestore event를 먼저 지워버리면
      // googleCalendarId를 이용한 재시도가 어려워지기 때문에, 순서를
      // "Calendar 삭제 시도 → Firestore 삭제"로 둔다.
      let calendarFailures = 0;
      if (deleteCalendarToo) {
        const events = await listDocsByOwner("events", user.uid);
        const synced = events.filter((e) => e.calendarSync && e.googleCalendarId);
        const token = await getValidAccessToken();
        if (token) {
          for (const ev of synced) {
            try {
              // eslint-disable-next-line no-await-in-loop
              await deleteCalendarEvent(token, ev.googleCalendarId);
            } catch (e) {
              console.error("[Reset] calendar event delete failed:", e);
              calendarFailures += 1;
            }
          }
        } else if (synced.length > 0) {
          calendarFailures = synced.length;
        }
      }

      const { failedCollections } =
        resetMode === "all" ? await resetAllUserData(user.uid) : await resetWorkData(user.uid);

      setResult({ failedCollections, calendarFailures });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="page settings-page">
      <header className="page__head">
        <h1 className="page__title">설정</h1>
        <p className="page__desc">
          Google Calendar 연결, 아침 브리핑과 내 데이터를 관리해요.
        </p>
      </header>

      <div className="setting-card">
        <div className="setting-card__head">
          <h2 className="setting-card__title">
            <span aria-hidden="true">📅</span> Google Calendar
          </h2>
          {configured && !isGuest && (
            <span className={"setting-card__status" + (connected ? " setting-card__status--ok" : "")}>
              {connected ? "✓ 연결됨" : "연결 필요"}
            </span>
          )}
        </div>

        {isGuest ? (
          <p className="setting-card__desc">
            Google Calendar 연결은 Google 계정으로 시작한 경우에 사용할 수 있습니다.
          </p>
        ) : !configured ? (
          <p className="list--empty">Google Calendar 연동이 아직 설정되지 않았습니다.</p>
        ) : (
          <>
            <p className="setting-card__desc">선택한 일정을 Google Calendar와 연동할 수 있어요.</p>
            {!connected && (
              <p className="setting-card__helper">
                일정을 캘린더에 추가하려는 순간 자동으로 연결 창이 뜰 수도 있어요.
              </p>
            )}
            {error && (
              <p className="status status--error" role="alert">
                연결 오류: {error}
              </p>
            )}
            <div className="setting-card__actions">
              {connected ? (
                <button className="btn btn--ghost btn--small" onClick={disconnect}>
                  연결 해제
                </button>
              ) : (
                <button className="btn btn--small" onClick={connect} disabled={connecting}>
                  {connecting ? "연결하는 중…" : "연결하기"}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="setting-card">
        <h2 className="setting-card__title">
          <span aria-hidden="true">☀️</span> 아침 브리핑
        </h2>
        <p className="setting-card__desc">
          앱을 열었을 때 오늘의 브리핑을 보여주는 기준 시간을 설정해요.
        </p>
        <div className="setting-card__row">
          <div className={"setting-card__field" + (briefingErrors.errors.briefingTime ? " field--invalid" : "")}>
            <label htmlFor="settings-briefing-time">브리핑 기준 시간</label>
            <input
              id="settings-briefing-time"
              ref={briefingErrors.registerField("briefingTime")}
              type="time"
              aria-invalid={!!briefingErrors.errors.briefingTime}
              aria-describedby={briefingErrors.errors.briefingTime ? "settings-briefing-time-error" : undefined}
              value={briefingTime}
              onChange={(e) => {
                setBriefingTime(e.target.value);
                setBriefingSaved(false);
                briefingErrors.clearFieldError("briefingTime");
              }}
            />
            <FieldError id="settings-briefing-time-error" message={briefingErrors.errors.briefingTime} />
          </div>
          <div className="setting-card__actions">
            <button className="btn btn--small" onClick={saveBriefingTime} disabled={briefingSaving}>
              {briefingSaving ? "저장 중…" : "저장"}
            </button>
            {briefingSaved && <span className="setting-card__saved">저장했습니다.</span>}
          </div>
        </div>
      </div>

      <div className="setting-card">
        <h2 className="setting-card__title">
          <span aria-hidden="true">🧭</span> 근무시간 설정
        </h2>
        <p className="setting-card__desc">
          설정한 근무시간 안에서 일정이 없는 구간을 집중 가능 시간으로 계산합니다.
        </p>

        <div className="work-hours-field">
          <span className="work-hours-field__label">근무 요일</span>
          <div
            className="work-hours-days"
            role="group"
            aria-label="근무 요일"
            aria-describedby={workHoursErrors.errors.workDays ? "settings-work-days-error" : undefined}
          >
            {WEEKDAY_LABELS.map((label, day) => {
              const active = workDays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  className={"work-hours-day" + (active ? " work-hours-day--active" : "")}
                  aria-pressed={active}
                  onClick={() => toggleWorkDay(day)}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <FieldError id="settings-work-days-error" message={workHoursErrors.errors.workDays} />
        </div>

        <div className="setting-card__row">
          <div className={"setting-card__field" + (workHoursErrors.errors.workStartTime ? " field--invalid" : "")}>
            <label htmlFor="settings-work-start">근무 시작</label>
            <input
              id="settings-work-start"
              ref={workHoursErrors.registerField("workStartTime")}
              type="time"
              aria-invalid={!!workHoursErrors.errors.workStartTime}
              aria-describedby={workHoursErrors.errors.workStartTime ? "settings-work-start-error" : undefined}
              value={workStartTime}
              onChange={(e) => {
                setWorkStartTime(e.target.value);
                setWorkHoursSaved(false);
                workHoursErrors.clearFieldError("workStartTime");
                workHoursErrors.clearFieldError("workEndTime");
              }}
            />
            <FieldError id="settings-work-start-error" message={workHoursErrors.errors.workStartTime} />
          </div>
          <div className={"setting-card__field" + (workHoursErrors.errors.workEndTime ? " field--invalid" : "")}>
            <label htmlFor="settings-work-end">근무 종료</label>
            <input
              id="settings-work-end"
              ref={workHoursErrors.registerField("workEndTime")}
              type="time"
              aria-invalid={!!workHoursErrors.errors.workEndTime}
              aria-describedby={workHoursErrors.errors.workEndTime ? "settings-work-end-error" : undefined}
              value={workEndTime}
              onChange={(e) => {
                setWorkEndTime(e.target.value);
                setWorkHoursSaved(false);
                workHoursErrors.clearFieldError("workEndTime");
              }}
            />
            <FieldError id="settings-work-end-error" message={workHoursErrors.errors.workEndTime} />
          </div>
        </div>

        <div className="work-hours-field">
          <span className="work-hours-field__label">집중 시간 기준</span>
          <div className="work-hours-days" role="group" aria-label="집중 시간으로 인정할 최소 시간">
            {FOCUS_MIN_OPTIONS.map((min) => (
              <button
                key={min}
                type="button"
                className={"work-hours-day" + (focusMinMinutes === min ? " work-hours-day--active" : "")}
                aria-pressed={focusMinMinutes === min}
                onClick={() => {
                  setFocusMinMinutes(min);
                  setWorkHoursSaved(false);
                }}
              >
                {min}분
              </button>
            ))}
          </div>
        </div>

        <div className="setting-card__actions">
          <button className="btn btn--small" onClick={saveWorkHours} disabled={workHoursSaving}>
            {workHoursSaving ? "저장 중…" : "저장"}
          </button>
          {workHoursSaved && <span className="setting-card__saved">저장했습니다.</span>}
        </div>
      </div>

      {/* 완료 업무 자동 정리(5-3-3) - 일반 Google 사용자에게만 노출한다(요구사항: 게스트에게는
          이 설정 자체를 보여주지 않는다). 게스트는 기존 휴지통 진입·복원·영구 삭제만 그대로
          사용할 수 있다. */}
      {!isGuest && (
        <div className="setting-card">
          <h2 className="setting-card__title">
            <span aria-hidden="true">🗑️</span> 완료 업무 자동 정리
          </h2>
          <p className="setting-card__desc">
            완료한 지 오래된 업무를 자동으로 휴지통으로 옮겨요. 휴지통에서 언제든 다시 복원할
            수 있어요.
          </p>
          <div className="work-hours-field">
            <div className="work-hours-days" role="group" aria-label="완료 업무 자동 정리 기간">
              {AUTO_TRASH_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={
                    "work-hours-day" + (completedTaskAutoTrashDays === opt.value ? " work-hours-day--active" : "")
                  }
                  aria-pressed={completedTaskAutoTrashDays === opt.value}
                  onClick={() => {
                    setCompletedTaskAutoTrashDays(opt.value);
                    setAutoTrashSaved(false);
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="setting-card__actions">
            <button className="btn btn--small" onClick={saveAutoTrash} disabled={autoTrashSaving}>
              {autoTrashSaving ? "저장 중…" : "저장"}
            </button>
            {autoTrashSaved && <span className="setting-card__saved">저장했습니다.</span>}
          </div>
        </div>
      )}

      {/* 휴지통 - 실수로 삭제한 항목을 확인·복원하는 일반 기능이라 고급 설정 밖(항상 보이는
          카드)에 둔다. 게스트도 이 카드를 볼 수 있다(요구사항: 게스트도 기존 휴지통 진입과
          수동 복원·영구 삭제를 그대로 제공). 사이드바에는 추가하지 않는다. */}
      <div className="setting-card">
        <h2 className="setting-card__title">
          <span aria-hidden="true">🗑️</span> 휴지통
        </h2>
        <p className="setting-card__desc">삭제한 일정과 업무를 확인하거나 복원할 수 있습니다.</p>
        <div className="setting-card__actions">
          <Link to="/trash" className="btn btn--ghost btn--small">
            휴지통 보기
          </Link>
        </div>
      </div>

      {/* 고급 설정 - 기존 showAdvanced state를 그대로 재사용한다(새 state를 만들지 않음).
          기본적으로 접혀 있고, 펼치면 그 안에 데이터 초기화(업무/전체) 둘 다 들어간다 -
          예전에는 "업무 데이터 초기화"만 항상 노출되고 "전체"만 고급 설정 뒤에 있었지만,
          이번에 데이터 초기화 전체를 고급 설정 안으로 옮겼다. */}
      <button
        type="button"
        className="setting-advanced-toggle"
        onClick={() => setShowAdvanced((v) => !v)}
        aria-expanded={showAdvanced}
      >
        고급 설정 {showAdvanced ? "⌄" : "〉"}
      </button>

      {showAdvanced && (
        <div className="setting-card">
          <h2 className="setting-card__title">데이터 초기화</h2>
          <p className="setting-card__desc">
            현재 로그인한 계정({user?.isAnonymous ? "게스트 체험" : user?.email})의 데이터만 삭제돼요. 개인 설정은 유지되며 삭제한
            데이터는 복구할 수 없어요.
          </p>
          <div className="setting-card__actions">
            <button className="btn btn--danger-outline" onClick={() => openReset("work")}>
              업무 데이터 초기화
            </button>
          </div>

          <div className="setting-card__advanced-divider" />

          <p className="setting-card__helper">
            설정(브리핑 시간 포함)까지 함께 삭제해요. Firebase Authentication 계정 자체는
            삭제되지 않아요.
          </p>
          <div className="setting-card__actions">
            <button className="btn btn--danger-outline" onClick={() => openReset("all")}>
              전체 사용자 데이터 초기화
            </button>
          </div>
        </div>
      )}

      {/* 서비스 정보 - 6단계: 큰 setting-card(흰 배경+그림자+아이콘)가 아니라, 페이지
          맨 아래의 작은 푸터로 표시한다(요구사항: 시각적 비중을 낮춤). 고급 설정 다음,
          설정 화면의 마지막 요소다. /terms, /privacy 라우트와 링크 텍스트는 그대로다 -
          위치와 감싸는 마크업만 바뀌었다. */}
      <footer className="settings-page__footer">
        <span className="settings-page__footer-title">서비스 정보</span>
        <p className="settings-page__footer-links">
          <Link to="/terms">이용약관</Link>
          <span aria-hidden="true"> · </span>
          <Link to="/privacy">개인정보처리방침</Link>
        </p>
      </footer>

      <Modal
        open={!!resetMode}
        title={resetMode === "all" ? "전체 사용자 데이터 초기화" : "업무 데이터 초기화"}
        onClose={closeReset}
      >
        {result ? (
          <>
            <p style={{ marginTop: 0 }}>초기화를 완료했습니다.</p>
            {result.failedCollections.length > 0 && (
              <p className="status status--error">
                다음 항목은 삭제하지 못했습니다: {result.failedCollections.join(", ")}
              </p>
            )}
            {deleteCalendarToo && result.calendarFailures > 0 && (
              <p className="status status--error">
                Google Calendar 일정 {result.calendarFailures}건은 삭제하지 못했습니다.
              </p>
            )}
            <div className="form__actions">
              <button className="btn" onClick={() => setResetMode(null)}>
                닫기
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ marginTop: 0 }}>
              {resetMode === "all"
                ? "일정과 업무 등 이 앱에 저장된 데이터와 설정(브리핑 시간 포함)이 모두 삭제되며 되돌릴 수 없습니다."
                : "일정과 업무 등 이 앱에 저장된 데이터가 모두 삭제되며 되돌릴 수 없습니다. 브리핑 시간 등 개인 설정은 유지됩니다."}
            </p>

            {syncedEventCount > 0 && (
              <div className="field" style={{ marginBottom: 12 }}>
                <label>Google Calendar에 동기화된 일정이 {syncedEventCount}건 있습니다.</label>
                <div className="field--checkbox">
                  <input
                    type="radio"
                    id="reset-app-only"
                    checked={!deleteCalendarToo}
                    onChange={() => setDeleteCalendarToo(false)}
                  />
                  <label htmlFor="reset-app-only">앱 데이터만 초기화 (Google Calendar 일정은 유지)</label>
                </div>
                <div className="field--checkbox">
                  <input
                    type="radio"
                    id="reset-with-calendar"
                    checked={deleteCalendarToo}
                    onChange={() => setDeleteCalendarToo(true)}
                  />
                  <label htmlFor="reset-with-calendar">
                    앱 데이터 + 이 앱이 생성한 Google Calendar 일정도 삭제
                  </label>
                </div>
              </div>
            )}

            <div className="field" style={{ marginBottom: 12 }}>
              <label>계속하려면 &lsquo;{CONFIRM_WORD}&rsquo;를 입력하세요</label>
              <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
            </div>

            <div className="form__actions">
              <button
                className="btn btn--danger"
                disabled={confirmText !== CONFIRM_WORD || running}
                onClick={runReset}
              >
                {running ? "삭제하는 중…" : "삭제"}
              </button>
              <button className="btn btn--ghost" onClick={closeReset} disabled={running}>
                취소
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
