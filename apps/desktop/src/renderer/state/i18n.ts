export type UiLocale = 'en' | 'es';

export const LOCALE_STORAGE_KEY = 'orchdeck.locale';

export type ZompoMoodState = 'idle' | 'working' | 'waiting' | 'committed';

export const ZOMPO_WORKING_PHRASES: Readonly<Record<UiLocale, readonly string[]>> = {
  en: [
    'Zompo is cooking...',
    'Zompo is hauling diffs...',
    'Zompo is brewing a patch...',
    'Zompo is slicing the diff...',
    'Zompo is guarding main...',
    'Zompo is charting the trail...',
  ],
  es: [
    'Zompo está cocinando...',
    'Zompo está jalando diffs...',
    'Zompo está chorreando un patch...',
    'Zompo está cortando el diff...',
    'Zompo está cuidando main...',
    'Zompo está trazando la ruta...',
  ],
};

export interface UiDictionary {
  readonly send: string;
  readonly stop: string;
  readonly startNewChat: string;
  readonly workingTreeClean: string;
  readonly inspectingTree: string;
  readonly filesChangedSuffix: string;
  readonly fileChangedSuffix: string;
  readonly runTests: string;
  readonly approveCommit: string;
  readonly committing: string;
  readonly requestChanges: string;
  readonly discard: string;
  readonly confirmingDiscard: string;
  readonly confirmDiscard: string;
  readonly cancel: string;
  readonly noModeWritesMain: string;
  readonly planReadyTitle: string;
  readonly awaitingApproval: string;
  readonly approveExecute: string;
  readonly reject: string;
  readonly secondOpinion: string;
  readonly handOffBannerTitle: string;
  readonly handOffAction: string;
  readonly isolateWorktree: string;
  readonly removeWorktree: string;
  readonly zompoIdle: string;
  readonly zompoWaiting: string;
  readonly zompoCommitted: string;
  readonly inspectorTitle: string;
}

const DICTIONARIES: Readonly<Record<UiLocale, UiDictionary>> = {
  en: {
    send: 'Send',
    stop: 'Stop',
    startNewChat: 'Start New Chat',
    workingTreeClean: 'Working tree clean',
    inspectingTree: 'Inspecting working tree...',
    filesChangedSuffix: 'files changed',
    fileChangedSuffix: 'file changed',
    runTests: 'Run Tests',
    approveCommit: 'Approve & Commit',
    committing: 'Committing...',
    requestChanges: 'Request Changes',
    discard: 'Discard',
    confirmingDiscard: 'Stash backup & revert?',
    confirmDiscard: 'Confirm Discard',
    cancel: 'Cancel',
    noModeWritesMain: 'No mode writes to main',
    planReadyTitle: 'Architect Plan Ready',
    awaitingApproval: 'AWAITING APPROVAL',
    approveExecute: 'Approve & Execute',
    reject: 'Reject',
    secondOpinion: '2nd Opinion',
    handOffBannerTitle: 'Hand off to another engine',
    handOffAction: 'Hand Off',
    isolateWorktree: 'Isolate in Worktree',
    removeWorktree: 'Remove Worktree',
    zompoIdle: 'Zompo is keeping watch on the deck.',
    zompoWaiting: 'Zompo awaits your sign-off.',
    zompoCommitted: 'Zompo stacked a clean commit on branch.',
    inspectorTitle: 'Inspector',
  },
  es: {
    send: 'Enviar',
    stop: 'Detener',
    startNewChat: 'Iniciar Nuevo Chat',
    workingTreeClean: 'Árbol de trabajo limpio',
    inspectingTree: 'Inspeccionando cambios...',
    filesChangedSuffix: 'archivos modificados',
    fileChangedSuffix: 'archivo modificado',
    runTests: 'Correr Pruebas',
    approveCommit: 'Aprobar y Commit',
    committing: 'Guardando...',
    requestChanges: 'Pedir Cambios',
    discard: 'Descartar',
    confirmingDiscard: '¿Respaldar en stash y revertir?',
    confirmDiscard: 'Confirmar Descarte',
    cancel: 'Cancelar',
    noModeWritesMain: 'Ningún modo escribe en main',
    planReadyTitle: 'Plan de Architect Listo',
    awaitingApproval: 'ESPERANDO APROBACIÓN',
    approveExecute: 'Aprobar y Ejecutar',
    reject: 'Rechazar',
    secondOpinion: '2da Opinión',
    handOffBannerTitle: 'Pasar contexto a otro motor',
    handOffAction: 'Relevar',
    isolateWorktree: 'Aislar en Worktree',
    removeWorktree: 'Quitar Worktree',
    zompoIdle: 'Zompo está vigilando la mesa.',
    zompoWaiting: 'Zompo espera tu visto bueno.',
    zompoCommitted: 'Zompo apiló un commit limpio en la rama.',
    inspectorTitle: 'Inspector',
  },
};

export function resolveInitialLocale(stored: string | null): UiLocale {
  return stored === 'es' ? 'es' : 'en';
}

export function getUiDictionary(locale: UiLocale): UiDictionary {
  return DICTIONARIES[locale];
}

export function getZompoStatusPhrase(
  locale: UiLocale,
  mood: ZompoMoodState,
  frameIndex: number,
): string {
  const dict = DICTIONARIES[locale];
  switch (mood) {
    case 'idle':
      return dict.zompoIdle;
    case 'waiting':
      return dict.zompoWaiting;
    case 'committed':
      return dict.zompoCommitted;
    case 'working': {
      const phrases = ZOMPO_WORKING_PHRASES[locale];
      const normalizedIdx = ((frameIndex % phrases.length) + phrases.length) % phrases.length;
      return phrases[normalizedIdx] ?? phrases[0] ?? dict.zompoIdle;
    }
  }
}
