import { useEffect, useId, useRef } from "react";
import "./Modal.css";

// 이 앱의 모든 Modal(설정 초기화 확인, 휴지통 영구 삭제 확인, 5-4단계 민감정보 경고 등)이
// 공유하는 기반 컴포넌트다. 여기서 접근성 기본기(role/aria-modal/aria-labelledby, Escape
// 키, 열릴 때 포커스 이동)를 한 번만 갖추면 이 컴포넌트를 쓰는 모든 곳에 그대로 적용된다 -
// 각 호출부가 따로 구현할 필요가 없다. onClose는 기존 호출부가 이미 각자의 "닫기/취소"
// 동작으로 연결해 뒀으므로, Escape와 바깥 클릭 모두 그 동작을 그대로 재사용한다(새 동작을
// 추가하지 않는다 - 기존 onClose 의미 그대로).
export default function Modal({ open, title, children, onClose }) {
  const titleId = useId();
  const cardRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    // 열리는 순간 다이얼로그 자체로 포커스를 옮겨, 스크린 리더가 새 다이얼로그의
    // 제목(aria-labelledby)부터 읽기 시작하게 한다.
    cardRef.current?.focus();

    function onKeyDown(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={cardRef}
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="modal-card__title" id={titleId}>
          {title}
        </h3>
        <div className="modal-card__body">{children}</div>
      </div>
    </div>
  );
}
