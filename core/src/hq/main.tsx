import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import HqApp from './app'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HqApp />
  </StrictMode>,
)
