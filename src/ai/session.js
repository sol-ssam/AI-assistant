import { getGenerativeModel } from "firebase/ai";
import { getAIInstance } from "../firebase/ai";
import { TOOLS } from "./tools";
import { SYSTEM_INSTRUCTION } from "./systemInstruction";

// gemini-3.1-flash-lite: Gemini Developer API 무료 등급에서 사용 가능한(Blaze 요금제 불필요)
// 가장 가벼운 안정 모델이다. 자연어 의도 파악 + 함수 선택 정도의 작업에는 충분하고,
// 응답 속도가 빠르며 무료 사용량을 아끼기에도 유리하다.
const MODEL_NAME = "gemini-3.1-flash-lite";

export function startAssistantChat() {
  const model = getGenerativeModel(getAIInstance(), {
    model: MODEL_NAME,
    tools: TOOLS,
    systemInstruction: SYSTEM_INSTRUCTION,
  });
  return model.startChat();
}
