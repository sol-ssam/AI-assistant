// 입력란 하나에 대한 오류 메시지. role="alert"가 곧 aria-live="assertive" 영역이므로
// 별도 스크린리더 전용 알림 컨테이너를 새로 만들 필요가 없다. 색상만으로 오류를
// 표현하지 않도록 항상 느낌표 아이콘 + 문구를 함께 보여준다(테두리 색은 .field--invalid가
// 담당한다).
export default function FieldError({ id, message }) {
  if (!message) return null;
  return (
    <p className="field__error" id={id} role="alert">
      <span aria-hidden="true">⚠</span> {message}
    </p>
  );
}
