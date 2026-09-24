import { Link } from "react-router-dom";
import "./BriefingSection.css";

// tone: "urgent" | "prep" | "calendar" | "class"
// failed: 이 섹션의 데이터 조회 자체가 실패했을 때 true. 다른 섹션에는 영향을 주지 않는다.
// hideWhenEmpty: true면 항목이 없고 실패도 아닐 때 아예 렌더링하지 않는다 (빈 카드로
// 화면을 차지하지 않도록). 기본값 false — 기존 호출부는 그대로 동작한다.
// navLink: { to, label } - 이 카드 내용과 명확히 대응하는 기존 route가 있을 때만 카드
// 제목 오른쪽에 작은 "OO 보기 ›" 링크를 표시한다. 새 route를 만들지 않고, 대응하는
// route가 없는 카드(예: 여러 출처가 섞인 "오늘의 주요 확인")는 이 prop 자체를 생략한다.
export default function BriefingSection({
  icon,
  title,
  tone,
  items,
  emptyText,
  renderItem,
  failed = false,
  hideWhenEmpty = false,
  navLink,
}) {
  if (hideWhenEmpty && !failed && items.length === 0) return null;

  return (
    <section className="briefing-section">
      <header className="briefing-section__head">
        <span className={`briefing-section__dot briefing-section__dot--${tone}`} />
        <span className="briefing-section__icon">{icon}</span>
        <h2 className="briefing-section__title">{title}</h2>
        {navLink && (
          <Link to={navLink.to} className="briefing-section__nav-link">
            {navLink.label} ›
          </Link>
        )}
      </header>

      {failed ? (
        <p className="briefing-section__empty briefing-section__empty--failed">
          이 항목을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      ) : items.length === 0 ? (
        <p className="briefing-section__empty">{emptyText}</p>
      ) : (
        <ul className="briefing-section__list">
          {items.map((item, i) => (
            <li key={item.id ?? i} className="briefing-section__item">
              {renderItem ? renderItem(item) : item.title}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
