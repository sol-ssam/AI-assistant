import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { listActiveDocsByOwner } from "../firebase/crud";
import { getSettings, markBriefingShownToday } from "../firebase/settingsService";
import { todayDateString, todayDisplayString, formatDateDisplay, nowHourMinuteInSeoul } from "../utils/date";
import { shouldTriggerAutoBriefing } from "../utils/briefing";
import { sortByPriorityThenDate, rankTasksByPriority, dueStatusLabel } from "../utils/taskUrgency";
import {
  deriveTodayEvents,
  deriveUpcomingEvents,
  deriveOverdueTasks,
  deriveTodayDueTasks,
  deriveUpcomingTasks,
  derivePreparationReminders,
} from "../utils/briefingDerive";
import { findAllConflicts, formatOverlapRange, toMinutes } from "../utils/timeConflictDetection";
import { computeFocusSlots, formatFocusDuration } from "../utils/focusTime";
import { computeEndOfDaySummary } from "../utils/endOfDaySummary";
import { eventTypeDisplayLabel, TASK_PRIORITY_LABEL } from "../utils/constants";
import BriefingSection from "../components/BriefingSection";
import HomeQuickAssistant from "../components/HomeQuickAssistant";
import "./crud-shared.css";
import "./Home.css";

// 퇴근 전 정리 카드 안의 한 목록(오늘 완료/남은 업무/내일 일정/내일 마감) - 최대 3개만
// 보여주고 나머지는 "외 N건"으로 줄인다(요구사항).
const EOD_DISPLAY_LIMIT = 3;

function EndOfDaySummaryList({ items, emptyText, renderItem }) {
  if (items.length === 0) return <p className="eod-empty">{emptyText}</p>;
  const shown = items.slice(0, EOD_DISPLAY_LIMIT);
  const extra = items.length - shown.length;
  return (
    <>
      <ul className="eod-list">
        {shown.map((item, i) => (
          <li key={item.id ?? i} className="eod-list__item">
            {renderItem(item)}
          </li>
        ))}
      </ul>
      {extra > 0 && <p className="eod-more">외 {extra}건</p>}
    </>
  );
}

// "퇴근 전 정리" 카드 - 오늘 완료한 업무/아직 남은 업무(기한 지남+오늘 마감)/내일 일정/
// 내일 마감 업무를 요약 배지로 먼저 보여주고, 펼치면 각 항목을 최대 3개씩 확인할 수
// 있다. emphasize가 true면(퇴근 시각 2시간 전 이후) 테두리를 살짝 강조한다 - 팝업이나
// 알림은 전혀 띄우지 않는다.
function EndOfDayCard({ summary, failed, emphasize }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className={"home-card eod-card" + (emphasize ? " eod-card--emphasized" : "")}>
      <button type="button" className="eod-card__toggle" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
        <span className="home-card__title eod-card__title">🌙 퇴근 전 정리</span>
        <span className="eod-card__chevron" aria-hidden="true">
          {expanded ? "접기 ∧" : "펼치기 ∨"}
        </span>
      </button>

      {failed ? (
        <p className="eod-empty eod-empty--failed">일정·업무 정보를 불러오지 못해 정리할 수 없습니다.</p>
      ) : (
        <>
          <div className="eod-summary">
            <span className="eod-summary__pill">
              오늘 완료 <strong>{summary.completedToday.length}건</strong>
            </span>
            <span className="eod-summary__pill">
              남은 업무 <strong>{summary.remainingTasks.length}건</strong>
            </span>
            <span className="eod-summary__pill">
              내일 일정 <strong>{summary.tomorrowEvents.length}건</strong>
            </span>
            <span className="eod-summary__pill">
              내일 마감 <strong>{summary.tomorrowDueTasks.length}건</strong>
            </span>
          </div>

          {expanded && (
            <div className="eod-detail">
              <div className="eod-detail__group">
                <h3 className="eod-detail__title">오늘 완료</h3>
                <EndOfDaySummaryList
                  items={summary.completedToday}
                  emptyText="오늘 완료한 업무 기록이 없습니다."
                  renderItem={(t) => t.title}
                />
              </div>
              <div className="eod-detail__group">
                <h3 className="eod-detail__title">아직 남은 업무</h3>
                <EndOfDaySummaryList
                  items={summary.remainingTasks}
                  emptyText="남은 업무가 없습니다."
                  renderItem={(t) => `${t.title}(${t.dueDate})`}
                />
              </div>
              <div className="eod-detail__group">
                <h3 className="eod-detail__title">내일 일정</h3>
                <EndOfDaySummaryList
                  items={summary.tomorrowEvents}
                  emptyText="내일 일정이 없습니다."
                  renderItem={(e) => `${e.startTime ? e.startTime + " " : ""}${e.title}`}
                />
              </div>
              <div className="eod-detail__group">
                <h3 className="eod-detail__title">내일 마감</h3>
                <EndOfDaySummaryList
                  items={summary.tomorrowDueTasks}
                  emptyText="내일 마감인 업무가 없습니다."
                  renderItem={(t) => t.title}
                />
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// Promise.allSettled 결과 하나를 { value, failed } 형태로 풀어주고, 실패한 경우
// 어떤 조회가 실패했는지 개발 콘솔에 명확히 남긴다. 사용자 화면에는 이 원문 오류를
// 노출하지 않는다 - 화면에는 해당 섹션만 "불러오지 못했습니다"로 표시한다.
function unwrap(result, label) {
  if (result.status === "fulfilled") {
    return { value: result.value, failed: false };
  }
  console.error(`[Briefing] ${label} failed:`, result.reason);
  return { value: [], failed: true };
}

export default function Home() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFreshBriefing, setIsFreshBriefing] = useState(false);
  // "다가오는 일정" 카드 안의 일정/업무 탭 - Home 안에서만 쓰이는 단순 UI state다.
  // 기본값은 "events"(기존 사용 경험 그대로 다가오는 일정이 먼저 보임). 저장하지 않으므로
  // Home을 다시 열면 항상 "일정"으로 돌아간다.
  const [upcomingTab, setUpcomingTab] = useState("events");

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        // 이 부분(설정 조회)이 실패하면 브리핑 전체를 보여줄 수 없으므로 총체적 실패로 다룬다.
        const settings = await getSettings(user.uid);
        const triggerAuto = shouldTriggerAutoBriefing(settings);

        // 오늘의 브리핑은 events/tasks만 사용한다. 각각 ownerId 기준으로 딱 한 번만 읽고,
        // 오늘/기한초과/다가오는 항목 등 여러 조각은 전부 클라이언트에서 파생시킨다
        // (불필요한 복합 색인과 중복 조회를 피하기 위함). 하나가 실패해도 나머지는
        // 정상 표시되도록 Promise.all이 아니라 Promise.allSettled를 사용한다.
        // listActiveDocsByOwner를 써서 휴지통으로 이동한 일정·업무는 브리핑 전체에서
        // 제외된다.
        const results = await Promise.allSettled([
          listActiveDocsByOwner("events", user.uid),
          listActiveDocsByOwner("tasks", user.uid),
        ]);

        if (cancelled) return;

        const { value: allEvents, failed: eventsFailed } = unwrap(results[0], "events");
        const { value: allTasks, failed: tasksFailed } = unwrap(results[1], "tasks");

        const today = todayDateString();
        const todayEvents = deriveTodayEvents(allEvents, today);

        // 일정 충돌은 오늘 일정 데이터가 있어야만 계산할 수 있다 - events 조회 자체가
        // 실패했으면(eventsFailed) 충돌도 "계산 실패"로 다루고 빈 결과로 둔다(추측해서
        // 채우지 않는다). 업무 관련 표시는 이 실패와 무관하게 그대로 진행된다.
        const conflictPairs = eventsFailed ? [] : findAllConflicts(todayEvents);

        // 집중 가능 시간도 마찬가지로 오늘 일정이 필요하다 - eventsFailed면 계산하지 않고
        // "불러오지 못함" 상태로 표시한다. settings는 이미 getSettings()가 기본값과 병합해
        // 돌려준 값이므로 근무시간 필드가 없는 기존 사용자도 항상 유효한 입력을 받는다.
        const focus = eventsFailed
          ? null
          : computeFocusSlots({
              events: todayEvents,
              today,
              workDays: settings.workDays,
              workStartTime: settings.workStartTime,
              workEndTime: settings.workEndTime,
              focusMinMinutes: settings.focusMinMinutes,
            });

        // 오늘의 업무 우선순위 - 완료되지 않은 업무 전체를 대상으로 결정론적으로 정렬한
        // 뒤 상위 5개만 보여준다(utils/taskUrgency.js, AI 호출 없음).
        const taskPriorityList = tasksFailed ? [] : rankTasksByPriority(allTasks, today).slice(0, 5);

        // 준비할 일정(오늘·내일, 준비 미완료, 취소 아님) - 일정 데이터가 있어야 계산할 수
        // 있으므로 eventsFailed면 빈 배열로 둔다.
        const prepReminders = eventsFailed ? [] : derivePreparationReminders(allEvents, today);

        // 퇴근 전 정리 - events/tasks 둘 다 필요하다. 어느 한쪽이라도 실패하면 잘못된
        // "0건" 요약을 보여주지 않도록 계산 자체를 하지 않고 실패 상태로만 표시한다.
        const endOfDayFailed = eventsFailed || tasksFailed;
        const endOfDaySummary = endOfDayFailed
          ? null
          : computeEndOfDaySummary({ events: allEvents, tasks: allTasks, today });

        setData({
          todayEvents,
          upcomingEvents: [...deriveUpcomingEvents(allEvents, today)].sort((a, b) => {
            const byDate = (a.date || "").localeCompare(b.date || "");
            if (byDate !== 0) return byDate;
            return (a.startTime || "").localeCompare(b.startTime || "");
          }),
          eventsFailed,
          conflictPairs,
          focus,
          overdueTasks: sortByPriorityThenDate(deriveOverdueTasks(allTasks, today)),
          dueTasks: sortByPriorityThenDate(deriveTodayDueTasks(allTasks, today)),
          upcomingTasks: sortByPriorityThenDate(deriveUpcomingTasks(allTasks, today)),
          taskPriorityList,
          tasksFailed,
          prepReminders,
          endOfDaySummary,
          endOfDayFailed,
          // 퇴근 전 정리 카드를 강조할지 판단하는 데만 쓰인다(퇴근 시각 2시간 전 이후).
          workEndTime: settings.workEndTime,
        });

        if (triggerAuto) {
          setIsFreshBriefing(true);
          markBriefingShownToday(user.uid).catch(() => {});
        }
      } catch (e) {
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Home에서 카드 하나에 보여줄 소수 항목 개수 - 기존 "다가오는 일정"도 이 카드에서는
  // 이 정도만 보여주고 나머지는 "전체 보기"로 넘긴다.
  const UPCOMING_DISPLAY_LIMIT = 4;

  // 준비할 일정의 "오늘/내일" 표시 및 퇴근 전 정리 카드 강조 여부 계산에 쓰인다.
  const today = todayDateString();

  // "다가오는 업무" = 오늘 마감(dueTasks) + 미래 마감(upcomingTasks). 둘 다 이미
  // briefingDerive.js가 완료 여부/마감일로 걸러낸 기존 배열이다 - 여기서는 새로 필터링하지
  // 않고 합쳐서 마감일 오름차순으로만 다시 정렬한다(가까운 마감일 -> 먼 마감일 순서 -
  // 기존 sortByPriorityThenDate의 priority 우선 정렬과는 다른 기준이라 별도로 정렬).
  // 연체 업무(overdueTasks)는 포함하지 않는다 - 오늘의 주요 확인에서 이미 다룬다.
  const upcomingTasksForCard = data
    ? [...data.dueTasks, ...data.upcomingTasks].sort((a, b) =>
        (a.dueDate ?? "").localeCompare(b.dueDate ?? "")
      )
    : [];

  // 오늘의 주요 확인 = 기한이 지난 업무 + 오늘 마감 업무 + 오늘 일정 충돌 + 준비할 일정.
  // 오늘 일정 자체는 옆 카드에서 따로 전부 보여주므로 여기에는 "겹침" 경고만 추가한다.
  // 같은 충돌 쌍은 findAllConflicts가 이미 한 번만 반환하므로 여기서 다시 중복 제거하지
  // 않는다. 준비할 일정(prepReminders)은 derivePreparationReminders가 이미 오늘/내일 +
  // 준비 미완료 + 취소 아님으로 걸러 정렬해 둔 결과이므로 그대로 매핑만 한다.
  const priorityItems = data
    ? [
        ...data.overdueTasks.map((t) => ({
          key: `od-${t.id}`,
          category: "지난 업무",
          text: t.title,
          meta: `${t.dueDate} 지남`,
        })),
        ...data.dueTasks.map((t) => ({
          key: `dt-${t.id}`,
          category: "업무",
          text: t.title,
          meta: "오늘까지",
        })),
        ...data.conflictPairs.map((pair) => ({
          key: `cf-${pair.a.id}-${pair.b.id}`,
          category: "일정 충돌",
          warning: true,
          text: `${pair.a.title}와 ${pair.b.title} 시간이 겹칩니다.`,
          meta: `${formatOverlapRange(pair.a, pair.b)} 중복`,
        })),
        ...data.prepReminders.map((e) => ({
          key: `pr-${e.id}`,
          category: "준비할 일정",
          text: e.title,
          note: e.preparationNote,
          meta: `${e.date === today ? "오늘" : "내일"}${e.startTime ? " " + e.startTime : ""}`,
          link: "/events",
        })),
      ]
    : [];

  // 집중 가능 시간 카드의 상태별 안내 문구 - focus.ok가 false면 근무시간 설정 자체가
  // 잘못됐다는 뜻(오류를 그대로 노출하지 않고 설정 확인 안내로만 보여준다는 요구사항).
  const focusEmptyText = !data
    ? ""
    : data.eventsFailed
    ? ""
    : !data.focus?.ok
    ? "근무시간 설정을 확인해 주세요."
    : !data.focus.isWorkDay
    ? "오늘은 설정된 근무일이 아닙니다."
    : "설정한 기준 이상의 집중 가능 시간이 없습니다.";

  const focusSlots =
    data && !data.eventsFailed && data.focus?.ok && data.focus.isWorkDay ? data.focus.slots.slice(0, 3) : [];

  // 퇴근 전 정리 카드를 강조할지: 현재 시각이 설정된 퇴근 시각 2시간 전 이후이면 true.
  // 근무일 여부와 무관하게(사용자가 원하면 비근무일에도 확인할 수 있어야 하므로) 계산한다.
  // workEndTime을 파싱할 수 없으면(설정 누락 등) 강조하지 않는다 - 추측하지 않는다.
  const emphasizeEndOfDay = (() => {
    if (!data?.workEndTime) return false;
    const endMinutes = toMinutes(data.workEndTime);
    if (endMinutes == null) return false;
    const { hour, minute } = nowHourMinuteInSeoul();
    const nowMinutes = hour * 60 + minute;
    return nowMinutes >= endMinutes - 120;
  })();

  const userName = user?.displayName?.trim();

  return (
    <div className="home">
      <header className="home__head">
        <div className="home__head-text">
          <p className="home__greeting">{userName ? `${userName}님 안녕하세요 🌷` : "안녕하세요 🌷"}</p>
          <p className="home__subgreeting">오늘의 업무를 시작해 볼까요</p>
          <p className="home__date">{todayDisplayString()}</p>

          {data && (
            <div className="home__summary">
              <span className="home__summary-pill">
                오늘 일정 <strong>{data.todayEvents.length}</strong>
              </span>
              <span className="home__summary-pill">
                오늘 마감 <strong>{data.dueTasks.length}</strong>
              </span>
              <span className="home__summary-pill">
                기한 지남 <strong>{data.overdueTasks.length}</strong>
              </span>
              {isFreshBriefing && <span className="home__summary-badge">🔔 오늘 처음 확인</span>}
            </div>
          )}
        </div>
        <div className="home__head-decor" aria-hidden="true" />
      </header>

      {loading && <p className="home__status">오늘 하루를 정리하는 중입니다…</p>}

      {error && (
        <p className="home__status home__status--error">
          브리핑 데이터를 불러오는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      )}

      {data && (
        <div className="home__grid">
          {/* 1행: 오늘의 주요 확인(기한 지난 업무 + 오늘 마감 업무) + 오늘 일정. 이 row 안에
              실제로 존재하는 카드만 children으로 들어가므로, 하나만 있으면 CSS(auto-fit)가
              자동으로 풀폭으로 펼쳐준다 - 별도의 JS 레이아웃 계산이 필요 없다. */}
          {(priorityItems.length > 0 ||
            data.tasksFailed ||
            data.todayEvents.length > 0 ||
            data.eventsFailed) && (
            <div className="home__row">
              <BriefingSection
                icon="✅"
                title="오늘의 주요 확인"
                tone="urgent"
                navLink={{ to: "/tasks", label: "업무 보기" }}
                items={priorityItems}
                failed={data.tasksFailed || data.eventsFailed}
                hideWhenEmpty
                emptyText=""
                renderItem={(p) => {
                  const row = (
                    <div className="home-priority-row">
                      <span className="home-priority-row__main">
                        <span className={"home-badge" + (p.warning ? " home-badge--warning" : "")}>
                          {p.category}
                        </span>
                        {p.text}
                        {p.note && <span className="home-priority-row__note"> — {p.note}</span>}
                      </span>
                      {p.meta && <span className="home-priority-row__meta">{p.meta}</span>}
                    </div>
                  );
                  // 준비할 일정 항목만 일정 페이지로 이동하는 링크를 갖는다(p.link).
                  return p.link ? (
                    <Link to={p.link} className="home-priority-link">
                      {row}
                    </Link>
                  ) : (
                    row
                  );
                }}
              />

              <BriefingSection
                icon="📅"
                title="오늘 일정"
                tone="calendar"
                navLink={{ to: "/events", label: "일정 보기" }}
                items={data.todayEvents}
                failed={data.eventsFailed}
                hideWhenEmpty
                emptyText=""
                renderItem={(e) => (
                  <div className="home-priority-row">
                    <span className="home-priority-row__main">
                      <span className="home-badge">{eventTypeDisplayLabel(e)}</span>
                      {e.title}
                    </span>
                    {e.startTime && <span className="home-priority-row__meta">{e.startTime}</span>}
                  </div>
                )}
              />
            </div>
          )}

          {/* 2행: 다가오는 일정/업무 + AI 비서. AI 카드는 항상 렌더링되므로 이 row는
              절대 비지 않는다. 다가오는 일정/업무 카드는 둘 중 하나라도 있으면 유지하고,
              하나만 렌더링되는 BriefingSection 대신 탭 전환이 가능한 커스텀 마크업을 쓴다
              (탭에 따라 제목 옆 "전체 보기" 목적지도 함께 바뀌어야 하기 때문). */}
          <div className="home__row">
            {(data.upcomingEvents.length > 0 || upcomingTasksForCard.length > 0) && (
              <section className="briefing-section">
                <header className="briefing-section__head briefing-section__head--tabbed">
                  <span className="briefing-section__dot briefing-section__dot--prep" />
                  <span className="briefing-section__icon">📑</span>
                  <div className="home-tabs home-tabs--title" role="tablist" aria-label="다가오는 일정 또는 업무">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={upcomingTab === "events"}
                      className={"home-tab home-tab--title" + (upcomingTab === "events" ? " home-tab--active" : "")}
                      onClick={() => setUpcomingTab("events")}
                    >
                      다가오는 일정
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={upcomingTab === "tasks"}
                      className={"home-tab home-tab--title" + (upcomingTab === "tasks" ? " home-tab--active" : "")}
                      onClick={() => setUpcomingTab("tasks")}
                    >
                      다가오는 업무
                    </button>
                  </div>
                  <Link
                    to={upcomingTab === "events" ? "/events" : "/tasks"}
                    className="briefing-section__nav-link"
                  >
                    전체 보기 ›
                  </Link>
                </header>

                {upcomingTab === "events" ? (
                  data.eventsFailed ? (
                    <p className="briefing-section__empty briefing-section__empty--failed">
                      이 항목을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
                    </p>
                  ) : data.upcomingEvents.length === 0 ? (
                    <p className="briefing-section__empty">다가오는 일정이 없어요.</p>
                  ) : (
                    <ul className="briefing-section__list">
                      {data.upcomingEvents.slice(0, UPCOMING_DISPLAY_LIMIT).map((e, i) => (
                        <li key={e.id ?? i} className="briefing-section__item">
                          <span className="home-row-date">{formatDateDisplay(e.date)}</span>
                          {e.title}
                        </li>
                      ))}
                    </ul>
                  )
                ) : data.tasksFailed ? (
                  <p className="briefing-section__empty briefing-section__empty--failed">
                    이 항목을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
                  </p>
                ) : upcomingTasksForCard.length === 0 ? (
                  <p className="briefing-section__empty">다가오는 업무가 없어요.</p>
                ) : (
                  <ul className="briefing-section__list">
                    {upcomingTasksForCard.slice(0, UPCOMING_DISPLAY_LIMIT).map((t) => (
                      <li key={t.id} className="briefing-section__item">
                        <span className="home-row-date">
                          {t.dueDate === todayDateString() ? "오늘" : formatDateDisplay(t.dueDate)}
                        </span>
                        {t.title}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            <HomeQuickAssistant />
          </div>

          {/* 3행: 집중 가능 시간 + 오늘의 업무 우선순위. 둘 다 hideWhenEmpty를 쓰지 않는다 -
              항목이 없어도 상태 안내(비근무일/설정 오류/우선 업무 없음 등)를 항상 보여줘야
              하기 때문이다. */}
          <div className="home__row">
            <BriefingSection
              icon="🧭"
              title="집중 가능 시간"
              tone="calendar"
              items={focusSlots}
              failed={data.eventsFailed}
              emptyText={focusEmptyText}
              renderItem={(slot) => `${slot.startTime}~${slot.endTime} · ${formatFocusDuration(slot.minutes)}`}
            />

            <BriefingSection
              icon="📌"
              title="오늘의 업무 우선순위"
              tone="urgent"
              navLink={{ to: "/tasks", label: "전체 업무 보기" }}
              items={data.taskPriorityList}
              failed={data.tasksFailed}
              emptyText="우선 처리할 미완료 업무가 없습니다."
              renderItem={(t) => (
                <Link to="/tasks" className="home-priority-link">
                  <div className="home-priority-row">
                    <span className="home-priority-row__main">
                      <span className={`badge badge--${t.priority}`}>
                        {TASK_PRIORITY_LABEL[t.priority] ?? t.priority}
                      </span>
                      {t.title}
                    </span>
                    <span className="home-priority-row__meta">{dueStatusLabel(t.dueDate, today)}</span>
                  </div>
                </Link>
              )}
            />
          </div>

          {/* 4행: 퇴근 전 정리. 근무일이 아니어도 사용자가 원하면 확인할 수 있도록 항상
              표시한다(팝업/알림 없이 카드로만). 카드가 하나뿐이므로 .home__row의
              auto-fit이 자연스럽게 풀폭으로 펼쳐준다(다른 1개짜리 row와 동일한 방식). */}
          <div className="home__row">
            <EndOfDayCard summary={data.endOfDaySummary} failed={data.endOfDayFailed} emphasize={emphasizeEndOfDay} />
          </div>
        </div>
      )}
    </div>
  );
}
