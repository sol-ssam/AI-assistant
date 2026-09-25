import { getAI, GoogleAIBackend } from "firebase/ai";
import { app } from "./config";

// 중요: GoogleAIBackend는 "Gemini Developer API" 백엔드를 사용한다.
// 이는 Spark(무료) 요금제에서 그대로 쓸 수 있는 백엔드다.
// VertexAIBackend(Agent Platform Gemini API)는 Blaze(유료) 요금제가 필요하므로 사용하지 않는다.
//
// getAI(app, ...)를 모듈 최상위에서 바로 실행하지 않고 lazy singleton으로 감싼다 -
// ES 모듈은 import된 파일을 실행 전에 먼저 평가하므로, 이 파일이 최상위에서 getAI()를
// 실행했다면 main.jsx의 initAppCheck() 호출보다 먼저 실행될 수 있었다. 아래처럼 실제
// AI 기능이 처음 쓰이는 시점(getAIInstance() 최초 호출)까지 생성을 미루면, 그 시점은
// 항상 React 렌더링 이후(= initAppCheck() 완료 이후)가 된다.
let aiInstance = null;

export function getAIInstance() {
  if (!aiInstance) {
    aiInstance = getAI(app, {
      backend: new GoogleAIBackend(),
      useLimitedUseAppCheckTokens: true,
    });
  }
  return aiInstance;
}
