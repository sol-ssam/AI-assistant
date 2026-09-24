import { useCallback, useRef, useState } from "react";

// 여러 페이지의 입력 폼이 공유하는 아주 작은 오류 상태 관리 훅이다. 새 폼 라이브러리를
// 추가하지 않고, 이 프로젝트가 이미 쓰던 "각 form이 자기 state를 갖는" 패턴 위에 최소한만
// 얹는다. 사용법:
//   const { errors, registerField, runValidation, withErrorClearing } = useFieldErrors();
//   const onChange = withErrorClearing(setForm);
//   function submit(e) {
//     e.preventDefault();
//     if (!runValidation(validateXxx(form))) return;
//     ...
//   }
export function useFieldErrors() {
  const [errors, setErrors] = useState({});
  const fieldRefs = useRef({});

  // <input ref={registerField("title")} />처럼 붙이면, 오류 발생 시 그 입력란으로
  // 포커스를 옮길 수 있게 DOM 노드를 기억해 둔다.
  const registerField = useCallback(
    (name) => (el) => {
      if (el) fieldRefs.current[name] = el;
      else delete fieldRefs.current[name];
    },
    []
  );

  const clearFieldError = useCallback((name) => {
    setErrors((prev) => {
      if (!(name in prev)) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const clearAll = useCallback(() => setErrors({}), []);

  // newErrors: { 필드명: 메시지 }. 오류가 없으면 true를 반환하고, 있으면 화면에 표시한
  // 뒤 첫 번째 오류 필드로 포커스를 옮기고 false를 반환한다.
  const runValidation = useCallback((newErrors) => {
    setErrors(newErrors);
    const firstInvalidField = Object.keys(newErrors)[0];
    if (firstInvalidField && fieldRefs.current[firstInvalidField]) {
      fieldRefs.current[firstInvalidField].focus();
    }
    return Object.keys(newErrors).length === 0;
  }, []);

  // 기존 onChange(nextValues) 호출 방식(변경된 필드를 포함한 객체 전체를 그대로 넘기는
  // 방식)은 그대로 두고, 그 값을 실제 state에 반영하는 시점에 어떤 필드가 바뀌었는지
  // 이전 값과 비교해 찾아 그 필드의 오류만 자동으로 지운다.
  const withErrorClearing = useCallback(
    (setValues) => (nextValues) => {
      setValues((prev) => {
        for (const key of Object.keys(nextValues)) {
          if (prev[key] !== nextValues[key]) {
            clearFieldError(key);
          }
        }
        return nextValues;
      });
    },
    [clearFieldError]
  );

  return { errors, registerField, clearFieldError, clearAll, runValidation, withErrorClearing };
}

export function isBlank(value) {
  return value == null || String(value).trim() === "";
}

// "HH:MM" 두 개를 비교한다 - 문자열 그대로 비교해도 자리수가 고정이라 안전하다.
export function isTimeBefore(a, b) {
  return !!a && !!b && a >= b;
}
