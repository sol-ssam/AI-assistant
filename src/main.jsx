import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { initAppCheck } from './firebase/appCheck'
import App from './App.jsx'

// Gemini(Firebase AI Logic) 등 Firebase 백엔드 요청에 App Check 토큰이 붙도록,
// 다른 Firebase 서비스를 사용하기 전에 최대한 먼저 초기화한다.
initAppCheck()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
