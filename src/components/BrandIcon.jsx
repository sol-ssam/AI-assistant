// 사이드바 브랜드 영역과 앱 로딩 화면이 함께 쓰는 브랜드 아이콘. 이모지(🌷) 대신, 기존
// 사이드바 아이콘(Sidebar.jsx의 Icon)과 똑같은 viewBox(0 0 24 24)·선 굵기(1.8)·둥근 선 끝
// 모양의 반짝임 모양을, 작은 남색 원형 배경 위에 흰색으로 그린다. 새 아이콘 패키지나
// 이미지 파일 없이 인라인 SVG만 사용하고, 두 곳(Sidebar, App.jsx 로딩 화면)이 이 컴포넌트
// 하나를 그대로 재사용한다. size는 원형 배경의 지름(px)이다.
export default function BrandIcon({ size = 24 }) {
  return (
    <span className="brand-icon" aria-hidden="true" style={{ width: size, height: size }}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3v4M12 17v4M4.5 12h4M15.5 12h4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M17.5 6.5 15 9M9 15l-2.5 2.5" />
      </svg>
    </span>
  );
}
