import { createRoot } from 'react-dom/client'

import { App } from './app'

import './styles.css'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Chess UI root element was not found.')
}

createRoot(rootElement).render(<App />)
