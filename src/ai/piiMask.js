// Gemini(Gemini Developer API)로 텍스트를 보내기 전, 로컬에서 명확하게 식별 가능한
// 개인정보 패턴만 마스킹한다. 이 탐지가 완벽하다고 가정해서는 안 되며, 어디까지나
// "명확한 패턴"만 걸러내는 보조 안전장치다. UI의 안내 문구가 1차 방어선이다.

// category: 5-4단계의 민감정보 경고(ai/sensitiveInfo.js)가 같은 패턴을 재사용할 때 쓰는
// 사용자용 분류명이다. maskPII() 자체는 이 필드를 쓰지 않는다(기존 동작 그대로).
const PATTERNS = [
  // 한국 휴대폰 번호: 010-1234-5678, 01012345678, 010 1234 5678 등
  { regex: /01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/g, token: "[[PHONE]]", category: "연락처" },
  // 이메일 주소
  { regex: /[\w.+-]+@[\w-]+\.[\w.-]+/g, token: "[[EMAIL]]", category: "이메일 주소" },
  // 주민등록번호 형태: 6자리-7자리
  { regex: /\d{6}[-\s]?[1-4]\d{6}/g, token: "[[ID_NUMBER]]", category: "개인 식별정보" },
];

export function maskPII(text) {
  let masked = text;
  let matched = false;

  for (const { regex, token } of PATTERNS) {
    if (regex.test(masked)) {
      matched = true;
    }
    regex.lastIndex = 0;
    masked = masked.replace(regex, token);
  }

  return { masked, matched };
}

// ai/sensitiveInfo.js(analyzeSensitiveText)가 이 파일의 정규식을 그대로 재사용할 수 있게
// {regex, category} 쌍만 내보낸다 - 같은 판정 로직(휴대전화/이메일/주민등록번호)을 두 곳에
// 중복 구현하지 않기 위해서다. PATTERNS의 RegExp 인스턴스를 그대로 공유하지 않고
// source/flags로 새로 만들어 내보낸다 - 호출부가 lastIndex를 어떻게 다루든 maskPII()의
// 내부 상태와 절대 섞이지 않는다.
export function getPiiCategoryPatterns() {
  return PATTERNS.map(({ regex, category }) => ({ regex: new RegExp(regex.source, regex.flags), category }));
}
