import { TOOL_EXECUTORS } from "./toolExecutors";
import { maskPII } from "./piiMask";
import {
  todayDateString,
  todayWeekdayKorean,
  nowHourMinuteInSeoul,
} from "../utils/date";

// 모델이 함수 호출을 연달아 요청할 수 있는 최대 횟수.
// 무한 재시도를 막기 위한 상한선이며 자동 재시도는 하지 않는다.
const MAX_FUNCTION_HOPS = 4;

function buildDateContextLine() {
  const { hour, minute } = nowHourMinuteInSeoul();
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");

  return `[오늘: ${todayDateString()} (${todayWeekdayKorean()}), 현재시각 ${hh}:${mm}]`;
}

// chat: startAssistantChat()으로 만든 세션
// uid: 현재 로그인한 사용자
// userText: 사용자가 입력한 원문 자연어
// calendarHelpers: { getValidAccessToken, connect } (선택) - Google Calendar 동기화가
//   필요한 도구(addEvent 등)에서만 사용한다. Gemini에는 절대 전달되지 않으며, access
//   token 값 자체도 함수 인자(call.args)에 포함되지 않는다 - 실제 Calendar API 호출은
//   이 클라이언트 코드 안에서만 이루어진다.
export async function sendAssistantMessage(chat, uid, userText, calendarHelpers) {
  const { masked, matched } = maskPII(userText);
  const message = `${buildDateContextLine()}\n${masked}`;

  let result = await chat.sendMessage(message);
  const calledTools = [];

  for (let hop = 0; hop < MAX_FUNCTION_HOPS; hop++) {
    const functionCalls = result.response.functionCalls?.() || [];

    if (functionCalls.length === 0) break;

    const responseParts = [];

    for (const call of functionCalls) {
      console.log("call.id:", call.id, "/ call.name:", call.name);
      const executor = TOOL_EXECUTORS[call.name];
      let output;

      if (!executor) {
        output = {
          success: false,
          reason: "지원하지 않는 기능입니다.",
        };
      } else {
        try {
          // eslint-disable-next-line no-await-in-loop
          output = await executor(call.args || {}, uid, calendarHelpers);
        } catch {
          output = {
            success: false,
            reason: "처리 중 오류가 발생했습니다.",
          };
        }
      }

      calledTools.push(call.name);

      responseParts.push({
        functionResponse: {
          name: call.name,
          id: call.id,
          response: output,
        },
      });
    }

    // 함수 실행 결과를 Gemini에 다시 전달
    // eslint-disable-next-line no-await-in-loop
    result = await chat.sendMessage(responseParts);
  }

  return {
    text: result.response.text() || "",
    toolCalls: calledTools,
    piiMasked: matched,
  };
}