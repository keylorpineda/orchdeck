import type { ApprovalMode, ProviderId } from './adapter.js';

export type PluginProviderScope = ProviderId | 'mcp';

export type PluginConfigScope = 'global' | 'repo';

export type PluginToggleMode = 'cli_flag' | 'native_only';

export interface DiscoveredPlugin {
  readonly id: string;
  readonly name: string;
  readonly provider: PluginProviderScope;
  readonly scope: PluginConfigScope;
  readonly sourcePath: string;
  readonly installed: boolean;
  readonly activeInRepo: boolean;
  readonly toggleMode: PluginToggleMode;
  readonly cliFlagHint: string | null;
  readonly fallbackNotice: string | null;
  readonly description: string;
}

export interface DiscoveredSkill {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly sourcePath: string;
  readonly scope: PluginConfigScope;
  readonly provider: PluginProviderScope | 'portable';
  readonly activeInRepo: boolean;
  readonly charCount: number;
}

export interface McpServerDescriptor {
  readonly id: string;
  readonly name: string;
  readonly transport: 'stdio' | 'http';
  readonly commandOrUrl: string;
  readonly envKeys: readonly string[];
  readonly sourceProviders: readonly ProviderId[];
  readonly deduplicatedFor: readonly ProviderId[];
  readonly activeInRepo: boolean;
}

export interface McpPendingApproval {
  readonly id: string;
  readonly serverId: string;
  readonly toolName: string;
  readonly providerId: ProviderId;
  readonly approvalMode: ApprovalMode;
  readonly mutating: boolean;
  readonly argsSummary: string;
  readonly createdAt: string;
}

export interface McpHubStatus {
  readonly running: boolean;
  readonly url: string | null;
  readonly port: number | null;
  readonly servers: readonly McpServerDescriptor[];
  readonly pendingApprovals: readonly McpPendingApproval[];
}

export interface PluginsInspectParams {
  readonly projectId?: string | undefined;
  readonly repoPath?: string | undefined;
}

export interface PluginsInspectResult {
  readonly plugins: readonly DiscoveredPlugin[];
  readonly skills: readonly DiscoveredSkill[];
  readonly mcpServers: readonly McpServerDescriptor[];
}

export interface PluginsToggleParams {
  readonly projectId: string;
  readonly pluginId: string;
  readonly enabled: boolean;
}

export interface PluginsToggleResult {
  readonly pluginId: string;
  readonly enabled: boolean;
}

export interface SkillsToggleParams {
  readonly projectId: string;
  readonly skillId: string;
  readonly enabled: boolean;
}

export interface SkillsToggleResult {
  readonly skillId: string;
  readonly enabled: boolean;
}

export interface McpStatusParams {
  readonly projectId?: string | undefined;
}

export interface McpStatusResult {
  readonly status: McpHubStatus;
}

export interface McpDecideApprovalParams {
  readonly approvalId: string;
  readonly decision: 'approve' | 'deny';
}

export interface McpDecideApprovalResult {
  readonly resolved: boolean;
}

export interface McpApprovalRequiredNotificationParams {
  readonly approval: McpPendingApproval;
}
