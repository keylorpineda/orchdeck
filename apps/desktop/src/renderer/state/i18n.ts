export type UiLocale = 'en' | 'es';

export const LOCALE_STORAGE_KEY = 'orchdeck.locale';

export type OrsoMoodState = 'idle' | 'typing' | 'working' | 'waiting' | 'committed';

export const ORSO_WORKING_PHRASES: Readonly<Record<UiLocale, readonly string[]>> = {
  en: [
    'Orso is hammering out a clean diff...',
    'Orso is typing across modules...',
    'Orso is drafting tests and types...',
    'Orso is reviewing the AST...',
    'Orso is guarding main...',
    'Orso is brewing a verified patch...',
  ],
  es: [
    'Orso está picando un diff limpio...',
    'Orso está tecleando entre módulos...',
    'Orso está preparando pruebas y tipos...',
    'Orso está revisando el AST...',
    'Orso está cuidando main...',
    'Orso está armando un parche verificado...',
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
  readonly orsoIdle: string;
  readonly orsoTyping: string;
  readonly orsoWaiting: string;
  readonly orsoCommitted: string;
  readonly orsoWaving: string;
  readonly inspectorTitle: string;
  readonly pluginsTab: string;
  readonly memoryTab: string;
  readonly pluginsFilterAll: string;
  readonly activeInRepo: string;
  readonly installedCatalog: string;
  readonly portableSkills: string;
  readonly mcpHubTitle: string;
  readonly mcpApproveCall: string;
  readonly mcpDenyCall: string;
  readonly managedNativelyCli: string;
  readonly noPluginsFound: string;
  readonly memoryBudget: string;
  readonly memoryDecision: string;
  readonly memoryConvention: string;
  readonly memoryOpenItem: string;
  readonly addMemory: string;
  readonly memoryProposalTitle: string;
  readonly saveMemory: string;
  readonly dismiss: string;
  readonly recommendedLabel: string;
  readonly useSuggested: string;
  readonly taskTagLabel: string;
  readonly splashBooting: string;
  readonly splashCheckingDaemon: string;
  readonly splashReady: string;
  readonly welcomeTitle: string;
  readonly welcomeSubtitle: string;
  readonly welcomeLinkCta: string;
  readonly welcomeCap1Title: string;
  readonly welcomeCap1Desc: string;
  readonly welcomeCap2Title: string;
  readonly welcomeCap2Desc: string;
  readonly welcomeCap3Title: string;
  readonly welcomeCap3Desc: string;
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
    orsoIdle: 'Orso is keeping watch with fresh coffee.',
    orsoTyping: 'Orso is typing along with you.',
    orsoWaiting: 'Orso awaits your plan sign-off.',
    orsoCommitted: 'Orso stacked a verified commit.',
    orsoWaving: 'Ready to ship code!',
    inspectorTitle: 'Inspector',
    pluginsTab: 'Plugins & MCP',
    memoryTab: 'Memory',
    pluginsFilterAll: 'All',
    activeInRepo: 'Active in this repo',
    installedCatalog: 'Installed',
    portableSkills: 'Portable Skills (SKILL.md)',
    mcpHubTitle: 'Local MCP Hub',
    mcpApproveCall: 'Approve',
    mcpDenyCall: 'Deny',
    managedNativelyCli: 'Managed natively by CLI',
    noPluginsFound: 'No local plugins discovered yet.',
    memoryBudget: 'Prompt budget',
    memoryDecision: 'Decision',
    memoryConvention: 'Convention',
    memoryOpenItem: 'Open Item',
    addMemory: 'Save Memory',
    memoryProposalTitle: 'Save change decision to Project Memory?',
    saveMemory: 'Save to Memory',
    dismiss: 'Dismiss',
    recommendedLabel: 'Suggested',
    useSuggested: 'Use',
    taskTagLabel: 'Task',
    splashBooting: 'Waking up Orso and local engines...',
    splashCheckingDaemon: 'Connecting local orchestration daemon',
    splashReady: 'Deck ready',
    welcomeTitle: 'Orso is ready at the workbench.',
    welcomeSubtitle:
      'Link a local Git repository to orchestrate Claude Code, Codex CLI, and Antigravity side-by-side with safe worktree isolation.',
    welcomeLinkCta: 'Link Local Git Repository',
    welcomeCap1Title: 'Protected Main Branch',
    welcomeCap1Desc: 'Every write runs on an isolated branch or worktree with diff review.',
    welcomeCap2Title: 'Multi-Engine Handoff',
    welcomeCap2Desc: 'Route tasks and get cross-engine second opinions in seconds.',
    welcomeCap3Title: 'Project Memory & MCP',
    welcomeCap3Desc: 'Persistent architecture conventions and gated local MCP tools.',
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
    orsoIdle: 'Orso vigila la mesa con café recién hecho.',
    orsoTyping: 'Orso teclea a la par tuya.',
    orsoWaiting: 'Orso espera tu visto bueno.',
    orsoCommitted: 'Orso apiló un commit verificado.',
    orsoWaving: '¡Listo para programar!',
    inspectorTitle: 'Inspector',
    pluginsTab: 'Plugins y MCP',
    memoryTab: 'Memoria',
    pluginsFilterAll: 'Todos',
    activeInRepo: 'Activos en este repo',
    installedCatalog: 'Instalados',
    portableSkills: 'Skills Portables (SKILL.md)',
    mcpHubTitle: 'Hub MCP Local',
    mcpApproveCall: 'Aprobar',
    mcpDenyCall: 'Denegar',
    managedNativelyCli: 'Gestionado nativamente por CLI',
    noPluginsFound: 'Aún no se detectaron plugins locales.',
    memoryBudget: 'Presupuesto prompt',
    memoryDecision: 'Decisión',
    memoryConvention: 'Convención',
    memoryOpenItem: 'Pendiente',
    addMemory: 'Guardar Memoria',
    memoryProposalTitle: '¿Guardar decisión del commit en Memoria?',
    saveMemory: 'Guardar en Memoria',
    dismiss: 'Descartar',
    recommendedLabel: 'Sugerido',
    useSuggested: 'Usar',
    taskTagLabel: 'Tarea',
    splashBooting: 'Despertando a Orso y los motores locales...',
    splashCheckingDaemon: 'Conectando daemon local de orquestación',
    splashReady: 'Mesa lista',
    welcomeTitle: 'Orso ya está listo en tu mesa de trabajo.',
    welcomeSubtitle:
      'Vincula un repositorio Git local para orquestar Claude Code, Codex CLI y Antigravity juntos con aislamiento seguro en worktrees.',
    welcomeLinkCta: 'Vincular Repositorio Git Local',
    welcomeCap1Title: 'Rama Main Protegida',
    welcomeCap1Desc: 'Cada cambio corre en rama o worktree aislado con revisión de diff.',
    welcomeCap2Title: 'Relevo Multi-Motor',
    welcomeCap2Desc: 'Asigna tareas y pide segundas opiniones entre motores en segundos.',
    welcomeCap3Title: 'Memoria y MCP Local',
    welcomeCap3Desc: 'Convenciones persistentes del proyecto y herramientas MCP aprobadas.',
  },
};

export function resolveInitialLocale(stored: string | null): UiLocale {
  return stored === 'es' ? 'es' : 'en';
}

export function getUiDictionary(locale: UiLocale): UiDictionary {
  return DICTIONARIES[locale];
}

export function getOrsoStatusPhrase(
  locale: UiLocale,
  mood: OrsoMoodState,
  frameIndex: number,
): string {
  const dict = DICTIONARIES[locale];
  switch (mood) {
    case 'idle':
      return dict.orsoIdle;
    case 'typing':
      return dict.orsoTyping;
    case 'waiting':
      return dict.orsoWaiting;
    case 'committed':
      return dict.orsoCommitted;
    case 'working': {
      const phrases = ORSO_WORKING_PHRASES[locale];
      const normalizedIdx = ((frameIndex % phrases.length) + phrases.length) % phrases.length;
      return phrases[normalizedIdx] ?? phrases[0] ?? dict.orsoIdle;
    }
  }
}
