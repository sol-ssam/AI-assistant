import { useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useGoogleCalendar } from "../contexts/GoogleCalendarContext";
import { startAssistantChat } from "../ai/session";
import { sendAssistantMessage } from "../ai/assistant";
import { tryLocalQuery } from "../ai/localQueries";
import { analyzeSensitiveText } from "../ai/sensitiveInfo";
import SensitiveInfoWarningModal from "../components/SensitiveInfoWarningModal";
import "./AssistantPage.css";

// 대화가 하나도 없는 초기 상태에서만 보여주는 quick prompt다. 새 AI 기능이 아니라 기존
// 전송 흐름(sendText)을 그대로 트리거하는 UI shortcut일 뿐이다.
const QUICK_PROMPTS = [
  "오늘 일정 알려줘",
  "이번 주 일정 알려줘",
  "오늘 할 일 정리해줘",
  "금요일까지 보고서 작성 등록해줘",
];

const AI_UNAVAILABLE_TEXT =
  "현재 AI 비서 기능을 사용할 수 없습니다. 일정과 업무의 직접 관리 기능은 정상적으로 사용할 수 있습니다.";

export default function AssistantPage() {
  const { user } = useAuth();
  const { getValidAccessToken, connect } = useGoogleCalendar();
  const chatRef = useRef(null);
  const bottomRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  // 전송 전 민감정보 확인 대기 상태 - { text, categories } | null. 감지된 텍스트를 여기
  // 잠깐 들고 있다가 "확인 후 계속"을 눌렀을 때만 실제 전송(proceedSend)으로 넘긴다.
  // Firestore/localStorage/sessionStorage 어디에도 저장하지 않는다(요구사항).
  const [sensitiveWarning, setSensitiveWarning] = useState(null);

  function getChat() {
    if (!chatRef.current) {
      chatRef.current = startAssistantChat();
    }
    return chatRef.current;
  }

  // 새 메시지가 추가되거나 로딩 상태가 바뀔 때마다 가장 최근 대화가 보이도록 스크롤한다.
  // 기존에는 이런 자동 스크롤 자체가 없었다 - 채팅 화면다운 최소한의 동작으로 새로 추가했다.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  // 처리 순서(요구사항): 1) 입력 2) 로컬 질의 확인 3) 로컬이면 즉시 처리 4) 외부 AI가
  // 필요하면 민감정보 검사 5) 감지 시 경고창 6) "확인 후 계속"을 눌렀을 때만
  // sendAssistantMessage() 호출. 로컬 질의는 원문을 외부로 보내지 않으므로 검사 대상이
  // 아니다. 경고가 확인되기 전까지는 메시지를 대화 내역에 추가하거나, 세션을 만들거나,
  // 입력창을 비우거나, 로딩을 표시하지 않는다(요구사항) - 그래서 이 단계들은 모두 이
  // 함수 안에서 "커밋 지점"(local 답변 확정, catch, 또는 민감정보 미검출 확정) 이후에만
  // 일어난다.
  async function sendText(text) {
    if (!text || loading || sensitiveWarning) return;
    setLoading(true);

    let localAnswer = null;
    try {
      localAnswer = await tryLocalQuery(text, user.uid);
    } catch {
      setLoading(false);
      setInput("");
      setMessages((prev) => [
        ...prev,
        { role: "user", text },
        { role: "assistant", text: AI_UNAVAILABLE_TEXT, error: true },
      ]);
      return;
    }

    if (localAnswer !== null) {
      setLoading(false);
      setInput("");
      setMessages((prev) => [...prev, { role: "user", text }, { role: "assistant", text: localAnswer, local: true }]);
      return;
    }

    // 여기부터는 외부 AI로 원문이 전송될 수 있는 경로다 - 전송 직전에만 민감정보를
    // 검사한다(탐지는 브라우저 안에서만, Firestore/콘솔에 남기지 않는다).
    setLoading(false);
    const analysis = analyzeSensitiveText(text);
    if (analysis.detected) {
      setSensitiveWarning({ text, categories: analysis.categories });
      return;
    }

    await proceedSend(text);
  }

  // 기존 sendAssistantMessage 호출 흐름 그대로다(AI 호출 방식/순서/session은 바뀌지
  // 않았다) - 민감정보 감지가 없었거나("확인 후 계속") 감지 후 사용자가 계속하기를
  // 선택했을 때만 이 함수가 실행된다.
  async function proceedSend(text) {
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setLoading(true);

    try {
      const chat = getChat();
      // calendarHelpers는 addEvent 같은 도구가 Google Calendar API를 호출할 때만 쓰인다.
      // Gemini에는 이 객체나 access token이 전달되지 않는다 - Gemini는 addToCalendar
      // 같은 의도만 함수 인자로 넘기고, 실제 토큰 조회/Calendar 호출은 여기 클라이언트
      // 코드에서 이루어진다.
      const { text: replyText, toolCalls, piiMasked } = await sendAssistantMessage(
        chat,
        user.uid,
        text,
        { getValidAccessToken, connect }
      );
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: replyText || "요청을 처리했지만 답변을 만들지 못했습니다.",
          toolCalls,
          piiMasked,
        },
      ]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", text: AI_UNAVAILABLE_TEXT, error: true }]);
    } finally {
      setLoading(false);
    }
  }

  // "확인 후 계속" - 감지 당시의 원문 그대로 기존 흐름을 이어간다(휴대전화/이메일/주민
  // 등록번호는 sendAssistantMessage 내부의 maskPII()가 여전히 가려준다).
  function handleSensitiveContinue() {
    const pending = sensitiveWarning;
    setSensitiveWarning(null);
    if (pending) proceedSend(pending.text);
  }

  // "입력 수정"(또는 바깥 클릭/Escape) - AI를 호출하지 않고 경고창만 닫는다. input을
  // 건드리지 않으므로 사용자가 작성한 내용이 그대로 남는다.
  function handleSensitiveCancel() {
    setSensitiveWarning(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading || sensitiveWarning) return;
    await sendText(text);
  }

  return (
    <div className="assistant-page">
      <header className="assistant-page__head">
        <h1 className="assistant-page__title">AI 비서</h1>
        <p className="assistant-page__desc">
          무엇이든 편하게 말씀해보세요. 일정과 업무를 AI 업무 비서가 함께 정리해드려요.
        </p>
        <p className="assistant-page__notice">
          🔒 회사 기밀이나 고객 개인정보 등 공개가 제한된 내용은 입력하지 말아 주세요.
        </p>
      </header>

      <div className="assistant-page__transcript">
        {messages.length === 0 ? (
          <div className="assistant-page__empty">
            <span className="assistant-page__empty-mark" aria-hidden="true">
              ✨
            </span>
            <p className="assistant-page__empty-text">
              아직 대화가 없어요. 아래에서 편하게 말을 걸어보세요.
            </p>
            <div className="assistant-page__quick-prompts">
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className="assistant-page__quick-prompt"
                  onClick={() => sendText(p)}
                  disabled={loading || !!sensitiveWarning}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`bubble bubble--${m.role}${m.error ? " bubble--error" : ""}`}>
              <p className="bubble__text">{m.text}</p>
              {m.toolCalls && m.toolCalls.length > 0 && (
                <p className="bubble__meta">사용한 기능: {m.toolCalls.join(", ")}</p>
              )}
              {m.piiMasked && <p className="bubble__meta">일부 개인정보로 보이는 내용은 전송 전에 가려졌어요.</p>}
            </div>
          ))
        )}
        {loading && <p className="assistant-page__status">AI 업무 비서가 확인하고 있어요…</p>}
        <div ref={bottomRef} />
      </div>

      <form className="assistant-page__form" onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="일정이나 할 일을 말해보세요."
          disabled={loading || !!sensitiveWarning}
          aria-label="AI 비서에게 말하기"
        />
        <button
          type="submit"
          className="assistant-page__send"
          disabled={loading || !!sensitiveWarning || !input.trim()}
          aria-label="보내기"
        >
          ➤
        </button>
      </form>
      <p className="assistant-page__hint">
        예: &ldquo;금요일까지 보고서 작성 등록해줘&rdquo; · &ldquo;9월 15일 구글 캘린더 일정
        가져와줘&rdquo;
      </p>

      <SensitiveInfoWarningModal
        open={!!sensitiveWarning}
        categories={sensitiveWarning?.categories ?? []}
        onContinue={handleSensitiveContinue}
        onCancel={handleSensitiveCancel}
      />
    </div>
  );
}
