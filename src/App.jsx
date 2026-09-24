import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { GoogleCalendarProvider } from "./contexts/GoogleCalendarContext";
import { runTrashSweepIfDue } from "./firebase/trashSweep";
import Sidebar from "./components/Sidebar";
import BrandIcon from "./components/BrandIcon";
import Login from "./pages/Login";
import Home from "./pages/Home";
import AssistantPage from "./pages/AssistantPage";
import WriterPage from "./pages/WriterPage";
import EventsPage from "./pages/EventsPage";
import TasksPage from "./pages/TasksPage";
import SettingsPage from "./pages/SettingsPage";
import TrashPage from "./pages/TrashPage";
import PrivacyPage from "./pages/PrivacyPage";
import TermsPage from "./pages/TermsPage";
import "./App.css";

function AuthenticatedApp() {
  const { user, loading, previewPreparing } = useAuth();

  // 5-3-3: 완료 업무 자동 정리 + 휴지통 30일 자동 영구 삭제 - 인증된 사용자가 앱에
  // 진입하는 모든 경로(홈뿐 아니라 /trash, /events, /tasks 등으로 바로 들어와도)가 이
  // 컴포넌트를 거치므로 여기서 한 번만 트리거한다. runTrashSweepIfDue 자체가 게스트
  // 제외/하루 1회 제한/인플라이트 가드/실패 시 조용히 로그만 남기는 처리를 전부
  // 담당하므로, 여기서는 결과를 기다리거나 화면을 막지 않고 그냥 실행만 시킨다(fire-and-
  // forget) - 렌더링과 로그인 흐름은 이 결과와 무관하게 그대로 진행된다.
  useEffect(() => {
    if (!user) return;
    runTrashSweepIfDue(user);
  }, [user]);

  if (loading) {
    return (
      <div className="app-loading">
        <BrandIcon size={40} />
        <span className="app-loading__brand">AI 업무 비서</span>
        <span className="app-loading__text">{previewPreparing ? "게스트 체험 준비 중…" : "불러오는 중…"}</span>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/assistant" element={<AssistantPage />} />
          <Route path="/writer" element={<WriterPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          {/* 휴지통 - 의도적으로 Sidebar의 NAV_ITEMS에는 추가하지 않는다. 설정 화면의
              "고급 설정" 안에 있는 진입 버튼(Link to="/trash")을 통해서만 들어올 수 있다. */}
          <Route path="/trash" element={<TrashPage />} />
          {/* 더 이상 제공하지 않는 경로(이전 /timetable, /progress, /documents 등)로
              들어와도 빈 화면 대신 오늘의 브리핑으로 보낸다. 이 Routes는 공개 경로
              (/privacy, /terms)가 이미 매치된 뒤에만 도달하므로 그 두 경로에는 영향이 없다. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

// /privacy, /terms는 Google OAuth 브랜딩(개인정보처리방침/이용약관 링크)용 공개
// 페이지라서, 로그인 여부를 확인하기 전에 먼저 매치되어야 한다. 그 외 모든 경로는
// 기존 그대로 로그인 게이트를 거친다.
function AppShell() {
  return (
    <Routes>
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/*" element={<AuthenticatedApp />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <GoogleCalendarProvider>
        <BrowserRouter>
          <AppShell />
        </BrowserRouter>
      </GoogleCalendarProvider>
    </AuthProvider>
  );
}
