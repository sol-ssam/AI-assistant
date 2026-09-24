import { useState } from "react";
import { Link } from "react-router-dom";
import { signInWithGoogle, signInAsPreviewUser } from "../firebase/authService";
import { useAuth } from "../contexts/AuthContext";
import "./Login.css";

// Firebase Auth의 대표적인 오류 코드만 사용자 친화적 문구로 바꾼다. 그 외 코드는 일반
// 안내 문구로 대체하되, 개발자가 원인을 확인할 수 있도록 console에는 항상 원본
// error.code/error.message를 그대로 남긴다(사용자 화면에는 노출하지 않는다).
const LOGIN_ERROR_MESSAGES = {
  "auth/popup-closed-by-user": "Google 로그인 창이 닫혔습니다. 다시 시도해주세요.",
  "auth/popup-blocked": "브라우저에서 로그인 팝업이 차단되었습니다.",
  "auth/unauthorized-domain": "현재 주소가 Google 로그인 허용 도메인으로 등록되어 있지 않습니다.",
};
const DEFAULT_LOGIN_ERROR_MESSAGE = "Google 로그인 중 문제가 발생했습니다. 다시 시도해주세요.";
const PREVIEW_ERROR_MESSAGE = "게스트 체험을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.";

// 로그인 전 소개 카드 4개. 아이콘은 새 패키지 없이 앱 전반에서 이미 쓰는 방식과 같은
// 이모지 텍스트 아이콘이다(예: Home.jsx의 ✅📅, SettingsPage.jsx의 ☀️📄).
const FEATURES = [
  { icon: "☀️", title: "오늘의 브리핑", desc: "오늘 일정, 마감 업무와 기한이 지난 일을 한눈에 확인합니다." },
  { icon: "✨", title: "AI 비서", desc: "말하듯 입력하여 일정과 할 일을 등록하고 변경합니다." },
  { icon: "📝", title: "작성 도우미", desc: "이메일·메신저·공지문 초안을 만들고 원하는 말투로 다듬습니다." },
  { icon: "✅", title: "일정과 업무 관리", desc: "일정과 할 일을 직접 확인하고 수정하거나 완료 처리합니다." },
];

const STEPS = [
  "Google 계정으로 로그인하거나 게스트로 체험합니다.",
  "AI 비서에게 일정이나 할 일을 말합니다.",
  "오늘의 브리핑에서 하루 업무를 확인합니다.",
  "작성 도우미에서 이메일이나 메신저 초안을 만듭니다.",
  "생성 결과를 직접 확인한 뒤 필요한 곳에 복사해 사용합니다.",
];

export default function Login() {
  const { previewError } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [startingPreview, setStartingPreview] = useState(false);
  const [loginError, setLoginError] = useState("");

  // Anonymous 로그인에 성공하면 AuthContext가 샘플 데이터 준비가 끝날 때까지 로딩 화면을
  // 보여주고, 끝난 뒤에 Home으로 진입시킨다 - 여기서는 로그인 요청만 보낸다.
  async function handleStartPreview() {
    if (signingIn || startingPreview) return;
    setStartingPreview(true);
    setLoginError("");
    try {
      await signInAsPreviewUser();
    } catch (error) {
      console.error("Preview sign-in failed:", error.code, error.message);
      setLoginError(PREVIEW_ERROR_MESSAGE);
    } finally {
      setStartingPreview(false);
    }
  }

  async function handleGoogleSignIn() {
    if (signingIn || startingPreview) return;
    setSigningIn(true);
    setLoginError("");
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error("Google sign-in failed:", error.code, error.message);
      setLoginError(LOGIN_ERROR_MESSAGES[error.code] || DEFAULT_LOGIN_ERROR_MESSAGE);
    } finally {
      setSigningIn(false);
    }
  }

  const busy = signingIn || startingPreview;

  return (
    <div className="login">
      <div className="login__glow" aria-hidden="true" />

      <div className="login__layout">
        <section className="login__card">
          <h1 className="login__title">AI 업무 비서</h1>
          <p className="login__description">
            일정과 할 일을 말로 정리하고, 매일 필요한 업무를 브리핑받아 보세요. 업무 이메일과
            메신저 문장도 간편하게 작성할 수 있습니다.
          </p>

          <button
            type="button"
            className="login__button"
            onClick={handleGoogleSignIn}
            disabled={busy}
          >
            {signingIn ? "로그인 중…" : "Google 계정으로 시작하기"}
          </button>
          <button
            type="button"
            className="login__button login__button--secondary"
            onClick={handleStartPreview}
            disabled={busy}
          >
            {startingPreview ? "게스트 체험 준비 중…" : "게스트로 체험하기"}
          </button>
          <div className="login__preview-hint">
            <p>샘플 데이터로 주요 기능을 체험합니다.</p>
            <p>실제 회사 정보나 개인정보는 입력하지 마세요.</p>
          </div>

          {(loginError || previewError) && (
            <p className="login__error" role="alert">
              {loginError || previewError}
            </p>
          )}

          <div className="login__security-note">
            <p>
              🔒 회사 기밀, 고객 개인정보, 비밀번호, 인증번호 및 외부 공개가 제한된 자료는
              입력하지 마세요. AI가 작성한 내용은 확인 후 사용해야 합니다.
            </p>
            <p>작성 도우미는 이메일이나 메신저를 직접 발송하지 않습니다. 생성된 초안은 사용자가 직접 복사하여 사용합니다.</p>
          </div>

          <p className="login__legal-links">
            <Link to="/terms">이용약관</Link>
            <span aria-hidden="true"> · </span>
            <Link to="/privacy">개인정보 처리방침</Link>
          </p>
        </section>

        <section className="login__info">
          <div className="login__features">
            <h2 className="login__section-title">주요 기능</h2>
            <div className="login__feature-grid">
              {FEATURES.map((f) => (
                <div className="login__feature-card" key={f.title}>
                  <span className="login__feature-icon" aria-hidden="true">
                    {f.icon}
                  </span>
                  <h3 className="login__feature-title">{f.title}</h3>
                  <p className="login__feature-desc">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="login__steps">
            <h2 className="login__section-title">이렇게 사용하세요</h2>
            <ol className="login__steps-list">
              {STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </section>
      </div>
    </div>
  );
}
