import { useEffect, useState } from "react";
import { NavLink, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { signOutUser } from "../firebase/authService";
import { endPreviewSession } from "../demo/cleanupPreviewData";
import BrandIcon from "./BrandIcon";
import "./Sidebar.css";

const SIDEBAR_COLLAPSED_KEY = "teacherAssistant.sidebarCollapsed";

// 새 icon library를 설치하지 않고, 얇은 line-icon 스타일의 작은 SVG를 직접 그린다.
// 전부 같은 viewBox/strokeWidth를 써서 크기와 굵기가 통일되게 한다.
function Icon({ children }) {
  return (
    <svg
      className="sidebar__icon-svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const IconHome = () => (
  <Icon>
    <path d="M4 11.5 12 4l8 7.5" />
    <path d="M6 10v9a1 1 0 0 0 1 1h4v-6h2v6h4a1 1 0 0 0 1-1v-9" />
  </Icon>
);
const IconSpark = () => (
  <Icon>
    <path d="M12 3v4M12 17v4M4.5 12h4M15.5 12h4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M17.5 6.5 15 9M9 15l-2.5 2.5" />
  </Icon>
);
const IconCalendar = () => (
  <Icon>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 9.5h16M8 3v3.5M16 3v3.5" />
  </Icon>
);
const IconBriefcase = () => (
  <Icon>
    <rect x="3.5" y="7.5" width="17" height="11.5" rx="1.6" />
    <path d="M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5M3.5 12.5h17" />
  </Icon>
);
const IconPencil = () => (
  <Icon>
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" />
  </Icon>
);
const IconGear = () => (
  <Icon>
    <circle cx="12" cy="12" r="3" />
    <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2.1-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2.1 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9c.6.5 1.3.9 2.1 1.2L10 21h4l.5-2.6c.8-.3 1.5-.7 2.1-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z" />
  </Icon>
);
const IconUser = () => (
  <Icon>
    <circle cx="12" cy="8.5" r="3.2" />
    <path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6" />
  </Icon>
);
const IconChevronLeft = () => (
  <Icon>
    <path d="M14.5 5 8.5 12l6 7" />
  </Icon>
);
const IconChevronRight = () => (
  <Icon>
    <path d="M9.5 5 15.5 12l-6 7" />
  </Icon>
);
const IconHamburger = () => (
  <Icon>
    <path d="M4 6.5h16M4 12h16M4 17.5h16" />
  </Icon>
);
const IconClose = () => (
  <Icon>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);
const IconLogout = () => (
  <Icon>
    <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M15 16l4-4-4-4M19 12H9" />
  </Icon>
);

const NAV_ITEMS = [
  { to: "/", label: "오늘의 브리핑", end: true, Icon: IconHome },
  { to: "/assistant", label: "AI 비서", Icon: IconSpark },
  { to: "/writer", label: "작성 도우미", Icon: IconPencil },
  { to: "/events", label: "일정", Icon: IconCalendar },
  { to: "/tasks", label: "업무", Icon: IconBriefcase },
  { to: "/settings", label: "설정", Icon: IconGear },
];

// Firebase Auth user의 photoURL(Google 로그인 프로필 사진)을 그대로 보여준다. 새로운
// Google API 호출이나 Storage/Firestore 저장은 전혀 하지 않는다 - 이미 로그인 시
// Firebase가 넘겨주는 값을 표시만 한다. 이미지 로딩이 실패하면(onError) 이름 첫 글자
// fallback으로 조용히 전환한다.
function Avatar({ user, size }) {
  const [imgError, setImgError] = useState(false);
  const name = user?.displayName?.trim();
  const initial = name ? name.charAt(0) : "";
  const showImage = !!user?.photoURL && !imgError;

  return (
    <span className="sidebar__avatar" style={{ width: size, height: size }}>
      {showImage ? (
        <img
          className="sidebar__avatar-img"
          src={user.photoURL}
          alt={name ? `${name} 프로필 사진` : "프로필 사진"}
          onError={() => setImgError(true)}
        />
      ) : initial ? (
        <span className="sidebar__avatar-fallback" aria-hidden="true">
          {initial}
        </span>
      ) : (
        <IconUser />
      )}
    </span>
  );
}

// Desktop 펼침/축소 sidebar와 Mobile drawer가 공유하는 내용(같은 NAV_ITEMS, 같은 markup).
// collapsed일 때만 텍스트를 숨기고 아이콘 hover/focus 시 tooltip을 보여준다.
function SidebarContent({ collapsed, onNavigate }) {
  const { user } = useAuth();
  // '게스트로 체험하기'(Firebase Anonymous) 사용자에게만 표시/종료 문구를 바꾼다.
  // Google 사용자는 이 값이 항상 false라 기존 화면과 완전히 동일하다.
  const isPreview = user?.isAnonymous === true;
  const [endingPreview, setEndingPreview] = useState(false);
  const [endPreviewError, setEndPreviewError] = useState("");

  // 게스트 체험 종료: 이 익명 사용자의 체험 데이터 삭제 → 성공하면 signOut. 실패하면 로그아웃하지
  // 않고 안내만 보여줘서 다시 시도할 수 있다. (Google 사용자는 이 함수를 쓰지 않는다.)
  async function handleEndPreview() {
    if (endingPreview) return;
    setEndingPreview(true);
    setEndPreviewError("");
    try {
      await endPreviewSession(user);
    } catch (error) {
      console.error("Preview end failed:", error?.code, error?.message);
      setEndPreviewError("게스트 체험 종료 중 오류가 발생했습니다.");
      setEndingPreview(false);
    }
  }

  return (
    <>
      <Link to="/" className="sidebar__brand" onClick={onNavigate}>
        <BrandIcon size={26} />
        {!collapsed && (
          <span className="sidebar__brand-text">
            <span className="sidebar__brand-name">AI 업무 비서</span>
            <span className="sidebar__brand-sub">오늘의 업무를 시작해 볼까요</span>
          </span>
        )}
      </Link>

      <nav className="sidebar__nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) => "sidebar__link" + (isActive ? " sidebar__link--active" : "")}
            data-tooltip={collapsed ? item.label : undefined}
          >
            <span className="sidebar__link-icon">
              <item.Icon />
            </span>
            {!collapsed && <span className="sidebar__link-label">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar__user">
        {user &&
          (collapsed ? (
            <div className="sidebar__user-collapsed">
              <div
                className="sidebar__user-mini"
                data-tooltip={
                  isPreview ? "게스트 체험" : user.displayName ? `${user.displayName}님` : "사용자"
                }
              >
                <Avatar user={user} size={32} />
              </div>
              <button
                type="button"
                className="sidebar__signout-icon"
                onClick={isPreview ? handleEndPreview : signOutUser}
                disabled={isPreview && endingPreview}
                aria-label={isPreview ? "게스트 체험 종료" : "로그아웃"}
                data-tooltip={
                  isPreview ? endPreviewError || (endingPreview ? "종료 중…" : "게스트 체험 종료") : "로그아웃"
                }
              >
                <IconLogout />
              </button>
            </div>
          ) : (
            <div className="sidebar__profile">
              <Avatar user={user} size={38} />
              <div className="sidebar__profile-text">
                <div className="sidebar__user-name">
                  {user.displayName ? `${user.displayName}님` : "사용자"}
                </div>
                {isPreview && <span className="sidebar__preview-badge">게스트 체험</span>}
                <button
                  type="button"
                  className="sidebar__signout"
                  onClick={isPreview ? handleEndPreview : signOutUser}
                  disabled={isPreview && endingPreview}
                >
                  {isPreview ? (endingPreview ? "종료 중…" : "게스트 체험 종료") : "로그아웃"}
                </button>
                {isPreview && endPreviewError && (
                  <span className="sidebar__preview-error" role="alert">
                    {endPreviewError}
                  </span>
                )}
              </div>
            </div>
          ))}
      </div>
    </>
  );
}

export default function Sidebar() {
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
    } catch {
      return false;
    }
  });
  // Mobile drawer 열림 상태 - localStorage에 저장하지 않는다(새로고침 시 항상 닫힌 채로
  // 시작해야 한다). Desktop의 collapsed(사용자 preference)와 완전히 별개의 state다.
  const [mobileOpen, setMobileOpen] = useState(false);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {
        // localStorage를 쓸 수 없는 환경이어도(예: 프라이빗 모드) 기능 자체는 그대로
        // 동작해야 하므로 조용히 무시한다.
      }
      return next;
    });
  }

  // Escape로 drawer 닫기.
  useEffect(() => {
    if (!mobileOpen) return undefined;
    function onKeyDown(e) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  return (
    <>
      {/* Mobile 전용 상단 header - 좁은 화면에서만 CSS로 보인다 */}
      <header className="mobile-header">
        <button
          type="button"
          className="mobile-header__button"
          aria-label="메뉴 열기"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
        >
          <IconHamburger />
        </button>
        <Link to="/" className="mobile-header__brand">
          <BrandIcon size={22} /> AI 업무 비서
        </Link>
        {user?.isAnonymous === true && <span className="mobile-header__preview">게스트</span>}
        <div className="mobile-header__user" aria-hidden="true">
          {user && <IconUser />}
        </div>
      </header>

      {/* Desktop sidebar (펼침/축소) - Mobile 폭에서는 CSS로 숨긴다 */}
      <aside className={"sidebar" + (collapsed ? " sidebar--collapsed" : "")}>
        <SidebarContent collapsed={collapsed} />
        <button
          type="button"
          className="sidebar__collapse-btn"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
        >
          {collapsed ? <IconChevronRight /> : <IconChevronLeft />}
        </button>
      </aside>

      {/* Mobile drawer + backdrop - mobileOpen일 때만 실제로 상호작용 가능하게 표시 */}
      <div
        className={"sidebar-backdrop" + (mobileOpen ? " sidebar-backdrop--visible" : "")}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />
      <aside className={"sidebar sidebar--drawer" + (mobileOpen ? " sidebar--drawer-open" : "")}>
        <button
          type="button"
          className="sidebar__drawer-close"
          aria-label="메뉴 닫기"
          onClick={() => setMobileOpen(false)}
        >
          <IconClose />
        </button>
        <SidebarContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
      </aside>
    </>
  );
}
