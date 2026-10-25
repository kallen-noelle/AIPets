import { createHashRouter } from 'react-router'

import { AuthCallbackPage } from './pages/auth-callback-page'
import { ChatPage } from './pages/chat-page'
import { AccountPage } from './pages/settings/account-page'
import { ArtistryPage } from './pages/settings/artistry-page'
import { BeatSyncPage } from './pages/settings/beat-sync-page'
import { CardPage } from './pages/settings/card-page'
import { ConnectionPage } from './pages/settings/connection-page'
import { ConsciousnessPage } from './pages/settings/consciousness-page'
import { DataPage } from './pages/settings/data-page'
import { DiscordPage } from './pages/settings/discord-page'
import { HearingPage } from './pages/settings/hearing-page'
import { HomeAssistantPage } from './pages/settings/home-assistant-page'
import { McpPage } from './pages/settings/mcp-page'
import { MemoryLongTermPage } from './pages/settings/memory-long-term-page'
import { MemoryPage } from './pages/settings/memory-page'
import { MemoryShortTermPage } from './pages/settings/memory-short-term-page'
import { MigratingPage } from './pages/settings/migrating-page'
import { ModelsPage } from './pages/settings/models-page'
import { ModulesPage } from './pages/settings/modules-page'
import { ProviderDetailPage } from './pages/settings/provider-detail-page'
import { ProvidersPage } from './pages/settings/providers-page'
import { ScenePage } from './pages/settings/scene-page'
import { SettingsIndex } from './pages/settings/settings-index'
import { SettingsLayout } from './pages/settings/settings-layout'
import { SpeechPage } from './pages/settings/speech-page'
import { StickersPage } from './pages/settings/stickers-page'
import { SystemPage } from './pages/settings/system-page'
import { ToolCardsPage } from './pages/settings/tool-cards-page'
import { VisionPage } from './pages/settings/vision-page'
import { WebSearchPage } from './pages/settings/web-search-page'
import { XPage } from './pages/settings/x-page'
import { StagePage } from './pages/stage-page'

export const router = createHashRouter([
  {
    path: '/',
    element: <StagePage />,
  },
  {
    path: '/chat',
    element: <ChatPage />,
  },
  {
    path: '/auth/callback',
    element: <AuthCallbackPage />,
  },
  {
    path: '/settings',
    element: <SettingsLayout />,
    children: [
      { index: true, element: <SettingsIndex /> },
      { path: 'system', element: <SystemPage /> },
      { path: 'account', element: <AccountPage /> },
      { path: 'card', element: <CardPage /> },
      { path: 'memory', element: <MemoryPage /> },
      { path: 'scene', element: <ScenePage /> },
      { path: 'data', element: <DataPage /> },
      { path: 'connection', element: <ConnectionPage /> },
      { path: 'modules', element: <ModulesPage /> },
      { path: 'modules/speech', element: <SpeechPage /> },
      { path: 'modules/hearing', element: <HearingPage /> },
      { path: 'modules/consciousness', element: <ConsciousnessPage /> },
      { path: 'modules/vision', element: <VisionPage /> },
      { path: 'modules/stickers', element: <StickersPage /> },
      { path: 'modules/web-search', element: <WebSearchPage /> },
      { path: 'modules/artistry', element: <ArtistryPage /> },
      { path: 'modules/tool-cards', element: <ToolCardsPage /> },
      { path: 'modules/memory-short-term', element: <MemoryShortTermPage /> },
      { path: 'modules/memory-long-term', element: <MemoryLongTermPage /> },
      { path: 'modules/messaging-discord', element: <DiscordPage /> },
      { path: 'modules/x', element: <XPage /> },
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
