import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useGoogleCalendar } from "../contexts/GoogleCalendarContext";
import { listTrashedDocsByOwner, restoreDocById, deleteDocById } from "../firebase/crud";
import { deleteCalendarEvent } from "../calendar/calendarApi";
import { formatDateDisplay, dateStringInSeoul, todayDateString } from "../utils/date";
import { daysUntilAutoPurge } from "../utils/trashPolicy";
import { eventTypeDisplayLabel, normalizeEventType } from "../utils/constants";
import Modal from "../components/Modal";
import "./crud-shared.css";
import "./TrashPage.css";

// 휴지통으로 이동한 시각(ISO 문자열, deletedAt)을 "9월 9일"처럼 사람이 읽기 쉬운 날짜로
// 보여준다. 시/분까지는 필요 없다고 판단해(요구사항: "휴지통으로 이동한 날짜") 이미
// 프로젝트 전역에서 쓰는 dateStringInSeoul + formatDateDisplay를 그대로 재사용한다 - 새
// 날짜 포맷 유틸을 utils/date.js에 추가하지 않는다.
function formatMovedDate(isoString) {
  const dateStr = dateStringInSeoul(isoString);
  return dateStr ? formatDateDisplay(dateStr) : "";
}

function deleteReasonLabel(deleteReason) {
  if (deleteReason === "ai") return "AI 삭제";
  if (deleteReason === "auto") return "자동 정리";
  return "수동 삭제";
}

// 5-3-3: 휴지통 30일 자동 영구 삭제 안내 - Calendar 연결 일정은 자동 삭제 대상에서
// 제외되므로 남은 일수 대신 "제외" 문구를 보여준다(요구사항: 잘못된 "N일 후 삭제" 문구를
// 붙이지 않는다). 그 외 항목은 daysUntilAutoPurge(0 이상, 음수 없음)로 계산한 남은 일수를
// 그대로 보여준다.
function autoPurgeStatusLabel(deletedAt, calendarExempt, today) {
  if (calendarExempt) return "자동 영구 삭제 제외";
  const daysLeft = daysUntilAutoPurge(deletedAt, today);
  if (daysLeft === null) return null;
  return daysLeft > 0 ? `${daysLeft}일 후 자동 삭제` : "오늘 자동 삭제 예정";
}

export default function TrashPage() {
  const { user } = useAuth();
  const { getValidAccessToken, connect } = useGoogleCalendar();
  // 게스트 체험(Firebase Anonymous) 사용자에게는 30일 자동 영구 삭제 관련 안내를 전혀
  // 보여주지 않는다(요구사항) - 게스트는 5-3-3의 자동 정리 대상이 아니므로(App.jsx의
  // runTrashSweepIfDue가 게스트를 건너뜀), 그런 안내를 보여주면 실제 동작과 어긋난다.
  // 복원·수동 영구 삭제 등 기존 기능은 게스트에게도 동일하게 그대로 제공한다.
  const isGuest = user?.isAnonymous === true;
  const today = todayDateString();

  const [events, setEvents] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("events"); // "events" | "tasks"

  // 복원/영구 삭제 결과 - 폼이 없는 화면이라 EventsPage/TasksPage의 결과 메시지와 달리
  // 저장 시작 시점에 초기화할 계기가 없으므로, 새 작업(복원·영구 삭제)을 시작할 때와
  // 사용자가 닫기 버튼을 눌렀을 때만 지운다.
  const [resultMessage, setResultMessage] = useState(null);
  // 지금 복원/영구 삭제 처리 중인 문서 id - 그 항목의 버튼만 비활성화한다.
  const [processingId, setProcessingId] = useState(null);

  // 영구 삭제 확인 Modal 대상 - { kind: "events" | "tasks", item } | null.
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState(null);
  const [modalError, setModalError] = useState(null);

  async function loadTrash() {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [trashedEvents, trashedTasks] = await Promise.all([
        listTrashedDocsByOwner("events", user.uid),
        listTrashedDocsByOwner("tasks", user.uid),
      ]);
      // 최근에 휴지통으로 이동한 항목이 먼저 보이게 정렬한다.
      setEvents(trashedEvents.sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? "")));
      setTasks(trashedTasks.sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? "")));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTrash();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // 복원 - deletedAt/deleteReason만 지운다(firebase/crud.js의 restoreDocById). status/
  // completed/completedAt/Calendar 연결 필드/반복 필드/준비사항/문서 id는 전혀 건드리지
  // 않으므로 여기서도 그 값들을 다시 손대지 않는다.
  async function restoreItem(kind, item) {
    setProcessingId(item.id);
    setResultMessage(null);
    try {
      await restoreDocById(kind, item.id);
      setResultMessage({
        text: kind === "events" ? "일정을 복원했습니다." : "업무를 복원했습니다.",
        tone: "success",
      });
      loadTrash();
    } catch (err) {
      console.error("[Trash] restore failed:", err);
      setResultMessage({ text: "복원하지 못했습니다. 잠시 후 다시 시도해 주세요.", tone: "warning" });
    } finally {
      setProcessingId(null);
    }
  }

  function openPermanentDelete(kind, item) {
    setPermanentDeleteTarget({ kind, item });
    setModalError(null);
  }

  function closePermanentDelete() {
    if (processingId) return; // 처리 중에는 실수로 닫히지 않게 한다(SettingsPage 초기화 Modal과 같은 원칙).
    setPermanentDeleteTarget(null);
    setModalError(null);
  }

  // 업무 영구 삭제 / Calendar에 연결되지 않은 일정 영구 삭제 - 둘 다 기존 deleteDocById를
  // 그대로 재사용하는 단순 삭제라 하나의 함수로 같이 처리한다.
  async function confirmPermanentDeleteAppOnly() {
    const { kind, item } = permanentDeleteTarget;
    setProcessingId(item.id);
    setModalError(null);
    try {
      await deleteDocById(kind, item.id);
      setPermanentDeleteTarget(null);
      setResultMessage({
        text: kind === "events" ? "일정을 영구 삭제했습니다." : "업무를 영구 삭제했습니다.",
        tone: "success",
      });
      loadTrash();
    } catch (err) {
      console.error("[Trash] permanent delete failed:", err);
      setModalError("영구 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setProcessingId(null);
    }
  }

  // Calendar에 연결된 일정을 "앱과 Google Calendar에서 삭제" - Calendar 삭제가 성공한
  // 뒤에만 Firestore 문서를 영구 삭제한다. token이 없거나 Calendar 삭제가 실패하면
  // Firestore 문서는 절대 지우지 않고 휴지통에 그대로 남겨, 사용자가 다시 시도할 수 있게
  // 한다(요구사항).
  async function confirmPermanentDeleteWithCalendar() {
    const { item } = permanentDeleteTarget;
    setProcessingId(item.id);
    setModalError(null);
    try {
      let token = await getValidAccessToken();
      if (!token) {
        await connect();
        token = await getValidAccessToken();
      }
      if (!token) {
        setModalError("Google Calendar 연결을 확인하지 못했습니다. 연결 후 다시 시도해 주세요.");
        return;
      }

      await deleteCalendarEvent(token, item.googleCalendarId);
      await deleteDocById("events", item.id);
      setPermanentDeleteTarget(null);
      setResultMessage({ text: "일정과 Google Calendar 일정을 모두 영구 삭제했습니다.", tone: "success" });
      loadTrash();
    } catch (err) {
      console.error("[Trash] calendar delete failed:", err);
      setModalError("Google Calendar 삭제에 실패해 휴지통에 그대로 남겨두었습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setProcessingId(null);
    }
  }

  function renderEventRow(ev) {
    // 자동 영구 삭제 제외 판정은 googleCalendarId 존재 여부만 본다(calendarSync가 false여도
    // googleCalendarId가 남아 있으면 절대 자동 삭제하지 않는다 - firebase/trashSweep.js의
    // isDocEligibleForAutoPurge와 반드시 같은 기준을 써야 화면 안내와 실제 동작이 어긋나지
    // 않는다). 배지 표시용 calendarLinked는 기존처럼 calendarSync까지 함께 확인한다.
    const calendarLinked = !!(ev.calendarSync && ev.googleCalendarId);
    const autoPurgeExempt = !!ev.googleCalendarId;
    const purgeStatus = isGuest ? null : autoPurgeStatusLabel(ev.deletedAt, autoPurgeExempt, today);
    return (
      <div className="list__row" key={ev.id}>
        <div className="list__main">
          <p className="list__title">
            {/* 6단계: 과거(교사용) 유형 값(academic/school/council/committee)이 남아
                있는 일정도 정규화된 구분으로 표시한다(요구사항: 휴지통에 있는 기존
                일정에도 같은 표시 규칙 적용) - eventTypeDisplayLabel/normalizeEventType이
                EventsPage.jsx와 완전히 같은 기준을 쓴다. */}
            <span className={`badge badge--${normalizeEventType(ev.type)}`}>{eventTypeDisplayLabel(ev)}</span>
            {ev.title || "(제목 없음)"}
            {ev.isRecurringOccurrence && <span className="badge badge--recurring">반복</span>}
            {calendarLinked && <span className="badge badge--calendar">Google Calendar 연결</span>}
          </p>
          <p className="list__meta">
            일정 · {ev.date ? formatDateDisplay(ev.date) : "날짜 없음"} · 휴지통 이동:{" "}
            {formatMovedDate(ev.deletedAt)} · {deleteReasonLabel(ev.deleteReason)}
            {purgeStatus ? ` · ${purgeStatus}` : ""}
          </p>
        </div>
        <div className="list__actions">
          <button
            type="button"
            className="btn-text"
            disabled={processingId === ev.id}
            onClick={() => restoreItem("events", ev)}
          >
            복원
          </button>
          <button
            type="button"
            className="btn-text btn-text--danger"
            disabled={processingId === ev.id}
            onClick={() => openPermanentDelete("events", ev)}
          >
            영구 삭제
          </button>
        </div>
      </div>
    );
  }

  function renderTaskRow(t) {
    // 업무에는 googleCalendarId가 존재하지 않으므로 항상 자동 영구 삭제 대상이다.
    const purgeStatus = isGuest ? null : autoPurgeStatusLabel(t.deletedAt, false, today);
    return (
      <div className="list__row" key={t.id}>
        <div className="list__main">
          <p className="list__title">
            {t.title || "(제목 없음)"}
            {t.isRecurringOccurrence && <span className="badge badge--recurring">반복</span>}
          </p>
          <p className="list__meta">
            업무 · {t.dueDate ? `${formatDateDisplay(t.dueDate)}까지` : "마감일 없음"} · 휴지통 이동:{" "}
            {formatMovedDate(t.deletedAt)} · {deleteReasonLabel(t.deleteReason)}
            {purgeStatus ? ` · ${purgeStatus}` : ""}
          </p>
        </div>
        <div className="list__actions">
          <button
            type="button"
            className="btn-text"
            disabled={processingId === t.id}
            onClick={() => restoreItem("tasks", t)}
          >
            복원
          </button>
          <button
            type="button"
            className="btn-text btn-text--danger"
            disabled={processingId === t.id}
            onClick={() => openPermanentDelete("tasks", t)}
          >
            영구 삭제
          </button>
        </div>
      </div>
    );
  }

  const target = permanentDeleteTarget?.item;
  const targetIsCalendarEvent =
    permanentDeleteTarget?.kind === "events" && !!(target?.calendarSync && target?.googleCalendarId);

  return (
    <div className="page trash-page">
      <header className="page__head">
        <h1 className="page__title">휴지통</h1>
        <p className="page__desc">
          {isGuest
            ? "삭제한 일정과 업무를 여기서 복원하거나 영구 삭제할 수 있어요."
            : "삭제한 일정과 업무는 휴지통에서 복원할 수 있으며, 이동 후 30일이 지나면 자동으로 영구 삭제됩니다."}
        </p>
        {!isGuest && (
          <p className="trash-page__policy-note">
            Google Calendar와 연결된 일정은 자동으로 영구 삭제되지 않습니다. 휴지통에서 직접
            삭제 방식을 선택해 주세요.
          </p>
        )}
      </header>

      <Link to="/settings" className="trash-page__back">
        ← 설정으로 돌아가기
      </Link>

      <div className="tt-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "events"}
          className={"tt-tabs__btn" + (tab === "events" ? " tt-tabs__btn--active" : "")}
          onClick={() => setTab("events")}
        >
          일정 {events.length}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "tasks"}
          className={"tt-tabs__btn" + (tab === "tasks" ? " tt-tabs__btn--active" : "")}
          onClick={() => setTab("tasks")}
        >
          업무 {tasks.length}
        </button>
      </div>

      {loading && <p className="status">불러오는 중…</p>}
      {error && <p className="status status--error">휴지통을 불러오지 못했습니다.</p>}

      {!loading && !error && (
        <>
          {resultMessage && (
            <div className="trash-page__result-message" role="status" aria-live="polite">
              <p className={"status" + (resultMessage.tone === "warning" ? " status--error" : "")}>
                {resultMessage.text}
              </p>
              <button
                type="button"
                className="btn-text"
                aria-label="결과 메시지 닫기"
                onClick={() => setResultMessage(null)}
              >
                닫기
              </button>
            </div>
          )}

          {tab === "events" ? (
            events.length === 0 ? (
              <p className="list--empty">휴지통에 있는 일정이 없습니다.</p>
            ) : (
              <div className="list">{events.map(renderEventRow)}</div>
            )
          ) : tasks.length === 0 ? (
            <p className="list--empty">휴지통에 있는 업무가 없습니다.</p>
          ) : (
            <div className="list">{tasks.map(renderTaskRow)}</div>
          )}
        </>
      )}

      <Modal
        open={!!permanentDeleteTarget}
        title={
          targetIsCalendarEvent
            ? "Google Calendar에 연결된 일정입니다"
            : permanentDeleteTarget?.kind === "events"
            ? "일정 영구 삭제"
            : "업무 영구 삭제"
        }
        onClose={closePermanentDelete}
      >
        {targetIsCalendarEvent ? (
          <>
            <p style={{ marginTop: 0 }}>
              &lsquo;{target?.title}&rsquo; 일정을 영구 삭제할까요? 이 작업은 되돌릴 수 없습니다.
            </p>
            <p className="trash-page__modal-helper">
              앱에서만 삭제하면 Google Calendar 일정은 그대로 남습니다.
            </p>
            {modalError && (
              <p className="status status--error" role="alert">
                {modalError}
              </p>
            )}
            <div className="form__actions" style={{ flexWrap: "wrap" }}>
              <button className="btn btn--danger" disabled={!!processingId} onClick={confirmPermanentDeleteWithCalendar}>
                {processingId === target?.id ? "처리 중…" : "앱과 Google Calendar에서 삭제"}
              </button>
              <button className="btn btn--ghost" disabled={!!processingId} onClick={confirmPermanentDeleteAppOnly}>
                앱에서만 영구 삭제
              </button>
              <button className="btn btn--ghost" disabled={!!processingId} onClick={closePermanentDelete}>
                취소
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ marginTop: 0 }}>
              &lsquo;{target?.title}&rsquo;{permanentDeleteTarget?.kind === "events" ? " 일정" : " 업무"}을(를) 영구
              삭제할까요? 이 작업은 되돌릴 수 없습니다.
            </p>
            {modalError && (
              <p className="status status--error" role="alert">
                {modalError}
              </p>
            )}
            <div className="form__actions">
              <button className="btn btn--danger" disabled={!!processingId} onClick={confirmPermanentDeleteAppOnly}>
                {processingId === target?.id ? "처리 중…" : "영구 삭제"}
              </button>
              <button className="btn btn--ghost" disabled={!!processingId} onClick={closePermanentDelete}>
                취소
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
