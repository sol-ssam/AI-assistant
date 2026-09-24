// 5-4단계: AI로 전송되기 전, "전송 여부를 사용자가 다시 확인해야 할 만큼 민감해 보이는
// 입력인지"만 판정하는 보조 유틸리티. 실제 마스킹(maskPII)과는 역할이 다르다 -
// 이 파일은 아무것도 가리거나 바꾸지 않고, 감지된 "분류명"만 돌려준다.
//
// 원칙(요구사항):
// - 브라우저 안에서만 동작하는 순수 함수다. 네트워크 호출도, Firestore 저장도, 콘솔
//   출력도 하지 않는다. 호출부(AssistantPage/HomeQuickAssistant/WriterPage)도 이 함수의
//   반환값(분류명 배열)만 다루고 원문을 로그로 남기지 않는다.
// - 오탐을 줄이기 위해 "명확한 표기"만 감지한다 - 일반적인 단어 하나만으로는 감지하지
//   않는다(예: "프로젝트 회의"는 감지하지 않지만 "프로젝트명: ..."은 감지한다).
import { getPiiCategoryPatterns } from "./piiMask";

// maskPII()가 이미 자동으로 가려주는 명확한 개인정보 패턴(연락처/이메일/주민등록번호)은
// getPiiCategoryPatterns()로 그대로 재사용한다 - 같은 정규식을 여기 다시 적지 않는다.

// 회사·업무 민감정보 - "라벨: 값" 형태로 명확히 구조화된 표기와, 그 자체로 이미 구체적인
// 법인/인증 관련 표기만 감지한다. "회사", "프로젝트", "고객", "계약" 같은 일반 단어만
// 들어간 문장(예: "프로젝트 회의를 내일로 옮겨줘")은 어떤 패턴에도 걸리지 않는다.
const BUSINESS_SENSITIVE_PATTERNS = [
  /회사명\s*[:：]\s*\S+/,
  /프로젝트명\s*[:：]\s*\S+/,
  /고객명\s*[:：]\s*\S+/,
  /거래처명\s*[:：]\s*\S+/,
  /담당자명\s*[:：]\s*\S+/,
  /비밀번호\s*[:：]\s*\S+/,
  /인증번호\s*[:：]\s*\S+/,
  /API\s*키\s*[:：]\s*\S+/i,
  /API[_ ]?KEY/i,
  /access[_ ]?token/i,
  /\bsecret\b/i,
  /계약금액\s*[:：]\s*\S+/,
  /견적금액\s*[:：]\s*\S+/,
  /주식회사/,
  /\(주\)/,
  /㈜/,
];

const BUSINESS_CATEGORY = "회사·프로젝트 정보";

// regex.test()는 /g 플래그가 있으면 lastIndex를 옮겨 두므로, 같은 정규식 인스턴스를 여러
// 텍스트에 다시 쓰기 전에 반드시 되돌려야 한다(maskPII()도 같은 이유로 이렇게 한다).
function matchesPattern(regex, text) {
  if (!regex.global) return regex.test(text);
  regex.lastIndex = 0;
  const result = regex.test(text);
  regex.lastIndex = 0;
  return result;
}

// text에서 감지된 민감정보 "분류명" 목록만 돌려준다. 실제로 어떤 값이 어디서 매치됐는지는
// 절대 반환하지 않는다 - 호출부(경고창)는 categories만 보여주면 된다.
//
// 반환: { detected: boolean, categories: string[] }
export function analyzeSensitiveText(text) {
  const value = typeof text === "string" ? text : "";
  const categories = [];

  if (value) {
    for (const { regex, category } of getPiiCategoryPatterns()) {
      if (matchesPattern(regex, value) && !categories.includes(category)) {
        categories.push(category);
      }
    }
    if (BUSINESS_SENSITIVE_PATTERNS.some((regex) => matchesPattern(regex, value))) {
      categories.push(BUSINESS_CATEGORY);
    }
  }

  return { detected: categories.length > 0, categories };
}
