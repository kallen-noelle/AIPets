import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'

import { getDesktopBridge } from './desktop/bridge'
import { seedDevSettings } from './dev/seed'
import { router } from './router'
import { initializePreferences } from './settings/preferences'

import './i18n'
import '@unocss/reset/tailwind.css'
import 'uno.css'
import './styles/main.css'

seedDevSettings()
initializePreferences()

// The desktop host uses a transparent window, so the page beneath the
// character must not paint the app background.
if (getDesktopBridge())
  document.documentElement.dataset.desktop = 'true'

const container = document.getElementById('root')
if (!container)
  throw new Error('Missing #root element')

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
