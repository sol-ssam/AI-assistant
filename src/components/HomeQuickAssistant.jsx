import { useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useGoogleCalendar } from "../contexts/GoogleCalendarContext";
import { startAssistantChat } from "../ai/session";
import { sendAssistantMessage } from "../ai/assistant";
import { tryLocalQuery } from "../ai/localQueries";
import { analyzeSensitiveText } from "../ai/sensitiveInfo";
import SensitiveInfoWarningModal from "./SensitiveInfoWarningModal";
import "./HomeQuickAssistant.css";

// Home 전용 "AI 비서에게 말하기" 카드. AssistantPage.jsx가 쓰는 것과 정확히 같은 호출
// 경로(tryLocalQuery → startAssistantChat → sendAssistantMessage)를 그대로 재사용한다 -
// Home 전용 AI 로직/엔진은 새로 만들지 않는다. 대화 세션(chatRef)은 이 컴포넌트
// 안에서만 유지되고 AssistantPage와 공유되지 않는다(이번 단계의 의도된 설계) - Home을
// 벗어났다 돌아오면 이 카드는 다시 마운트되며 새 세션으로 시작한다.
export default function HomeQuickAssistant() {
  const { user } = useAuth();
  const { getValidAccessToken, connect } = useGoogleCalendar();
  const chatRef = useRef(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUserText, setLastUserText] = useState(null);
  const [lastAssistantText, setLastAssistantText] = useState(null);
  // AssistantPage.jsx와 같은 전송 전 확인 대기 상태 - { text, categories } | null.
  const [sensitiveWarning, setSensitiveWarning] = useState(null);

  function getChat() {
    if (!chatRef.current) {
      chatRef.current = startAssistantChat();
    }
    return chatRef.current;
  }

  // AssistantPage.jsx와 같은 순서: 로컬 질의 확인 → (필요하면) 민감정보 검사 → 경고 →
  // 확인 후에만 실제 전송. 경고가 뜨는 동안에는 이전 결과(lastUserText/lastAssistantText/
  // error)를 건드리지 않는다(요구사항: 취소해도 이전 결과나 오류가 불필요하게 사라지지
  // 않아야 한다) - 그래서 이 값들은 실제로 새 결과가 확정되는 지점에서만 갱신한다.
  async function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading || sensitiveWarning) return;

    setLoading(true);

    let localAnswer = null;
    try {
      localAnswer = await tryLocalQuery(text, user.uid);
    } catch {
      setLoading(false);
      setInput("");
      setError("요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setLastUserText(text);
      setLastAssistantText(null);
      return;
    }

    if (localAnswer !== null) {
      setLoading(false);
      setInput("");
      setError(null);
      setLastUserText(text);
      setLastAssistantText(localAnswer);
      return;
    }

    // 외부 AI 호출 직전에만 민감정보를 검사한다 - 로컬 질의(위에서 이미 처리됨)는 원문을
    // 외부로 보내지 않으므로 대상이 아니다.
    setLoading(false);
    const analysis = analyzeSensitiveText(text);
    if (analysis.detected) {
      setSensitiveWarning({ text, categories: analysis.categories });
      return;
    }

    await proceedSend(text);
  }

  async function proceedSend(text) {
    setInput("");
    setError(null);
    setLastUserText(text);
    setLastAssistantText(null);
    setLoading(true);

    try {
      const chat = getChat();
      // AssistantPage.jsx와 동일하게, calendarHelpers는 여기서만 쓰이고 Gemini에는
      // 전달되지 않는다 - 실제 Calendar 호출은 tool executor가 이 함수를 통해 한다.
      const { text: replyText } = await sendAssistantMessage(chat, user.uid, text, {
        getValidAccessToken,
        connect,
      });
      setLastAssistantText(replyText || "요청을 처리했지만 답변을 만들지 못했습니다.");
    } catch {
      setError("요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  function handleSensitiveContinue() {
    const pending = sensitiveWarning;
    setSensitiveWarning(null);
    if (pending) proceedSend(pending.text);
  }

  function handleSensitiveCancel() {
    setSensitiveWarning(null);
  }

  return (
    <section className="home-card home-quick-assistant">
      <h2 className="home-card__title">✨ AI 비서에게 말하기</h2>

      {(lastUserText || lastAssistantText || error) && (
        <div className="home-quick-assistant__log">
          {lastUserText && (
            <p className="home-quick-assistant__msg home-quick-assistant__msg--user">{lastUserText}</p>
          )}
          {lastAssistantText && (
            <p className="home-quick-assistant__msg home-quick-assistant__msg--assistant">{lastAssistantText}</p>
          )}
          {error && <p className="home-quick-assistant__msg home-quick-assistant__msg--error">{error}</p>}
          {loading && <p className="home-quick-assistant__msg home-quick-assistant__msg--loading">생각하는 중…</p>}
        </div>
      )}

      <form className="home-quick-assistant__form" onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="일정이나 할 일을 말해보세요."
          disabled={loading || !!sensitiveWarning}
          aria-label="AI 비서에게 말하기"
        />
        <button type="submit" disabled={loading || !!sensitiveWarning || !input.trim()} aria-label="보내기">
          {loading ? "…" : "➤"}
        </button>
      </form>
      <p className="home-quick-assistant__hint">
        예: "오늘 일정 알려줘" · "이번 주 일정 알려줘" · "오늘 할 일 정리해줘" · "금요일까지 보고서 작성
        등록해줘"
      </p>

      <SensitiveInfoWarningModal
        open={!!sensitiveWarning}
        categories={sensitiveWarning?.categories ?? []}
        onContinue={handleSensitiveContinue}
        onCancel={handleSensitiveCancel}
      />
    </section>
  );
}
