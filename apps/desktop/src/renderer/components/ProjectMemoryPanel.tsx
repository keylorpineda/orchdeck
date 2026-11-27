import type {
  MemoryCategory,
  MemoryDocTarget,
  ProjectMemoryEntry,
} from '@orchdeck/shared';
import { ArrowsClockwise, Trash } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import { useLanguage } from './LanguageProvider';

export interface ProjectMemoryPanelProps {
  readonly projectId: string | null;
  readonly entries: readonly ProjectMemoryEntry[];
  readonly promptPreview: string;
  readonly maxChars: number;
  readonly errorMessage?: string | null | undefined;
  readonly statusMessage?: string | null | undefined;
  readonly onUpsert: (input: {
    readonly category: MemoryCategory;
    readonly title: string;
    readonly content: string;
  }) => Promise<void> | void;
  readonly onDelete: (id: string) => Promise<void> | void;
  readonly onSyncDoc: (target: MemoryDocTarget) => Promise<void> | void;
  readonly onImportDoc: (target: MemoryDocTarget) => Promise<void> | void;
}

export function ProjectMemoryPanel({
  projectId,
  entries,
  promptPreview,
  maxChars,
  errorMessage,
  statusMessage,
  onUpsert,
  onDelete,
  onSyncDoc,
  onImportDoc,
}: ProjectMemoryPanelProps) {
  const { dict } = useLanguage();
  const [category, setCategory] = useState<MemoryCategory>('decision');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!projectId || title.trim().length === 0 || content.trim().length === 0) {
      return;
    }
    await onUpsert({ category, title: title.trim(), content: content.trim() });
    setTitle('');
    setContent('');
  };

  const categoryLabel = (cat: MemoryCategory): string => {
    switch (cat) {
      case 'decision':
        return dict.memoryDecision;
      case 'convention':
        return dict.memoryConvention;
      case 'open_item':
        return dict.memoryOpenItem;
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="tabular-mono uppercase tracking-[0.06em] text-ink-tertiary">
          {dict.memoryBudget}
        </span>
        <span className="tabular-mono text-ink-secondary">
          {promptPreview.length} / {maxChars} ch
        </span>
      </div>

      {errorMessage ? (
        <div className="rounded-[6px] border border-fail bg-fail-bg px-2.5 py-1.5 text-[11.5px] text-fail">
          {errorMessage}
        </div>
      ) : null}

      {statusMessage ? (
        <div className="rounded-[6px] border border-pass bg-pass-bg px-2.5 py-1.5 text-[11.5px] text-pass">
          {statusMessage}
        </div>
      ) : null}

      <form onSubmit={(e) => void handleSubmit(e)} className="surface-card flex flex-col gap-2 p-2.5">
        <div className="flex items-center gap-1">
          {(['decision', 'convention', 'open_item'] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`orch-transition rounded-[4px] border px-2 py-0.5 text-[10.5px] ${
                category === cat
                  ? 'border-accent bg-accent-soft font-medium text-accent'
                  : 'border-border-subtle bg-canvas text-ink-secondary'
              }`}
            >
              {categoryLabel(cat)}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Short title..."
          disabled={!projectId}
          className="rounded-[4px] border border-border-subtle bg-canvas px-2 py-1 text-[12px] text-ink outline-none focus:border-border-strong"
        />

        <textarea
          rows={2}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Decision, convention, or open item (never secrets)..."
          disabled={!projectId}
          className="resize-none rounded-[4px] border border-border-subtle bg-canvas px-2 py-1 text-[12px] text-ink outline-none focus:border-border-strong"
        />

        <button
          type="submit"
          disabled={!projectId || title.trim().length === 0 || content.trim().length === 0}
          className="rounded-[4px] bg-accent px-2.5 py-1 text-[11.5px] font-medium text-surface disabled:opacity-50"
        >
          {dict.addMemory}
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={!projectId}
          onClick={() => void onSyncDoc('AGENTS.md')}
          className="orch-transition inline-flex items-center gap-1 rounded-[4px] border border-border-subtle bg-inset px-2 py-1 text-[11px] text-ink-secondary hover:text-ink disabled:opacity-50"
        >
          <ArrowsClockwise size={11} weight="regular" />
          Sync AGENTS.md
        </button>
        <button
          type="button"
          disabled={!projectId}
          onClick={() => void onSyncDoc('CLAUDE.md')}
          className="orch-transition inline-flex items-center gap-1 rounded-[4px] border border-border-subtle bg-inset px-2 py-1 text-[11px] text-ink-secondary hover:text-ink disabled:opacity-50"
        >
          <ArrowsClockwise size={11} weight="regular" />
          Sync CLAUDE.md
        </button>
        <button
          type="button"
          disabled={!projectId}
          onClick={() => void onImportDoc('AGENTS.md')}
          className="orch-transition rounded-[4px] border border-border-subtle bg-canvas px-2 py-1 text-[11px] text-ink-secondary hover:text-ink disabled:opacity-50"
        >
          Import AGENTS.md
        </button>
      </div>

      <div className="pixel-rule" />

      <div className="flex flex-col gap-1.5">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="surface-card flex items-start justify-between gap-2 px-2.5 py-2 text-[11.5px]"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="tabular-mono rounded-[4px] border border-border-subtle bg-inset px-1 py-0.5 text-[9.5px] uppercase text-ink-secondary">
                  {categoryLabel(entry.category)}
                </span>
                <span className="truncate font-medium text-ink">{entry.title}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-ink-secondary">{entry.content}</p>
            </div>
            <button
              type="button"
              onClick={() => void onDelete(entry.id)}
              aria-label={`Delete ${entry.title}`}
              className="orch-transition shrink-0 rounded-[4px] p-1 text-ink-tertiary hover:bg-fail-bg hover:text-fail"
            >
              <Trash size={12} weight="regular" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
