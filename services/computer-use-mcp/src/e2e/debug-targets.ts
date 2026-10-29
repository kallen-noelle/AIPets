export interface DebugTargetLike {
  id: string
  title: string
  type: string
  url: string
  webSocketDebuggerUrl?: string
}

export interface AipetsDebugSnapshotLike {
  route?: string
  documentTitle?: string
}

function containsFragment(input: string, fragments: string[]) {
  return fragments.some(fragment => input.includes(fragment))
}

// NOTICE: The remote debug endpoint exposes multiple renderer pages for Electron.
// We only want actual AIPETS app pages here; helper pages like beat-sync and devtools
// will never expose `window.__AIPETS_DEBUG__` and should be deprioritized early.
export function isInspectableAipetsRendererTarget(target: DebugTargetLike) {
  if (target.type !== 'page') {
    return false
  }

  if (!target.url.startsWith('http://localhost:5173/')) {
    return false
  }

  return !containsFragment(target.url, [
    '/__inspect__',
    '/__devtools__',
    '/__unocss',
    'beat-sync.html',
  ])
}

export function prioritizeInspectableAipetsTargets(targets: DebugTargetLike[]) {
  return [...targets]
    .filter(isInspectableAipetsRendererTarget)
    .sort((left, right) => scoreInspectableAipetsTarget(right) - scoreInspectableAipetsTarget(left))
}

function scoreInspectableAipetsTarget(target: DebugTargetLike) {
  let score = 0

  if (target.title === 'Chat') {
    score += 40
  }
  else if (target.title === 'AIPETS') {
    score += 20
  }

  if (target.url.includes('#/chat')) {
    score += 30
  }
  else if (target.url === 'http://localhost:5173/' || target.url === 'http://localhost:5173') {
    score += 10
  }

  return score
}

export function isChatSurfaceTarget(target: DebugTargetLike, snapshot?: AipetsDebugSnapshotLike) {
  if (target.title === 'Chat' || target.url.includes('#/chat')) {
    return true
  }

  return String(snapshot?.route || '').includes('/chat')
}
