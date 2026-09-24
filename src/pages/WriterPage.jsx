import { useEffect, useRef, useState } from "react";
import { generateDraft } from "../ai/writer";
import { analyzeSensitiveText } from "../ai/sensitiveInfo";
import SensitiveInfoWarningModal from "../components/SensitiveInfoWarningModal";
import "../pages/crud-shared.css";
import "./WriterPage.css";

const MAX_CONTENT_LENGTH = 3000;
const MAX_CUSTOM_TYPE_LENGTH = 30;

const TYPE_OPTIONS = [
  { value: "email", label: "이메일" },
  { value: "messenger", label: "메신저" },
  { value: "notice", label: "공지" },
  { value: "other", label: "기타" },
];
const AUDIENCE_OPTIONS = [
  { value: "manager", label: "상급자" },
  { value: "peer", label: "동료" },
  { value: "external", label: "외부인" },
  { value: "group", label: "여러 명" },
];
const TONE_OPTIONS = [
  { value: "polite", label: "정중하게" },
  { value: "neutral", label: "일반적으로" },
  { value: "friendly", label: "친근하게" },
  { value: "firm", label: "단호하게" },
];
const LENGTH_OPTIONS = [
  { value: "short", label: "짧게" },
  { value: "medium", label: "보통" },
  { value: "long", label: "자세히" },
];

// 예시 버튼 - 누르면 이 문구 그대로가 "전달할 핵심 내용" 입력창에 채워질 뿐, AI를
// 호출하지는 않는다(요구사항). 결과가 이미 있으면(사용법을 이미 익혔다고 보고) 더 이상
// 보여주지 않는다.
const CONTENT_EXAMPLES = [
  "보고서 제출이 하루 늦어질 것 같다고 알리기",
  "회의 시간이 변경됐다고 안내하기",
  "요청한 자료를 정중하게 다시 요청하기",
  "프로젝트 진행 상황 간단히 보고하기",
];

// 다듬기/형식 변환 버튼이 쓰는 고정 지시문. 사용자가 입력한 자유 텍스트가 아니라 이
// 코드가 미리 정해 둔 문구이므로 별도 마스킹이 필요 없다(마스킹 대상은 사용자의 "핵심
// 내용"뿐 - writer.js 참고).
// "다시 작성하기"는 별도 instruction 없이 runGenerate()를 그대로 다시 호출한다(같은
// 조건으로 새 초안을 생성) - 그래서 이 맵에는 다듬기/형식 변환 버튼의 지시문만 있다.
const REFINE_INSTRUCTIONS = {
  polite: "전체적으로 더 정중한 말투로 다시 써줘.",
  concise: "핵심 사실은 빠뜨리지 말고 문장을 더 간결하게 줄여줘.",
  soft: "표현을 더 부드럽고 완곡하게 다듬어줘.",
  firm: "요청 사항이 분명히 전달되도록 더 단호한 어조로 다시 써줘. 무례하거나 공격적인 표현은 쓰지 마.",
  toEmail: "이 초안을 이메일 형식으로 바꿔줘. 제목과 본문을 구분해줘.",
  toMessenger: "이 초안을 사내 메신저에 보낼 수 있도록 짧고 자연스럽게 줄여줘. 제목이나 서명은 넣지 마.",
};

// 제목 블록을 보여줄지 여부 - 메신저는 항상 본문만. "기타"는 AI가 그 유형에 제목이
// 자연스럽지 않다고 판단해 제목을 비워 둘 수 있으므로(writerInstruction.js 참고), 제목이
// 실제로 있을 때만 보여준다. 이메일/공지는 원래 제목이 있는 형식이므로, 비어 있어도
// "(제목이 비어 있어요)" 안내와 함께 항상 블록을 보여준다(무언가 잘못됐을 때 알아채기 쉽게).
function hasTitleBlock(result) {
  if (!result) return false;
  if (result.type === "messenger") return false;
  if (result.type === "other") return !!result.title;
  return true;
}

// 전체 복사 형식 - 제목이 있는 결과는 "제목: ..." 한 줄 뒤 빈 줄, 제목이 없는 결과(메신저,
// 또는 제목 없이 작성된 기타 유형)는 본문만. 이 함수가 만드는 문자열에는 UI 안내 문구나
// 보안 경고를 절대 포함하지 않는다(요구사항).
function buildFullCopyText(result) {
  if (!result) return "";
  if (!hasTitleBlock(result)) return result.body;
  return `제목: ${result.title}\n\n${result.body}`;
}

export default function WriterPage() {
  const [type, setType] = useState("email");
  // "기타" 선택 시 직접 입력하는 유형명. type을 바꿔도 이 값 자체는 지우지 않는다 -
  // 다른 유형으로 갔다가 "기타"로 돌아오면 입력했던 값이 그대로 남아 있어야 한다(요구사항).
  const [customType, setCustomType] = useState("");
  const [audience, setAudience] = useState("manager");
  const [tone, setTone] = useState("polite");
  const [length, setLength] = useState("medium");
  const [content, setContent] = useState("");

  const [result, setResult] = useState(null); // { type, title, body, piiMasked }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // 전송 전 민감정보 확인 대기 상태 - { options, categories } | null. options는 runGenerate에
  // 전달됐던 그 인자({instruction, previousDraft, overrideType})를 그대로 들고 있다가
  // "확인 후 계속"을 누르면 executeGenerate(options)로 그대로 넘긴다.
  const [pendingGenerate, setPendingGenerate] = useState(null);

  const [copyStatus, setCopyStatus] = useState(null); // { key: 'title'|'body'|'all', ok: boolean }
  const copyTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const trimmedContent = content.trim();
  const trimmedCustomType = customType.trim();
  // 민감정보 확인창이 떠 있는 동안에는 로딩 중과 똑같이 모든 조작(옵션 변경, 생성/다듬기
  // 버튼)을 막는다 - 확인 대기 중에 type 등을 바꾸면 pendingGenerate에 담아 둔
  // options(overrideType 등)와 그 사이 바뀐 화면 상태가 어긋날 수 있기 때문이다.
  const busy = loading || !!pendingGenerate;
  const canGenerate = trimmedContent.length > 0 && !busy && (type !== "other" || trimmedCustomType.length > 0);

  // 초기 생성과 다듬기(재작성/말투 변경/형식 변환)가 전부 이 함수 하나를 거친다.
  // overrideType이 있으면(형식 변환 버튼) 그 형식으로 결과를 만들고 선택 UI도 함께
  // 그 형식으로 맞춘다 - 이후 "다시 작성하기" 등도 바뀐 형식을 그대로 이어서 쓴다.
  //
  // 5-4단계: 실제 AI 호출(executeGenerate) 전에 "사용자가 직접 입력한" 텍스트만 민감정보
  // 검사를 한다 - previousDraft(AI가 만든 이전 초안)는 검사하지 않는다(요구사항: AI 생성
  // 결과 자체만으로 반복 경고하지 않음). 감지되면 경고창을 띄우고, 이 호출 자체는 여기서
  // 끝난다(같은 클릭 안에서 즉시 재검사해 루프가 생기지 않는다) - "확인 후 계속"을 눌러야만
  // executeGenerate가 실행된다.
  async function runGenerate(options = {}) {
    const { previousDraft } = options;
    if (busy) return;
    if (!previousDraft && trimmedContent.length === 0) return;

    const effectiveType = options.overrideType || type;
    if (effectiveType === "other" && trimmedCustomType.length === 0) return;

    const textsToCheck = effectiveType === "other" ? `${trimmedContent}\n${trimmedCustomType}` : trimmedContent;
    const analysis = analyzeSensitiveText(textsToCheck);
    if (analysis.detected) {
      setPendingGenerate({ options, categories: analysis.categories });
      return;
    }

    await executeGenerate(options);
  }

  // 기존 generateDraft() 호출 흐름 그대로다(내부 maskPII() 적용도 그대로 유지된다) -
  // 민감정보 감지가 없었거나 감지 후 사용자가 "확인 후 계속"을 선택했을 때만 실행된다.
  async function executeGenerate({ instruction, previousDraft, overrideType } = {}) {
    const effectiveType = overrideType || type;
    if (effectiveType === "other" && trimmedCustomType.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const draft = await generateDraft({
        type: effectiveType,
        customTypeLabel: effectiveType === "other" ? trimmedCustomType : undefined,
        audience,
        tone,
        length,
        content: trimmedContent,
        instruction,
        previousDraft,
      });
      setResult({ type: effectiveType, ...draft });
      if (overrideType) setType(overrideType);
    } catch {
      // 내부 오류 원문이나 사용자 입력 원문은 절대 로그로 남기지 않는다 - 안내 문구만 표시한다.
      setError("현재 작성 도우미를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  function handleSensitiveContinue() {
    const pending = pendingGenerate;
    setPendingGenerate(null);
    if (pending) executeGenerate(pending.options);
  }

  function handleSensitiveCancel() {
    setPendingGenerate(null);
  }

  async function handleCopy(key, text) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus({ key, ok: true });
    } catch {
      setCopyStatus({ key, ok: false });
    } finally {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopyStatus(null), 1600);
    }
  }

  function copyLabel(key, defaultLabel) {
    if (copyStatus?.key !== key) return defaultLabel;
    return copyStatus.ok ? "복사했습니다" : "복사 실패";
  }

  function renderChipGroup(label, options, value, onChange) {
    return (
      <div className="writer-field">
        <span className="writer-field__label">{label}</span>
        <div className="writer-chip-row" role="group" aria-label={label}>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={"writer-chip" + (value === opt.value ? " writer-chip--active" : "")}
              aria-pressed={value === opt.value}
              onClick={() => onChange(opt.value)}
              disabled={busy}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="writer-page">
      <header className="writer-page__head">
        <h1 className="writer-page__title">작성 도우미</h1>
        <p className="writer-page__desc">
          이메일, 메신저, 공지 초안을 만들어 드려요. 자동으로 전송되지 않으니 검토한 뒤 직접
          복사해서 사용하세요.
        </p>
      </header>

      <div className="writer-page__layout">
        <section className="writer-card writer-page__form-card">
          {renderChipGroup("작성 유형", TYPE_OPTIONS, type, setType)}

          {type === "other" && (
            <div className="writer-field">
              <label htmlFor="writer-custom-type" className="writer-field__label">
                작성 유형 직접 입력
              </label>
              <input
                id="writer-custom-type"
                className="writer-input"
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
                maxLength={MAX_CUSTOM_TYPE_LENGTH}
                placeholder="예: 보고문, 요청문, 안내문"
                disabled={busy}
                aria-required="true"
              />
            </div>
          )}

          {renderChipGroup("상대", AUDIENCE_OPTIONS, audience, setAudience)}
          {renderChipGroup("말투", TONE_OPTIONS, tone, setTone)}
          {renderChipGroup("길이", LENGTH_OPTIONS, length, setLength)}

          <div className="writer-field">
            <div className="writer-field__label-row">
              <label htmlFor="writer-content">전달할 핵심 내용</label>
              <span className="writer-field__count">
                {content.length} / {MAX_CONTENT_LENGTH}
              </span>
            </div>
            <textarea
              id="writer-content"
              className="writer-textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={MAX_CONTENT_LENGTH}
              rows={6}
              placeholder="예: 보고서 제출이 하루 늦어질 것 같다고 알려야 해요."
              disabled={busy}
              aria-required="true"
            />
            <p className="writer-field__warning">
              🔒 회사 기밀, 고객 개인정보, 비밀번호, 인증번호 및 외부 공개가 제한된 내용은 입력하지
              마세요.
            </p>
          </div>

          {!result && !error && (
            <div className="writer-examples">
              <span className="writer-field__label">예시로 시작하기</span>
              <div className="writer-examples__list">
                {CONTENT_EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    className="writer-example-btn"
                    onClick={() => setContent(example)}
                    disabled={busy}
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="writer-page__generate-row">
            <button type="button" className="btn" onClick={() => runGenerate()} disabled={!canGenerate}>
              초안 만들기
            </button>
          </div>
        </section>

        <section className="writer-card writer-page__result-card">
          {loading && <p className="writer-loading">초안을 작성하고 있어요…</p>}

          {!loading && error && (
            <p className="writer-error" role="alert">
              {error}
            </p>
          )}

          {!loading && !error && !result && (
            <p className="writer-result-empty">왼쪽에서 핵심 내용을 입력하고 초안 만들기를 눌러 보세요.</p>
          )}

          {!loading && !error && result && (
            <div className="writer-result">
              {result.piiMasked && (
                <p className="writer-result__pii-note">
                  일부 개인정보로 보이는 내용은 AI 전송 전에 가려졌습니다.
                </p>
              )}

              {hasTitleBlock(result) && (
                <div className="writer-result__block">
                  <div className="writer-result__block-head">
                    <span className="writer-result__block-label">제목</span>
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      onClick={() => handleCopy("title", result.title)}
                    >
                      {copyLabel("title", "제목 복사")}
                    </button>
                  </div>
                  <p className="writer-result__text">{result.title || "(제목이 비어 있어요)"}</p>
                </div>
              )}

              <div className="writer-result__block">
                <div className="writer-result__block-head">
                  <span className="writer-result__block-label">본문</span>
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    onClick={() => handleCopy("body", result.body)}
                  >
                    {copyLabel("body", "본문 복사")}
                  </button>
                </div>
                <p className="writer-result__text">{result.body}</p>
              </div>

              <div className="writer-page__generate-row">
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={() => handleCopy("all", buildFullCopyText(result))}
                >
                  {copyLabel("all", "전체 복사")}
                </button>
              </div>

              {/* 6단계: AI 생성 중이거나 민감정보 확인창이 열려 있을 때는(busy) 함수
                  내부 가드(runGenerate의 if (busy) return;)뿐 아니라 버튼 자체도
                  disabled로 만든다 - 클릭 불가 상태가 눈에 보이지 않는 문제를 보완한다
                  (요구사항). 이메일/메신저 변환 버튼은 기존의 "이미 그 형식임" 조건과
                  busy 조건을 함께 확인한다. */}
              <div className="writer-refine-row" role="group" aria-label="초안 다듬기">
                <button type="button" className="btn btn--ghost btn--small" onClick={() => runGenerate()} disabled={busy}>
                  다시 작성하기
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={() => runGenerate({ instruction: REFINE_INSTRUCTIONS.polite, previousDraft: result.raw })}
                  disabled={busy}
                >
                  더 정중하게
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={() => runGenerate({ instruction: REFINE_INSTRUCTIONS.concise, previousDraft: result.raw })}
                  disabled={busy}
                >
                  더 간결하게
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={() => runGenerate({ instruction: REFINE_INSTRUCTIONS.soft, previousDraft: result.raw })}
                  disabled={busy}
                >
                  더 부드럽게
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={() => runGenerate({ instruction: REFINE_INSTRUCTIONS.firm, previousDraft: result.raw })}
                  disabled={busy}
                >
                  더 단호하게
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={() =>
                    runGenerate({
                      instruction: REFINE_INSTRUCTIONS.toEmail,
                      previousDraft: result.raw,
                      overrideType: "email",
                    })
                  }
                  disabled={busy || result.type === "email"}
                >
                  이메일로 바꾸기
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={() =>
                    runGenerate({
                      instruction: REFINE_INSTRUCTIONS.toMessenger,
                      previousDraft: result.raw,
                      overrideType: "messenger",
                    })
                  }
                  disabled={busy || result.type === "messenger"}
                >
                  메신저로 줄이기
                </button>
              </div>

              <p className="writer-result__disclaimer">
                AI가 작성한 초안입니다. 수신자, 날짜, 수치 및 내부 정보를 확인한 후 사용하세요.
              </p>
            </div>
          )}
        </section>
      </div>

      <SensitiveInfoWarningModal
        open={!!pendingGenerate}
        categories={pendingGenerate?.categories ?? []}
        onContinue={handleSensitiveContinue}
        onCancel={handleSensitiveCancel}
      />
    </div>
  );
}
