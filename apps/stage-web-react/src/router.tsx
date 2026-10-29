import { createHashRouter } from 'react-router'

import { ChatPage } from './pages/chat-page'
import { PendingPage } from './pages/pending-page'
import { PetPage } from './pages/pet-page'
import { AnimationPage } from './pages/settings/animation-page'
import { ArtistryPage } from './pages/settings/artistry-page'
import { BeatSyncPage } from './pages/settings/beat-sync-page'
import { CardPage } from './pages/settings/card-page'
import { ConnectionPage } from './pages/settings/connection-page'
import { ConsciousnessPage } from './pages/settings/consciousness-page'
import { DataPage } from './pages/settings/data-page'
import { DesktopPage } from './pages/settings/desktop-page'
import { HearingPage } from './pages/settings/hearing-page'
import { HomeAssistantPage } from './pages/settings/home-assistant-page'
import { McpPage } from './pages/settings/mcp-page'
import { MemoryEntriesPage } from './pages/settings/memory-entries-page'
import { MemoryLongTermPage } from './pages/settings/memory-long-term-page'
import { MemoryPage } from './pages/settings/memory-page'
import { MemoryShortTermPage } from './pages/settings/memory-short-term-page'
import { MigratingPage } from './pages/settings/migrating-page'
import { ModelsPage } from './pages/settings/models-page'
import { ModulesPage } from './pages/settings/modules-page'
import { PluginsPage } from './pages/settings/plugins-page'
import { ProviderDetailPage } from './pages/settings/provider-detail-page'
import { ProvidersPage } from './pages/settings/providers-page'
import { RecipesPage } from './pages/settings/recipes-page'
import { SettingsIndex } from './pages/settings/settings-index'
import { SettingsLayout } from './pages/settings/settings-layout'
import { SpeechPage } from './pages/settings/speech-page'
import { StickersPage } from './pages/settings/stickers-page'
import { SystemPage } from './pages/settings/system-page'
import { ToolCardsPage } from './pages/settings/tool-cards-page'
import { TranscriberPage } from './pages/settings/transcriber-page'
import { VisionPage } from './pages/settings/vision-page'
import { VoiceprintPage } from './pages/settings/voiceprint-page'
import { WakeWordsPage } from './pages/settings/wake-words-page'
import { WebSearchPage } from './pages/settings/web-search-page'
import { StagePage } from './pages/stage-page'
import { WidgetPage } from './pages/widget-page'

export const router = createHashRouter([
  {
    path: '/',
    element: <StagePage />,
  },
  {
    path: '/chat',
    element: <ChatPage />,
  },
  // The desktop pet window. It renders the character without the page chrome.
  {
    path: '/pet',
    element: <PetPage />,
  },
  // The small always-on-top window of the desktop app.
  {
    path: '/widget',
    element: <WidgetPage />,
  },
  // Routes the Vue app serves today. The React pages for them are pending.
  { path: '/widgets', element: <PendingPage title="widgets" /> },
  { path: '/desktop-overlay', element: <PendingPage title="desktop-overlay" /> },
  {
    path: '/settings',
    element: <SettingsLayout />,
    children: [
      { index: true, element: <SettingsIndex /> },
      { path: 'system', element: <SystemPage /> },
      { path: 'system/developer', element: <PendingPage title="developer" /> },
      { path: 'desktop', element: <DesktopPage /> },
      { path: 'plugins', element: <PluginsPage /> },
      { path: 'card', element: <CardPage /> },
      { path: 'memory', element: <MemoryPage /> },
      { path: 'animation', element: <AnimationPage /> },
      { path: 'data', element: <DataPage /> },
      { path: 'connection', element: <ConnectionPage /> },
      { path: 'modules', element: <ModulesPage /> },
      { path: 'modules/speech', element: <SpeechPage /> },
      { path: 'modules/hearing', element: <HearingPage /> },
      { path: 'modules/hearing/transcriber', element: <TranscriberPage /> },
      { path: 'modules/hearing/wake-words', element: <WakeWordsPage /> },
      { path: 'modules/hearing/voiceprint', element: <VoiceprintPage /> },
      { path: 'modules/consciousness', element: <ConsciousnessPage /> },
      { path: 'modules/vision', element: <VisionPage /> },
      { path: 'modules/stickers', element: <StickersPage /> },
      { path: 'modules/web-search', element: <WebSearchPage /> },
      { path: 'modules/artistry', element: <ArtistryPage /> },
      { path: 'modules/tool-cards', element: <ToolCardsPage /> },
      { path: 'modules/memory-short-term', element: <MemoryShortTermPage /> },
      { path: 'modules/memory-long-term', element: <MemoryLongTermPage /> },
      { path: 'modules/memory-long-term/memories', element: <MemoryEntriesPage /> },
      { path: 'modules/memory-long-term/recipes', element: <RecipesPage /> },
      { path: 'modules/home-assistant', element: <HomeAssistantPage /> },
      { path: 'modules/mcp', element: <McpPage /> },
      { path: 'modules/beat-sync', element: <BeatSyncPage /> },
      { path: 'modules/:moduleId', element: <MigratingPage /> },
      { path: 'models', element: <ModelsPage /> },
      { path: 'providers', element: <ProvidersPage /> },
      { path: 'providers/:providerId', element: <ProviderDetailPage /> },
      { path: '*', element: <MigratingPage /> },
    ],
  },
])
