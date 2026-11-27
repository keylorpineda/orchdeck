import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  PROVIDER_IDS,
  isProviderId,
  redactSecrets,
  type ChatRecord,
  type MemoryCategory,
  type MessageRecord,
  type MessageRole,
  type ProjectMemoryEntry,
  type ProjectRecord,
  type ProviderId,
  type ProviderUsageSummary,
  type RecipeCreateParams,
  type RecipeRecord,
  type RecipeUpdateParams,
  type UsageSummaryResult,
  type UsageWindowBucket,
} from '@orchdeck/shared';
import { INITIAL_MIGRATIONS } from './migrations.js';

export interface CreateProjectInput {
  readonly name: string;
  readonly rootPath: string;
  readonly defaultBranch?: string | undefined;
  readonly testCommand?: string | null | undefined;
}

export interface UpdateProjectInput {
  readonly name?: string | undefined;
  readonly testCommand?: string | null | undefined;
  readonly worktreeAllowlist?: readonly string[] | undefined;
  readonly worktreeSetupCommand?: string | null | undefined;
}

export interface AppendMessageInput {
  readonly chatId: string;
  readonly role: MessageRole;
  readonly providerId?: ProviderId | null | undefined;
  readonly modelId?: string | null | undefined;
  readonly content: string;
}

export interface RecordUsageEventInput {
  readonly providerId: string;
  readonly modelId: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly durationMs: number;
  readonly rateLimited: boolean;
  readonly createdAt?: string | undefined;
}

export interface UsageEventRecord {
  readonly id: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly durationMs: number;
  readonly rateLimited: boolean;
  readonly createdAt: string;
}

function parseAllowlistJson(raw: unknown): readonly string[] {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  } catch {
    return [];
  }
}

function mapProjectRow(row: Record<string, unknown>): ProjectRecord {
  const testCommandRaw = row['test_command'];
  const setupRaw = row['worktree_setup_command'];
  return {
    id: String(row['id'] ?? ''),
    name: String(row['name'] ?? ''),
    rootPath: String(row['root_path'] ?? ''),
    defaultBranch: String(row['default_branch'] ?? 'main'),
    testCommand: typeof testCommandRaw === 'string' && testCommandRaw.length > 0 ? testCommandRaw : null,
    worktreeAllowlist: parseAllowlistJson(row['worktree_allowlist']),
    worktreeSetupCommand: typeof setupRaw === 'string' && setupRaw.length > 0 ? setupRaw : null,
    createdAt: String(row['created_at'] ?? ''),
    updatedAt: String(row['updated_at'] ?? ''),
  };
}

function mapChatRow(row: Record<string, unknown>): ChatRecord {
  const archivedRaw = row['archived_at'];
  const wtPathRaw = row['worktree_path'];
  const wtBranchRaw = row['worktree_branch'];
  return {
    id: String(row['id'] ?? ''),
    projectId: String(row['project_id'] ?? ''),
    title: String(row['title'] ?? ''),
    archivedAt: typeof archivedRaw === 'string' && archivedRaw.length > 0 ? archivedRaw : null,
    worktreePath: typeof wtPathRaw === 'string' && wtPathRaw.length > 0 ? wtPathRaw : null,
    worktreeBranch: typeof wtBranchRaw === 'string' && wtBranchRaw.length > 0 ? wtBranchRaw : null,
    createdAt: String(row['created_at'] ?? ''),
    updatedAt: String(row['updated_at'] ?? ''),
  };
}

function mapMessageRow(row: Record<string, unknown>): MessageRecord {
  const roleRaw = String(row['role'] ?? 'assistant');
  const role: MessageRole =
    roleRaw === 'user' || roleRaw === 'assistant' || roleRaw === 'system' ? roleRaw : 'assistant';
  const providerRaw = row['provider_id'];
  const providerId: ProviderId | null =
    typeof providerRaw === 'string' && isProviderId(providerRaw) ? providerRaw : null;
  const modelRaw = row['model_id'];

    return {
    id: String(row['id'] ?? ''),
    chatId: String(row['chat_id'] ?? ''),
    role,
    providerId,
    modelId: typeof modelRaw === 'string' && modelRaw.length > 0 ? modelRaw : null,
    content: String(row['content'] ?? ''),
    createdAt: String(row['created_at'] ?? ''),
  };
}

function mapRecipeRow(row: Record<string, unknown>): RecipeRecord {
  const fallbackRaw = row['fallback_model'];
  return {
    id: String(row['id'] ?? ''),
    name: String(row['name'] ?? ''),
    description: String(row['description'] ?? ''),
    plannerModel: String(row['planner_model'] ?? ''),
    builderModel: String(row['builder_model'] ?? ''),
    reviewerModel: String(row['reviewer_model'] ?? ''),
    fallbackModel:
      typeof fallbackRaw === 'string' && fallbackRaw.length > 0 ? fallbackRaw : null,
    maxReviewRetries: Number(row['max_review_retries'] ?? 2),
    isBuiltin: Number(row['is_builtin'] ?? 0) === 1,
    createdAt: String(row['created_at'] ?? ''),
    updatedAt: String(row['updated_at'] ?? ''),
  };
}

export class DaemonDatabase {
  readonly dbPath: string;
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    this.dbPath = path.resolve(dbPath);
    const parentDir = path.dirname(this.dbPath);
    fs.mkdirSync(parentDir, { recursive: true, mode: 0o700 });
    if (process.platform !== 'win32') {
      fs.chmodSync(parentDir, 0o700);
    }

    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA busy_timeout = 5000;');

    if (process.platform !== 'win32' && fs.existsSync(this.dbPath)) {
      fs.chmodSync(this.dbPath, 0o600);
    }

    this.applyMigrations();
    this.seedBuiltinRecipes();
  }

  private seedBuiltinRecipes(): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO recipes (
        id, name, description, planner_model, builder_model, reviewer_model,
        fallback_model, max_review_retries, is_builtin, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);

    const presets: readonly {
      readonly id: string;
      readonly name: string;
      readonly description: string;
      readonly planner: string;
      readonly builder: string;
      readonly reviewer: string;
      readonly fallback: string;
      readonly retries: number;
    }[] = [
      {
        id: 'builtin-balanced',
        name: 'Balanced Team (Neon -> Codex -> Opus)',
        description: 'Gemini 4 Neon plans, Codex builds on task branch, Claude Opus reviews read-only.',
        planner: 'antigravity:gemini-4-neon:high',
        builder: 'codex:gpt-5.4:high',
        reviewer: 'claude:opus-4-6:high',
        fallback: 'claude:sonnet-4-6:medium',
        retries: 2,
      },
      {
        id: 'builtin-claude-codex',
        name: 'Claude Architect + Codex Builder',
        description: 'Claude Opus plans and reviews; Codex executes implementation.',
        planner: 'claude:opus-4-6:high',
        builder: 'codex:gpt-5.4:high',
        reviewer: 'claude:opus-4-6:high',
        fallback: 'antigravity:gemini-4-neon:high',
        retries: 2,
      },
      {
        id: 'builtin-fast-iterate',
        name: 'Fast Iterate',
        description: 'Quick multi-model cycle with 1 bounded review retry.',
        planner: 'claude:sonnet-4-6:medium',
        builder: 'codex:gpt-5.4:high',
        reviewer: 'claude:sonnet-4-6:medium',
        fallback: 'antigravity:gemini-4-neon:high',
        retries: 1,
      },
    ];

    for (const preset of presets) {
      stmt.run(
        preset.id,
        preset.name,
        preset.description,
        preset.planner,
        preset.builder,
        preset.reviewer,
        preset.fallback,
        preset.retries,
        now,
        now,
      );
    }
  }

  private applyMigrations(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);

    const currentVersion = this.getSchemaVersion();
    const insertMigration = this.db.prepare(
      'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
    );

    for (const migration of INITIAL_MIGRATIONS) {
      if (migration.version <= currentVersion) {
        continue;
      }
      this.db.exec('BEGIN IMMEDIATE;');
      try {
        this.db.exec(migration.sql);
        insertMigration.run(migration.version, migration.name, new Date().toISOString());
        this.db.exec('COMMIT;');
      } catch (err) {
        this.db.exec('ROLLBACK;');
        throw err;
      }
    }
  }

  getJournalMode(): string {
    const row = this.db.prepare('PRAGMA journal_mode;').get() as
      | Record<string, unknown>
      | undefined;
    const mode = row?.['journal_mode'];
    return typeof mode === 'string' ? mode.toLowerCase() : 'unknown';
  }

  getSchemaVersion(): number {
    const row = this.db
      .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations')
      .get() as Record<string, unknown> | undefined;
    const version = row?.['version'];
    return typeof version === 'number' ? version : 0;
  }

  setKv(key: string, value: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
        INSERT INTO kv_store (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
        `,
      )
      .run(key, value, now);
  }

  getKv(key: string): string | null {
    const row = this.db
      .prepare('SELECT value FROM kv_store WHERE key = ?')
      .get(key) as Record<string, unknown> | undefined;
    const value = row?.['value'];
    return typeof value === 'string' ? value : null;
  }

  createProject(input: CreateProjectInput): ProjectRecord {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const normalizedRoot = path.resolve(input.rootPath);
    const defaultBranch = input.defaultBranch ?? 'main';
    const testCommand =
      input.testCommand && input.testCommand.trim().length > 0 ? input.testCommand.trim() : null;

    this.db
      .prepare(
        `
        INSERT INTO projects (id, name, root_path, default_branch, test_command, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(id, input.name, normalizedRoot, defaultBranch, testCommand, now, now);

    return {
      id,
      name: input.name,
      rootPath: normalizedRoot,
      defaultBranch,
      testCommand,
      createdAt: now,
      updatedAt: now,
    };
  }

  getProject(id: string): ProjectRecord | null {
    const row = this.db
      .prepare(
        `
        SELECT id, name, root_path, default_branch, test_command,
               worktree_allowlist, worktree_setup_command, created_at, updated_at
        FROM projects
        WHERE id = ?
        `,
      )
      .get(id) as Record<string, unknown> | undefined;

    return row ? mapProjectRow(row) : null;
  }

  updateProject(id: string, input: UpdateProjectInput): ProjectRecord {
    const existing = this.getProject(id);
    if (!existing) {
      throw new Error(`Project "${id}" not found.`);
    }

    const nextName =
      input.name !== undefined && input.name.trim().length > 0 ? input.name.trim() : existing.name;
    const nextTestCommand =
      input.testCommand === undefined
        ? existing.testCommand
        : input.testCommand !== null && input.testCommand.trim().length > 0
          ? input.testCommand.trim()
          : null;
    const nextAllowlist =
      input.worktreeAllowlist !== undefined
        ? [...input.worktreeAllowlist]
        : [...(existing.worktreeAllowlist ?? [])];
    const nextSetupCommand =
      input.worktreeSetupCommand === undefined
        ? (existing.worktreeSetupCommand ?? null)
        : input.worktreeSetupCommand !== null && input.worktreeSetupCommand.trim().length > 0
          ? input.worktreeSetupCommand.trim()
          : null;
    const now = new Date().toISOString();

    this.db
      .prepare(
        `
        UPDATE projects
        SET name = ?, test_command = ?, worktree_allowlist = ?, worktree_setup_command = ?, updated_at = ?
        WHERE id = ?
        `,
      )
      .run(nextName, nextTestCommand, JSON.stringify(nextAllowlist), nextSetupCommand, now, id);

    return {
      ...existing,
      name: nextName,
      testCommand: nextTestCommand,
      worktreeAllowlist: nextAllowlist,
      worktreeSetupCommand: nextSetupCommand,
      updatedAt: now,
    };
  }

  deleteProject(id: string): boolean {
    const result = this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    return Number(result.changes) > 0;
  }

  listProjects(): ProjectRecord[] {
    const rows = this.db
      .prepare(
        `
        SELECT id, name, root_path, default_branch, test_command,
               worktree_allowlist, worktree_setup_command, created_at, updated_at
        FROM projects
        ORDER BY updated_at DESC, name ASC
        `,
      )
      .all() as Array<Record<string, unknown>>;

    return rows.map(mapProjectRow);
  }

  createChat(projectId: string, title = 'New chat'): ChatRecord {
    const project = this.getProject(projectId);
    if (!project) {
      throw new Error(`Project "${projectId}" not found.`);
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const cleanTitle = title.trim().length > 0 ? title.trim() : 'New chat';

    this.db.exec('BEGIN IMMEDIATE;');
    try {
      this.db
        .prepare(
          `
          INSERT INTO chats (id, project_id, title, archived_at, created_at, updated_at)
          VALUES (?, ?, ?, NULL, ?, ?)
          `,
        )
        .run(id, projectId, cleanTitle, now, now);

      this.db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, projectId);
      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }

    return {
      id,
      projectId,
      title: cleanTitle,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  getChat(id: string): ChatRecord | null {
    const row = this.db
      .prepare(
        `
        SELECT id, project_id, title, archived_at, worktree_path, worktree_branch, created_at, updated_at
        FROM chats
        WHERE id = ?
        `,
      )
      .get(id) as Record<string, unknown> | undefined;

    return row ? mapChatRow(row) : null;
  }

  listChats(projectId: string, includeArchived = false): ChatRecord[] {
    const sql = includeArchived
      ? `
        SELECT id, project_id, title, archived_at, worktree_path, worktree_branch, created_at, updated_at
        FROM chats
        WHERE project_id = ?
        ORDER BY updated_at DESC, created_at DESC
        `
      : `
        SELECT id, project_id, title, archived_at, worktree_path, worktree_branch, created_at, updated_at
        FROM chats
        WHERE project_id = ? AND archived_at IS NULL
        ORDER BY updated_at DESC, created_at DESC
        `;

    const rows = this.db.prepare(sql).all(projectId) as Array<Record<string, unknown>>;
    return rows.map(mapChatRow);
  }

  renameChat(id: string, title: string): ChatRecord {
    const existing = this.getChat(id);
    if (!existing) {
      throw new Error(`Chat "${id}" not found.`);
    }
    const cleanTitle = title.trim();
    if (cleanTitle.length === 0) {
      throw new Error('Chat title must not be empty.');
    }
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE chats SET title = ?, updated_at = ? WHERE id = ?')
      .run(cleanTitle, now, id);

    return {
      ...existing,
      title: cleanTitle,
      updatedAt: now,
    };
  }

  archiveChat(id: string, archived: boolean): ChatRecord {
    const existing = this.getChat(id);
    if (!existing) {
      throw new Error(`Chat "${id}" not found.`);
    }
    const now = new Date().toISOString();
    const archivedAt = archived ? now : null;
    this.db
      .prepare('UPDATE chats SET archived_at = ?, updated_at = ? WHERE id = ?')
      .run(archivedAt, now, id);

    return {
      ...existing,
      archivedAt,
      updatedAt: now,
    };
  }

  deleteChat(id: string): boolean {
    const result = this.db.prepare('DELETE FROM chats WHERE id = ?').run(id);
    return Number(result.changes) > 0;
  }

  setChatWorktree(
    chatId: string,
    worktreePath: string | null,
    worktreeBranch: string | null,
  ): ChatRecord {
    const existing = this.getChat(chatId);
    if (!existing) {
      throw new Error(`Chat "${chatId}" not found.`);
    }
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
        UPDATE chats
        SET worktree_path = ?, worktree_branch = ?, updated_at = ?
        WHERE id = ?
        `,
      )
      .run(worktreePath, worktreeBranch, now, chatId);

    return {
      ...existing,
      worktreePath,
      worktreeBranch,
      updatedAt: now,
    };
  }

  listProjectChatWorktrees(projectId: string): string[] {
    const rows = this.db
      .prepare(
        `
        SELECT worktree_path
        FROM chats
        WHERE project_id = ? AND worktree_path IS NOT NULL
        `,
      )
      .all(projectId) as Array<Record<string, unknown>>;

    return rows
      .map((row) => row['worktree_path'])
      .filter((val): val is string => typeof val === 'string' && val.length > 0);
  }

  appendMessage(input: AppendMessageInput): MessageRecord {
    const chat = this.getChat(input.chatId);
    if (!chat) {
      throw new Error(`Chat "${input.chatId}" not found.`);
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const redactedContent = redactSecrets(input.content);
    const providerId = input.providerId ?? null;
    const modelId = input.modelId ?? null;

    this.db.exec('BEGIN IMMEDIATE;');
    try {
      this.db
        .prepare(
          `
          INSERT INTO messages (id, chat_id, role, provider_id, model_id, content, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(id, input.chatId, input.role, providerId, modelId, redactedContent, now);

      this.db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(now, input.chatId);
      this.db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, chat.projectId);
      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }

    return {
      id,
      chatId: input.chatId,
      role: input.role,
      providerId,
      modelId,
      content: redactedContent,
      createdAt: now,
    };
  }

  listMessages(chatId: string): MessageRecord[] {
    const rows = this.db
      .prepare(
        `
        SELECT id, chat_id, role, provider_id, model_id, content, created_at
        FROM messages
        WHERE chat_id = ?
        ORDER BY created_at ASC, rowid ASC
        `,
      )
      .all(chatId) as Array<Record<string, unknown>>;

    return rows.map(mapMessageRow);
  }

  recordUsageEvent(input: RecordUsageEventInput): UsageEventRecord {
    const id = crypto.randomUUID();
    const now = input.createdAt ?? new Date().toISOString();
    const rateLimitedInt = input.rateLimited ? 1 : 0;

    this.db
      .prepare(
        `
        INSERT INTO usage_events (
          id, provider_id, model_id, input_tokens, output_tokens,
          cache_read_tokens, duration_ms, rate_limited, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        id,
        input.providerId,
        input.modelId,
        input.inputTokens,
        input.outputTokens,
        input.cacheReadTokens,
        input.durationMs,
        rateLimitedInt,
        now,
      );

    return {
      id,
      providerId: input.providerId,
      modelId: input.modelId,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      cacheReadTokens: input.cacheReadTokens,
      durationMs: input.durationMs,
      rateLimited: input.rateLimited,
      createdAt: now,
    };
  }

  listUsageEvents(): UsageEventRecord[] {
    const rows = this.db
      .prepare(
        `
        SELECT id, provider_id, model_id, input_tokens, output_tokens,
               cache_read_tokens, duration_ms, rate_limited, created_at
        FROM usage_events
        ORDER BY created_at DESC
        `,
      )
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row['id'] ?? ''),
      providerId: String(row['provider_id'] ?? ''),
      modelId: String(row['model_id'] ?? ''),
      inputTokens: Number(row['input_tokens'] ?? 0),
      outputTokens: Number(row['output_tokens'] ?? 0),
      cacheReadTokens: Number(row['cache_read_tokens'] ?? 0),
      durationMs: Number(row['duration_ms'] ?? 0),
      rateLimited: Number(row['rate_limited'] ?? 0) === 1,
      createdAt: String(row['created_at'] ?? ''),
    }));
  }

  private queryUsageWindow(
    providerId: ProviderId,
    windowHours: number,
    cutoffIso: string,
  ): UsageWindowBucket {
    const row = this.db
      .prepare(
        `
        SELECT
          COUNT(*) AS total_turns,
          COALESCE(SUM(input_tokens), 0) AS input_tokens,
          COALESCE(SUM(output_tokens), 0) AS output_tokens,
          COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
          COALESCE(SUM(duration_ms), 0) AS total_duration_ms,
          COALESCE(SUM(rate_limited), 0) AS rate_limit_count
        FROM usage_events
        WHERE provider_id = ? AND created_at >= ?
        `,
      )
      .get(providerId, cutoffIso) as Record<string, unknown> | undefined;

    return {
      windowHours,
      totalTurns: Number(row?.['total_turns'] ?? 0),
      inputTokens: Number(row?.['input_tokens'] ?? 0),
      outputTokens: Number(row?.['output_tokens'] ?? 0),
      cacheReadTokens: Number(row?.['cache_read_tokens'] ?? 0),
      totalDurationMs: Number(row?.['total_duration_ms'] ?? 0),
      rateLimitCount: Number(row?.['rate_limit_count'] ?? 0),
    };
  }

  getUsageSummary(providerFilter?: ProviderId): UsageSummaryResult {
    const nowMs = Date.now();
    const cutoff5h = new Date(nowMs - 5 * 3600_000).toISOString();
    const cutoff7d = new Date(nowMs - 7 * 24 * 3600_000).toISOString();
    const targetProviders = providerFilter ? [providerFilter] : PROVIDER_IDS;

    const providers: ProviderUsageSummary[] = targetProviders.map((providerId) => ({
      providerId,
      status: 'available',
      cooldownUntil: null,
      lastRateLimitMessage: null,
      last5Hours: this.queryUsageWindow(providerId, 5, cutoff5h),
      last7Days: this.queryUsageWindow(providerId, 168, cutoff7d),
      calibration: {
        label: 'Local Calibration',
        sampleCount: 0,
        observedCeilingTokens: null,
        pressureBlocks: 0,
        localCliLogEvents: 0,
      },
    }));

    return {
      generatedAt: new Date(nowMs).toISOString(),
      providers,
    };
  }

  listRecipes(): RecipeRecord[] {
    const rows = this.db
      .prepare(
        `
        SELECT id, name, description, planner_model, builder_model, reviewer_model,
               fallback_model, max_review_retries, is_builtin, created_at, updated_at
        FROM recipes
        ORDER BY is_builtin DESC, created_at ASC
        `,
      )
      .all() as Array<Record<string, unknown>>;

    return rows.map(mapRecipeRow);
  }

  getRecipe(id: string): RecipeRecord | null {
    const row = this.db
      .prepare(
        `
        SELECT id, name, description, planner_model, builder_model, reviewer_model,
               fallback_model, max_review_retries, is_builtin, created_at, updated_at
        FROM recipes
        WHERE id = ?
        `,
      )
      .get(id) as Record<string, unknown> | undefined;

    return row ? mapRecipeRow(row) : null;
  }

  createRecipe(input: RecipeCreateParams): RecipeRecord {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const maxRetries = Math.max(0, Math.min(5, input.maxReviewRetries ?? 2));
    const fallbackModel =
      input.fallbackModel && input.fallbackModel.trim().length > 0
        ? input.fallbackModel.trim()
        : null;

    this.db
      .prepare(
        `
        INSERT INTO recipes (
          id, name, description, planner_model, builder_model, reviewer_model,
          fallback_model, max_review_retries, is_builtin, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
        `,
      )
      .run(
        id,
        input.name.trim(),
        input.description.trim(),
        input.plannerModel.trim(),
        input.builderModel.trim(),
        input.reviewerModel.trim(),
        fallbackModel,
        maxRetries,
        now,
        now,
      );

    return {
      id,
      name: input.name.trim(),
      description: input.description.trim(),
      plannerModel: input.plannerModel.trim(),
      builderModel: input.builderModel.trim(),
      reviewerModel: input.reviewerModel.trim(),
      fallbackModel,
      maxReviewRetries: maxRetries,
      isBuiltin: false,
      createdAt: now,
      updatedAt: now,
    };
  }

  updateRecipe(input: RecipeUpdateParams): RecipeRecord {
    const existing = this.getRecipe(input.id);
    if (!existing) {
      throw new Error(`Recipe "${input.id}" not found.`);
    }

    const name = input.name?.trim() || existing.name;
    const description = input.description !== undefined ? input.description.trim() : existing.description;
    const plannerModel = input.plannerModel?.trim() || existing.plannerModel;
    const builderModel = input.builderModel?.trim() || existing.builderModel;
    const reviewerModel = input.reviewerModel?.trim() || existing.reviewerModel;
    const fallbackModel =
      input.fallbackModel === undefined
        ? existing.fallbackModel
        : input.fallbackModel && input.fallbackModel.trim().length > 0
          ? input.fallbackModel.trim()
          : null;
    const maxReviewRetries =
      input.maxReviewRetries !== undefined
        ? Math.max(0, Math.min(5, input.maxReviewRetries))
        : existing.maxReviewRetries;
    const now = new Date().toISOString();

    this.db
      .prepare(
        `
        UPDATE recipes
        SET name = ?, description = ?, planner_model = ?, builder_model = ?,
            reviewer_model = ?, fallback_model = ?, max_review_retries = ?, updated_at = ?
        WHERE id = ?
        `,
      )
      .run(
        name,
        description,
        plannerModel,
        builderModel,
        reviewerModel,
        fallbackModel,
        maxReviewRetries,
        now,
        input.id,
      );

    return {
      ...existing,
      name,
      description,
      plannerModel,
      builderModel,
      reviewerModel,
      fallbackModel,
      maxReviewRetries,
      updatedAt: now,
    };
  }

  deleteRecipe(id: string): boolean {
    const existing = this.getRecipe(id);
    if (!existing) {
      return false;
    }
    if (existing.isBuiltin) {
      throw new Error('Built-in recipes cannot be deleted.');
    }
    const result = this.db.prepare('DELETE FROM recipes WHERE id = ?').run(id);
    return Number(result.changes) > 0;
  }

  listProjectMemory(projectId: string): ProjectMemoryEntry[] {
    const rows = this.db
      .prepare(
        `
        SELECT id, project_id, category, title, content, created_at, updated_at
        FROM project_memory
        WHERE project_id = ?
        ORDER BY updated_at DESC, created_at DESC
        `,
      )
      .all(projectId) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row['id']),
      projectId: String(row['project_id']),
      category:
        row['category'] === 'decision' ||
        row['category'] === 'convention' ||
        row['category'] === 'open_item'
          ? row['category']
          : 'convention',
      title: String(row['title']),
      content: String(row['content']),
      createdAt: String(row['created_at']),
      updatedAt: String(row['updated_at']),
    }));
  }

  upsertProjectMemory(input: {
    readonly projectId: string;
    readonly id?: string | undefined;
    readonly category: MemoryCategory;
    readonly title: string;
    readonly content: string;
  }): ProjectMemoryEntry {
    const now = new Date().toISOString();
    const title = input.title.trim();
    const content = input.content.trim();
    if (title.length === 0 || content.length === 0) {
      throw new Error('Memory entry requires non-empty title and content.');
    }

    if (input.id) {
      const existing = this.db
        .prepare('SELECT id, created_at FROM project_memory WHERE id = ? AND project_id = ?')
        .get(input.id, input.projectId) as Record<string, unknown> | undefined;
      if (existing) {
        this.db
          .prepare(
            'UPDATE project_memory SET category = ?, title = ?, content = ?, updated_at = ? WHERE id = ?',
          )
          .run(input.category, title, content, now, input.id);
        return {
          id: input.id,
          projectId: input.projectId,
          category: input.category,
          title,
          content,
          createdAt: String(existing['created_at']),
          updatedAt: now,
        };
      }
    }

    const id = input.id ?? crypto.randomUUID();
    this.db
      .prepare(
        `
        INSERT INTO project_memory (id, project_id, category, title, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(id, input.projectId, input.category, title, content, now, now);

    return {
      id,
      projectId: input.projectId,
      category: input.category,
      title,
      content,
      createdAt: now,
      updatedAt: now,
    };
  }

  deleteProjectMemory(id: string): boolean {
    const result = this.db.prepare('DELETE FROM project_memory WHERE id = ?').run(id);
    return Number(result.changes) > 0;
  }

  close(): void {
    this.db.close();
  }
}
