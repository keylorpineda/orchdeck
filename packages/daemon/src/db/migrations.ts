export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

export const INITIAL_MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'initial_core_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL UNIQUE,
        default_branch TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        provider_id TEXT,
        model_id TEXT,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS usage_events (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        rate_limited INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    name: 'projects_test_cmd_and_chat_archive',
    sql: `
      ALTER TABLE projects ADD COLUMN test_command TEXT;
      ALTER TABLE chats ADD COLUMN archived_at TEXT;

      CREATE INDEX IF NOT EXISTS idx_chats_project_updated
        ON chats(project_id, updated_at DESC);

      CREATE INDEX IF NOT EXISTS idx_messages_chat_created
        ON messages(chat_id, created_at ASC);
    `,
  },
  {
    version: 3,
    name: 'fusion_recipes',
    sql: `
      CREATE TABLE IF NOT EXISTS recipes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        planner_model TEXT NOT NULL,
        builder_model TEXT NOT NULL,
        reviewer_model TEXT NOT NULL,
        fallback_model TEXT,
        max_review_retries INTEGER NOT NULL DEFAULT 2,
        is_builtin INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 4,
    name: 'worktree_metadata_columns',
    sql: `
      ALTER TABLE projects ADD COLUMN worktree_allowlist TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE projects ADD COLUMN worktree_setup_command TEXT;
      ALTER TABLE chats ADD COLUMN worktree_path TEXT;
      ALTER TABLE chats ADD COLUMN worktree_branch TEXT;
    `,
  },
  {
    version: 5,
    name: 'shared_project_memory',
    sql: `
      CREATE TABLE IF NOT EXISTS project_memory (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_project_memory_project_cat
        ON project_memory(project_id, category, updated_at DESC);
    `,
  },
];
