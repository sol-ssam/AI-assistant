import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { createDoc, createDocsBatch, updateDocById, listActiveDocsByOwner, softDeleteDocById } from "../firebase/crud";
import { TASK_PRIORITIES, TASK_PRIORITY_LABEL } from "../utils/constants";
import { formatDateDisplay, todayDateString } from "../utils/date";
import { useFieldErrors, isBlank } from "../utils/formValidation";
import { generateRecurrenceDates, generateSeriesId } from "../utils/recurrence";
import FieldError from "../components/FieldError";
import "./crud-shared.css";
import "./TasksPage.css";

const emptyForm = { title: "", dueDate: "", priority: "medium", memo: "", repeatType: "none", repeatEndDate: "" };

// 반복(repeatType !== "none")이면 반복 종료일도 검증한다 - 실제 날짜 계산(최대 1년·50회,
// 종료일이 마감일보다 빠른 경우 등)은 등록 시 쓰는 것과 같은 함수(generateRecurrenceDates)로
// 미리 확인해, 저장 시점과 항상 같은 기준으로 판단한다.
function validateTaskForm(values) {
  const errors = {};
  if (isBlank(values.title)) errors.title = "업무명을 입력해 주세요.";
  if (isBlank(values.dueDate)) errors.dueDate = "마감일을 선택해 주세요.";
  if (values.repeatType && values.repeatType !== "none") {
    if (isBlank(values.repeatEndDate)) {
      errors.repeatEndDate = "반복 종료일을 입력해 주세요.";
    } else if (!isBlank(values.dueDate)) {
      const check = generateRecurrenceDates({
        startDate: values.dueDate,
        repeatType: values.repeatType,
        repeatEndDate: values.repeatEndDate,
      });
      if (!check.ok) errors.repeatEndDate = check.reason;
    }
  }
  return errors;
}

// 개발자 확인용 로그에는 사용자가 입력한 업무명·메모 등이 섞일 수 있는 error.message를 남기지
// 않고, 오류 종류(code/name)만 남긴다.
function safeErrorInfo(err) {
  return err?.code ?? err?.name ?? "unknown";
}

// 저장·상태 변경 실패 안내 - role="alert"로 스크린리더에 즉시 알리고, 닫기 버튼을 둔다.
function ErrorMessage({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="tp-message" role="alert">
      <p className="status status--error">{message}</p>
      <button type="button" className="btn-text" aria-label="오류 메시지 닫기" onClick={onClose}>
        닫기
      </button>
    </div>
  );
}

// 등록 form과 인라인 수정 form이 완전히 동일한 필드 UI를 공유한다. showRepeatOptions:
// 반복 등록 UI는 새 업무 등록 폼에서만 보여준다(요구사항: 수정 시에는 추가 회차를
// 생성하지 않는다) - 수정 폼 호출부는 이 prop을 넘기지 않아 기본값 false로 숨겨진다.
function TaskFormFields({ values, onChange, errors = {}, registerField, idPrefix, showRepeatOptions = false }) {
  const id = (name) => `${idPrefix}-${name}`;
  const isRepeating = showRepeatOptions && values.repeatType && values.repeatType !== "none";
  return (
    <>
      <div className={"field field--grow" + (errors.title ? " field--invalid" : "")}>
        <label htmlFor={id("title")}>업무명</label>
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
      <div className={"field" + (errors.dueDate ? " field--invalid" : "")}>
        <label htmlFor={id("dueDate")}>마감일</label>
        <input
          id={id("dueDate")}
          ref={registerField("dueDate")}
          type="date"
          aria-invalid={!!errors.dueDate}
          aria-describedby={errors.dueDate ? id("dueDate-error") : undefined}
          value={values.dueDate}
          onChange={(e) => onChange({ ...values, dueDate: e.target.value })}
        />
        <FieldError id={id("dueDate-error")} message={errors.dueDate} />
      </div>
      <div className="field">
        <label htmlFor={id("priority")}>중요도</label>
        <select
          id={id("priority")}
          value={values.priority}
          onChange={(e) => onChange({ ...values, priority: e.target.value })}
        >
          {TASK_PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field field--grow">
        <label htmlFor={id("memo")}>메모</label>
        <input id={id("memo")} value={values.memo} onChange={(e) => onChange({ ...values, memo: e.target.value })} />
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
    </>
  );
}

export default function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("todo"); // "todo" | "done" | "all"

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  // 반복 등록 성공 안내("N건 등록했어요") - closeCreateForm()이 폼을 닫아도 이 메시지는
  // 그대로 남겨서 실제로 몇 건 생성됐는지 계속 보여준다.
  const [createResultMessage, setCreateResultMessage] = useState(null);
  // 삭제(휴지통 이동) 실패 안내 - 성공 시에는 createResultMessage를 쓰고, 실패했을 때만
  // 별도로 표시한다("성공 안내를 보여주지 않고 오류 안내를 보여준다"는 요구사항).
  const [removeError, setRemoveError] = useState(null);
  // Firestore 저장 실패 안내(폼은 그대로 열려 있고 입력값도 유지된다).
  const [createError, setCreateError] = useState(null);
  // 완료/완료 취소 체크 저장 실패 안내, 그리고 저장 중인 업무 id(중복 클릭 방지).
  const [completionError, setCompletionError] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const createErrors = useFieldErrors();
  const onCreateChange = createErrors.withErrorClearing(setCreateForm);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState(null);
  const editErrors = useFieldErrors();
  const onEditChange = editErrors.withErrorClearing(setEditForm);

  async function load() {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const list = await listActiveDocsByOwner("tasks", user.uid);
      setTasks(list.sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "")));
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
    setCreateResultMessage(null);
  }

  function closeCreateForm() {
    setShowCreateForm(false);
    setCreateForm(emptyForm);
    setCreateError(null);
    createErrors.clearAll();
  }

  function startEdit(t) {
    setShowCreateForm(false); // 한 번에 하나의 form만 - 신규 등록 form이 열려 있으면 닫는다.
    setEditingId(t.id);
    setEditError(null);
    editErrors.clearAll();
    setEditForm({
      title: t.title ?? "",
      dueDate: t.dueDate ?? "",
      priority: t.priority ?? "medium",
      memo: t.memo ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(emptyForm);
    setEditError(null);
    editErrors.clearAll();
  }

  // 할 일/완료/전체 필터를 바꾸면 수정 중이던 항목이 새 필터의 visible 목록에서 사라져
  // 보이지 않게 될 수 있다 - 그 상태로 편집 state만 남아 있다가, 다시 그 필터로 돌아오면
  // 예전 수정 폼이 그대로 다시 나타났다. 필터를 바꿀 때 기존 cancelEdit()으로 정리한다.
  // 작성 중인 새 업무 등록 폼(showCreateForm/createForm)은 건드리지 않는다.
  function handleSetFilter(f) {
    cancelEdit();
    setFilter(f);
  }

  // 반복 업무 생성 - 단건 등록과 별개의 경로다. 날짜 계산은 utils/recurrence.js
  // (generateRecurrenceDates)를, 저장은 firebase/crud.js(createDocsBatch)를 일정 페이지·
  // AI 비서(execAddTask)와 똑같이 재사용한다. 각 회차는 dueDate만 반복 날짜로 바뀌고
  // 제목/중요도/메모는 동일하며, completed는 항상 false로 시작한다.
  async function createRecurringTasks() {
    const result = generateRecurrenceDates({
      startDate: createForm.dueDate,
      repeatType: createForm.repeatType,
      repeatEndDate: createForm.repeatEndDate,
    });
    if (!result.ok) {
      createErrors.runValidation({ repeatEndDate: result.reason });
      return;
    }

    setCreating(true);
    setCreateError(null);
    setCreateResultMessage(null);
    try {
      const now = new Date().toISOString();
      const seriesId = generateSeriesId();
      const docs = result.dates.map((dueDate, index) => ({
        title: createForm.title,
        dueDate,
        priority: createForm.priority,
        memo: createForm.memo || "",
        completed: false,
        source: "manual",
        seriesId,
        repeatType: createForm.repeatType,
        repeatEndDate: createForm.repeatEndDate,
        occurrenceIndex: index,
        isRecurringOccurrence: true,
        createdAt: now,
        updatedAt: now,
      }));

      await createDocsBatch("tasks", user.uid, docs);
      closeCreateForm();
      setCreateResultMessage(`반복 업무 ${docs.length}건을 등록했습니다.`);
      load();
    } catch (err) {
      console.error("[Recurring task] batch create failed:", safeErrorInfo(err));
      // batch는 원자적이라 일부 회차만 저장되지 않는다 - 성공 메시지/건수 없이 실패만 안내하고,
      // 폼과 입력값은 그대로 둔다. 입력란 검증 오류(repeatEndDate)가 아니므로 폼 수준 안내로 보인다.
      setCreateError("반복 업무를 등록하지 못했습니다. 입력한 내용을 유지했으니 잠시 후 다시 시도해 주세요.");
    } finally {
      setCreating(false);
    }
  }

  async function submitCreate(e) {
    e.preventDefault();
    if (creating) return;
    if (!createErrors.runValidation(validateTaskForm(createForm))) return;

    if (createForm.repeatType && createForm.repeatType !== "none") {
      createRecurringTasks();
      return;
    }

    setCreating(true);
    setCreateError(null);
    try {
      const now = new Date().toISOString();
      // repeatType/repeatEndDate는 폼 state에만 있는 값이다 - 일반 단건 업무 문서에는
      // 반복 필드를 넣지 않는다(요구사항: 반복 아닌 문서에는 이 필드가 없어야 한다).
      await createDoc("tasks", user.uid, {
        title: createForm.title,
        dueDate: createForm.dueDate,
        priority: createForm.priority,
        memo: createForm.memo || "",
        completed: false,
        source: "manual",
        createdAt: now,
        updatedAt: now,
      });
      closeCreateForm();
      load();
    } catch (err) {
      console.error("[Tasks] create failed:", safeErrorInfo(err));
      setCreateError("업무를 저장하지 못했습니다. 입력한 내용을 유지했으니 잠시 후 다시 시도해 주세요.");
    } finally {
      setCreating(false);
    }
  }

  async function submitEdit(e) {
    e.preventDefault();
    if (editSaving) return;
    if (!editErrors.runValidation(validateTaskForm(editForm))) return;
    setEditSaving(true);
    setEditError(null);
    try {
      // 기존 update 로직 그대로 - Firestore document ID(editingId) 유지, 새 document 생성 안 함.
      await updateDocById("tasks", editingId, { ...editForm, updatedAt: new Date().toISOString() });
      cancelEdit();
      load();
    } catch (err) {
      console.error("[Tasks] update failed:", safeErrorInfo(err));
      setEditError("업무 변경 내용을 저장하지 못했습니다. 입력한 내용을 유지했으니 다시 시도해 주세요.");
    } finally {
      setEditSaving(false);
    }
  }

  // 체크박스 하나로 완료<->미완료를 전환한다. 완료 처리 시 completedAt을 현재 시각으로
  // 기록하고, 완료 취소 시에는 null로 지운다 - AI 비서의 completeTask와 정확히 같은
  // 형식(ISO 문자열)이다. 퇴근 전 정리("오늘 완료한 업무")가 이 값을 읽는다.
  // 저장이 실패하면 tasks state를 건드리지 않으므로(낙관적 갱신 없음) 체크 상태는 실제
  // Firestore 값 그대로 남는다.
  async function toggleCompleted(t) {
    if (togglingId) return;
    const completing = !t.completed;
    setTogglingId(t.id);
    setCompletionError(null);
    try {
      await updateDocById("tasks", t.id, {
        completed: completing,
        completedAt: completing ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
      });
      load();
    } catch (err) {
      console.error("[Tasks] completion toggle failed:", safeErrorInfo(err));
      setCompletionError("업무 완료 상태를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setTogglingId(null);
    }
  }

  // 삭제 버튼 - 더 이상 Firestore에서 완전히 지우지 않고 휴지통으로 이동(soft delete)만
  // 한다. 업무는 원래도 확인창 없이 즉시 삭제됐는데, 이제는 휴지통에서 복원할 수 있으므로
  // 별도 확인 Modal을 추가하지 않는다(요구사항). 실패하면 성공 안내 대신 오류 안내를
  // 보여주고, 목록은 그대로 둔다(load()를 호출하지 않음 - 화면에 남아 있어야 재시도할 수
  // 있다).
  async function remove(id) {
    try {
      await softDeleteDocById("tasks", id, "manual");
      if (editingId === id) cancelEdit();
      setRemoveError(null);
      setCreateResultMessage("업무를 휴지통으로 이동했습니다.");
      load();
    } catch (err) {
      console.error("[Tasks] move to trash failed:", err);
      setRemoveError("업무를 휴지통으로 이동하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  const incomplete = tasks.filter((t) => !t.completed);
  const completed = tasks.filter((t) => t.completed);
  const visible = filter === "todo" ? incomplete : filter === "done" ? completed : tasks;

  function formatDue(dueDate) {
    if (!dueDate) return "";
    const isThisYear = dueDate.slice(0, 4) === todayDateString().slice(0, 4);
    const display = formatDateDisplay(dueDate);
    return isThisYear ? `${display}까지` : `${dueDate.slice(0, 4)}년 ${display}까지`;
  }

  return (
    <div className="page tasks-page">
      <header className="page__head">
        <h1 className="page__title">업무</h1>
        <p className="page__desc">해야 할 일을 등록하고 완료 여부와 마감일을 관리해요.</p>
      </header>

      <div className="tp-toolbar">
        <div className="tt-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={filter === "todo"}
            className={"tt-tabs__btn" + (filter === "todo" ? " tt-tabs__btn--active" : "")}
            onClick={() => handleSetFilter("todo")}
          >
            할 일 {incomplete.length}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "done"}
            className={"tt-tabs__btn" + (filter === "done" ? " tt-tabs__btn--active" : "")}
            onClick={() => handleSetFilter("done")}
          >
            완료 {completed.length}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "all"}
            className={"tt-tabs__btn" + (filter === "all" ? " tt-tabs__btn--active" : "")}
            onClick={() => handleSetFilter("all")}
          >
            전체 {tasks.length}
          </button>
        </div>
        {!showCreateForm && (
          <button type="button" className="btn" onClick={openCreateForm}>
            + 업무 추가
          </button>
        )}
      </div>

      {loading && <p className="status">불러오는 중…</p>}
      {error && <p className="status status--error">업무를 불러오지 못했습니다.</p>}

      {!loading && !error && (
        <>
          {showCreateForm && (
            <form className="form tp-form" onSubmit={submitCreate} noValidate>
              <TaskFormFields
                values={createForm}
                onChange={onCreateChange}
                errors={createErrors.errors}
                registerField={createErrors.registerField}
                idPrefix="task-create"
                showRepeatOptions
              />
              <ErrorMessage message={createError} onClose={() => setCreateError(null)} />
              <div className="form__actions">
                <button type="submit" className="btn" disabled={creating}>
                  {creating ? "저장 중…" : "추가"}
                </button>
                <button type="button" className="btn btn--ghost" onClick={closeCreateForm} disabled={creating}>
                  취소
                </button>
              </div>
            </form>
          )}
          {createResultMessage && <p className="status">{createResultMessage}</p>}
          {removeError && <p className="status status--error">{removeError}</p>}
          <ErrorMessage message={completionError} onClose={() => setCompletionError(null)} />

          <div className="tp-list">
            {visible.length === 0 && (
              <p className="list--empty">
                {filter === "todo"
                  ? "현재 남은 업무가 없어요."
                  : filter === "done"
                  ? "완료된 업무가 없어요."
                  : "등록된 업무가 없어요."}
              </p>
            )}
            {visible.map((t) =>
              editingId === t.id ? (
                // 이 업무가 원래 있던 바로 그 자리에서 수정 form으로 전환된다.
                <form className="form tp-form tp-form--inline" key={t.id} onSubmit={submitEdit} noValidate>
                  <TaskFormFields
                    values={editForm}
                    onChange={onEditChange}
                    errors={editErrors.errors}
                    registerField={editErrors.registerField}
                    idPrefix="task-edit"
                  />
                  <ErrorMessage message={editError} onClose={() => setEditError(null)} />
                  <div className="form__actions">
                    <button type="submit" className="btn" disabled={editSaving}>
                      {editSaving ? "저장 중…" : "저장"}
                    </button>
                    <button type="button" className="btn btn--ghost" onClick={cancelEdit}>
                      취소
                    </button>
                  </div>
                </form>
              ) : (
                <div className="tp-row" key={t.id}>
                  <label className="tp-checkbox">
                    <input
                      type="checkbox"
                      checked={!!t.completed}
                      disabled={togglingId === t.id}
                      onChange={() => toggleCompleted(t)}
                      aria-label={t.completed ? `${t.title} 완료 취소` : `${t.title} 완료 처리`}
                    />
                    <span className="tp-checkbox__box" aria-hidden="true" />
                  </label>
                  <div className="tp-row__main">
                    <p className={"tp-row__title" + (t.completed ? " tp-row__title--done" : "")}>
                      <span className={`badge badge--${t.priority}`}>
                        {TASK_PRIORITY_LABEL[t.priority] ?? t.priority}
                      </span>
                      {t.isRecurringOccurrence && <span className="badge badge--recurring">반복</span>}
                      {t.title}
                    </p>
                    {(t.dueDate || t.memo) && (
                      <p className="tp-row__meta">
                        {t.dueDate && formatDue(t.dueDate)}
                        {t.dueDate && t.memo ? " · " : ""}
                        {t.memo}
                      </p>
                    )}
                  </div>
                  <div className="list__actions">
                    <button className="btn-text" onClick={() => startEdit(t)}>
                      수정
                    </button>
                    <button className="btn-text btn-text--danger" onClick={() => remove(t.id)}>
                      삭제
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        </>
      )}
    </div>
  );
}
