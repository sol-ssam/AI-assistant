import { getGenerativeModel } from "firebase/ai";
import { getAIInstance } from "../firebase/ai";
import { WRITER_SYSTEM_INSTRUCTION } from "./writerInstruction";
import { maskPII } from "./piiMask";

// AI 일정 비서(session.js)와 같은 모델을 쓰되, 이 값은 session.js의 MODEL_NAME과 완전히
// 분리된 상수다 - 모델을 바꿀 때는 두 파일을 함께 수정해야 한다. 일정 비서 쪽 모델명/동작은
// 이 파일에서 절대 건드리지 않는다.
const MODEL_NAME = "gemini-3.1-flash-lite";

// "other"(기타)는 여기 없다 - 그 경우 사용자가 직접 입력한 유형명(customTypeLabel)을
// 그대로 "작성 형식"에 보낸다. "기타"라는 단어 자체는 AI에 전달하지 않는다(요구사항).
const TYPE_LABEL = { email: "이메일", messenger: "메신저", notice: "공지" };
const AUDIENCE_LABEL = { manager: "상급자", peer: "동료", external: "외부인", group: "여러 명" };
const TONE_LABEL = { polite: "정중하게", neutral: "일반적으로", friendly: "친근하게", firm: "단호하게" };
const LENGTH_LABEL = { short: "짧게", medium: "보통", long: "자세히" };

function resolveTypeLabel(type, customTypeLabel) {
  if (type === "other") return (customTypeLabel || "").trim() || "사용자 지정 유형";
  return TYPE_LABEL[type] ?? type;
}

function buildUserPrompt({ typeLabel, audience, tone, length, content, instruction, previousDraft }) {
  const lines = [
    `작성 형식: ${typeLabel}`,
    `상대: ${AUDIENCE_LABEL[audience] ?? audience}`,
    `말투: ${TONE_LABEL[tone] ?? tone}`,
    `길이: ${LENGTH_LABEL[length] ?? length}`,
    "",
    "전달할 핵심 내용(사실 관계의 기준. 여기 없는 사실은 지어내지 않는다):",
    content || "(없음)",
  ];

  if (previousDraft) {
    lines.push("", "이전 초안:", previousDraft);
  }

  if (instruction) {
    lines.push("", "이번 요청에서 반영할 수정 지시:", instruction);
  }

  lines.push(
    "",
    previousDraft
      ? "위 이전 초안을 수정 지시에 맞게 다시 써줘. 핵심 내용에 없는 사실은 새로 지어내지 마."
      : "위 조건에 맞는 새 초안을 써줘."
  );

  return lines.join("\n");
}

// AI 응답을 [제목]/[본문] 표시 기준으로 나눈다. 모델이 지침대로 표시를 지켰다면 title/body가
// 정확히 분리되고, 표시를 일부 빠뜨렸다면 아래 fallback으로 내용 자체는 보존한다(결과가
// 화면에서 통째로 사라지지 않게 하는 것이 목적 - 완벽한 파싱이 목적이 아니다).
// raw(모델이 실제로 반환한 원문 전체)는 title/body로 나눈 뒤에도 그대로 함께 돌려준다 -
// "다듬기" 버튼들이 다음 호출의 previousDraft로 이 원문을 그대로 재사용하기 때문이다.
function parseDraftResponse(rawText, type) {
  const text = (rawText || "").trim();
  if (!text) return { title: "", body: "", raw: text };

  const titleMatch = text.match(/\[제목\]\s*\n?([\s\S]*?)(?=\n?\[본문\]|$)/);
  const bodyMatch = text.match(/\[본문\]\s*\n?([\s\S]*)$/);

  if (titleMatch || bodyMatch) {
    return {
      title: (titleMatch?.[1] ?? "").trim(),
      body: (bodyMatch?.[1] ?? "").trim(),
      raw: text,
    };
  }

  // Fallback: 모델이 표시를 지키지 않은 경우. 메신저는 원래 본문뿐이므로 전체를 본문으로
  // 삼고, 이메일/공지는 첫 줄이 짧은 제목처럼 보이면 그것을 제목으로, 나머지를 본문으로
  // 나눈다. 어느 쪽이든 원문 전체는 title/body 중 하나에, 그리고 raw에는 항상 전체가 남는다.
  if (type === "messenger") {
    return { title: "", body: text, raw: text };
  }

  const lines = text.split("\n");
  const firstLine = lines[0]?.trim() ?? "";
  if (lines.length > 1 && firstLine.length > 0 && firstLine.length <= 80) {
    return { title: firstLine, body: lines.slice(1).join("\n").trim(), raw: text };
  }

  return { title: "", body: text, raw: text };
}

// 작성 도우미의 유일한 AI 호출 지점. 초기 생성과 다듬기(재작성/말투 변경/형식 변환)를
// 전부 이 함수 하나로 처리한다 - instruction/previousDraft가 있으면 다듬기, 없으면
// 새 초안 생성으로 프롬프트만 달라질 뿐 호출 구조는 동일하다.
//
// 이 함수는:
// - startChat()으로 세션을 만들지 않고 매번 generateContent()로 1회성 호출만 한다
//   (대화 세션을 영구 보관하지 않는다는 요구사항).
// - tools를 전달하지 않는다 - 이 모델에는 함수 호출 능력 자체가 없으므로 Firestore나
//   Google Calendar에 접근할 수 없다.
// - content(사용자가 입력한 핵심 내용)만 maskPII()를 거쳐 전달한다. previousDraft는
//   AI가 이미 생성한 결과이므로(마스킹된 content만 보고 만들어졌으므로) 다시 마스킹하지
//   않는다.
// - type이 "other"(기타)면 customTypeLabel(사용자가 직접 입력한 유형명)을 함께 받아
//   "작성 형식"에 그 실제 유형명을 그대로 전달한다 - "기타"라는 단어만 보내지 않는다.
export async function generateDraft({
  type,
  customTypeLabel,
  audience,
  tone,
  length,
  content,
  instruction,
  previousDraft,
}) {
  const trimmedContent = (content || "").trim();
  const { masked, matched } = maskPII(trimmedContent);
  const typeLabel = resolveTypeLabel(type, customTypeLabel);

  const model = getGenerativeModel(getAIInstance(), {
    model: MODEL_NAME,
    systemInstruction: WRITER_SYSTEM_INSTRUCTION,
  });

  const prompt = buildUserPrompt({ typeLabel, audience, tone, length, content: masked, instruction, previousDraft });

  const result = await model.generateContent(prompt);
  const rawText = result.response.text() || "";

  return { ...parseDraftResponse(rawText, type), piiMasked: matched };
}
