import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ProjectRecord } from '@orchdeck/shared';
import { INITIAL_MIGRATIONS } from './migrations.js';

export interface CreateProjectInput {
  readonly name: string;
  readonly rootPath: string;
  readonly defaultBranch?: string | undefined;
}

export interface RecordUsageEventInput {
  readonly providerId: string;
  readonly modelId: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly durationMs: number;
  readonly rateLimited: boolean;
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

    this.db
      .prepare(
        `
        INSERT INTO projects (id, name, root_path, default_branch, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        `,
      )
      .run(id, input.name, normalizedRoot, defaultBranch, now, now);

    return {
      id,
      name: input.name,
      rootPath: normalizedRoot,
      defaultBranch,
      createdAt: now,
      updatedAt: now,
    };
  }

  listProjects(): ProjectRecord[] {
    const rows = this.db
      .prepare(
        `
        SELECT id, name, root_path, default_branch, created_at, updated_at
        FROM projects
        ORDER BY updated_at DESC, name ASC
        `,
      )
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row['id'] ?? ''),
      name: String(row['name'] ?? ''),
      rootPath: String(row['root_path'] ?? ''),
      defaultBranch: String(row['default_branch'] ?? 'main'),
      createdAt: String(row['created_at'] ?? ''),
      updatedAt: String(row['updated_at'] ?? ''),
    }));
  }

  recordUsageEvent(input: RecordUsageEventInput): UsageEventRecord {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
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

  close(): void {
    this.db.close();
  }
}
