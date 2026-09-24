import Modal from "./Modal";
import "../pages/crud-shared.css";
import "./SensitiveInfoWarningModal.css";

// AI 비서 페이지·홈 빠른 AI 입력·작성 도우미가 공유하는 "전송 전 확인" 경고창(5-4단계).
// 세 화면이 같은 판정 로직(ai/sensitiveInfo.js)과 같은 문구를 쓰도록 이 컴포넌트 하나로
// 합쳐뒀다 - 각 화면에 같은 마크업을 따로 만들지 않는다.
//
// 일부러 아주 단순하게 유지한다: 열림 여부, 감지된 분류명 목록, "계속 진행"/"수정 취소"
// 콜백만 받는다. 실제로 어떤 문자열이 감지됐는지는 절대 받지도, 화면에 표시하지도
// 않는다(요구사항) - categories는 사람이 읽는 분류명("연락처", "회사·프로젝트 정보" 등)
// 뿐이다.
export default function SensitiveInfoWarningModal({ open, categories = [], onContinue, onCancel }) {
  return (
    <Modal open={open} title="민감정보가 포함되어 있을 수 있어요" onClose={onCancel}>
      <p className="sensitive-warning__body">
        입력 내용에서 연락처 또는 회사 업무와 관련된 민감정보가 감지되었습니다. 외부 AI로
        전송하기 전에 회사 기밀이나 개인정보가 포함되어 있지 않은지 확인해 주세요.
      </p>
      {categories.length > 0 && (
        <p className="sensitive-warning__categories">감지 항목: {categories.join(", ")}</p>
      )}
      <p className="sensitive-warning__helper">
        휴대전화 번호, 이메일 주소, 주민등록번호 형태는 기존 방식대로 전송 전에 자동으로
        가려집니다. 회사명이나 프로젝트명 등은 자동으로 완전히 가려지지 않을 수 있습니다.
      </p>
      <div className="form__actions sensitive-warning__actions">
        <button type="button" className="btn" onClick={onCancel}>
          입력 수정
        </button>
        <button type="button" className="btn btn--ghost" onClick={onContinue}>
          확인 후 계속
        </button>
      </div>
    </Modal>
  );
}
