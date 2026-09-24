// 5-3-3: 완료 업무 자동 휴지통 이동 + 휴지통 30일 경과 자동 영구 삭제.
//
// 별도 서버·Cloud Functions·예약 작업 없이, 인증된 사용자가 앱에 진입할 때 클라이언트에서
// 하루 한 번만 시도한다(App.jsx의 AuthenticatedApp에서 호출). 판정 로직 자체는
// utils/trashPolicy.js의 순수 함수에 있고, 이 파일은 그 판정에 맞춰 실제 Firestore 조회·
// 쓰기(listActiveDocsByOwner/listTrashedDocsByOwner/softDeleteDocsBatch/deleteDocsBatch)만
// 담당한다.
import {
  listActiveDocsByOwner,
  listTrashedDocsByOwner,
  softDeleteDocsBatch,
  deleteDocsBatch,
} from "./crud";
import { getSettings, markTrashSweepDone } from "./settingsService";
import { todayDateString } from "../utils/date";
import { isTaskEligibleForAutoTrash, isDocEligibleForAutoPurge, shouldRunTrashSweep } from "../utils/trashPolicy";

// 같은 사용자에 대해 동시에 여러 번 호출돼도(라우트 이동으로 AuthenticatedApp effect가
// 다시 실행되는 등) 실제 정리 작업은 한 번만 진행되게 한다 - initializePreviewData.js의
// ensurePreviewData()와 완전히 같은 inflight Map 패턴이다.
const inflight = new Map();

// 완료 업무 자동 휴지통 이동 - completedTaskAutoTrashDays가 0(사용 안 함)이면 아무것도
// 하지 않는다. 대상은 항상 listActiveDocsByOwner(활성 문서만)에서 찾으므로, 이미
// 휴지통에 있는 업무는 애초에 후보에 포함되지 않는다.
async function autoTrashCompletedTasks(uid, autoTrashDays, today) {
  if (!(autoTrashDays > 0)) return;
  const activeTasks = await listActiveDocsByOwner("tasks", uid);
  const eligibleIds = activeTasks
    .filter((t) => isTaskEligibleForAutoTrash(t, autoTrashDays, today))
    .map((t) => t.id);
  if (eligibleIds.length > 0) {
    await softDeleteDocsBatch("tasks", eligibleIds, "auto");
  }
}

// 휴지통 30일 경과 자동 영구 삭제 - events/tasks를 각각 한 번만 조회한다. 방금 위
// autoTrashCompletedTasks()가 새로 휴지통에 옮긴 업무는 deletedAt이 방금 막 기록된
// 시각이라 경과일이 0이므로, 이 함수를 뒤이어 호출해도 같은 실행에서 다시 영구 삭제되지
// 않는다(요구사항) - 별도의 예외 처리 코드 없이 날짜 계산 자체로 보장된다.
async function autoPurgeTrash(uid, today) {
  const [trashedEvents, trashedTasks] = await Promise.all([
    listTrashedDocsByOwner("events", uid),
    listTrashedDocsByOwner("tasks", uid),
  ]);

  const purgeEventIds = trashedEvents.filter((e) => isDocEligibleForAutoPurge(e, today)).map((e) => e.id);
  const purgeTaskIds = trashedTasks.filter((t) => isDocEligibleForAutoPurge(t, today)).map((t) => t.id);

  if (purgeEventIds.length > 0) await deleteDocsBatch("events", purgeEventIds);
  if (purgeTaskIds.length > 0) await deleteDocsBatch("tasks", purgeTaskIds);
}

// App.jsx의 인증 후 공통 진입점(AuthenticatedApp)에서 호출한다. 실패해도 예외를 던지지
// 않고 { ran, ok } 형태로만 돌려준다 - 호출부가 로그인/렌더링을 막지 않고 콘솔에만
// 기록하도록 만들기 위해서다(요구사항: 실패해도 앱 사용을 막지 않음).
export function runTrashSweepIfDue(user) {
  // 게스트(익명) 사용자는 자동 정리 전체에서 제외한다(요구사항) - 기존 수동 휴지통
  // 기능과 게스트 체험 종료 삭제 흐름만 사용한다.
  if (!user || !user.uid || user.isAnonymous === true) {
    return Promise.resolve({ ran: false, reason: "skipped-guest-or-signed-out" });
  }

  const existing = inflight.get(user.uid);
  if (existing) return existing;

  const task = (async () => {
    const settings = await getSettings(user.uid);
    const today = todayDateString();

    if (!shouldRunTrashSweep(settings, today)) {
      return { ran: false, reason: "already-done-today" };
    }

    let ok = true;

    try {
      await autoTrashCompletedTasks(user.uid, settings.completedTaskAutoTrashDays || 0, today);
    } catch (e) {
      console.error("[TrashSweep] auto-trash completed tasks failed:", e);
      ok = false;
    }

    try {
      await autoPurgeTrash(user.uid, today);
    } catch (e) {
      console.error("[TrashSweep] auto-purge trash failed:", e);
      ok = false;
    }

    // 두 단계 중 하나라도 실패하면 오늘 날짜를 기록하지 않는다 - 다음 진입 때 남은
    // 대상(이미 처리된 문서는 그대로 통과하고, 남은 것만)을 다시 시도할 수 있다.
    if (ok) {
      try {
        await markTrashSweepDone(user.uid);
      } catch (e) {
        console.error("[TrashSweep] marking sweep date failed:", e);
        ok = false;
      }
    }

    return { ran: true, ok };
  })()
    .catch((e) => {
      // 위에서 다루지 못한 예상치 못한 오류(예: getSettings 자체 실패)도 이 함수 밖으로
      // 던지지 않는다 - 호출부(App.jsx)의 렌더링/로그인 흐름을 절대 막지 않기 위해서다.
      console.error("[TrashSweep] unexpected failure:", e);
      return { ran: false, ok: false, reason: "unexpected-error" };
    })
    .finally(() => {
      inflight.delete(user.uid);
    });

  inflight.set(user.uid, task);
  return task;
}
