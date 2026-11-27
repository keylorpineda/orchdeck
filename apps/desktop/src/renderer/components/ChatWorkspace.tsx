import { PaperPlaneRight, Stop } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import type {
  ChatRecord,
  MessageRecord,
  ProjectWithGitStatus,
  ProviderId,
} from '@orchdeck/shared';
import { EngineMark } from './EngineMark';

export interface StreamingDraft {
  readonly turnId: string;
  readonly provider: ProviderId;
  readonly modelId: string;
  readonly text: string;
}

export interface ChatWorkspaceProps {
  readonly project: ProjectWithGitStatus | null;
  readonly chat: ChatRecord | null;
  readonly messages: readonly MessageRecord[];
  readonly streaming: StreamingDraft | null;
  readonly selectedModelHandle: string;
  readonly onChangeModelHandle: (handle: string) => void;
  readonly onSendPrompt: (prompt: string) => Promise<void>;
  readonly onCancelTurn: (turnId: string) => Promise<void>;
  readonly onCreateChat: (projectId: string) => Promise<void>;
}

const DEFAULT_MODEL_OPTIONS: ReadonlyArray<{ readonly handle: string; readonly label: string }> = [
  { handle: 'claude:opus-4-6:high', label: 'Claude Opus 4.6' },
  { handle: 'codex:gpt-5-codex:high', label: 'GPT-5 Codex' },
  { handle: 'antigravity:gemini-4-neon:high', label: 'Gemini 4 Neon' },
];

export function ChatWorkspace({
  project,
  chat,
  messages,
  streaming,
  selectedModelHandle,
  onChangeModelHandle,
  onSendPrompt,
  onCancelTurn,
  onCreateChat,
}: ChatWorkspaceProps) {
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);

  if (!project) {
    return (
      <section className="surface-card p-6">
        <p className="tabular-mono m-0 text-[11.5px] uppercase tracking-[0.06em] text-ink-tertiary">
          Workbench Ready
        </p>
        <h1 className="mt-1 mb-2 font-[var(--font-editorial)] text-[24px] font-medium tracking-[-0.015em] text-ink">
          Link a local Git repository
        </h1>
        <p className="m-0 text-ink-secondary">
          Select a repository folder from the sidebar to inspect live branch status and keep
          persistent conversation threads backed by SQLite WAL.
        </p>
      </section>
    );
  }

  if (!chat) {
    return (
      <section className="surface-card p-6">
        <h1 className="m-0 font-[var(--font-editorial)] text-[24px] font-medium tracking-[-0.015em] text-ink">
          {project.name}
        </h1>
        <p className="tabular-mono mt-1 mb-4 text-[11.5px] text-ink-secondary">
          {project.rootPath} · {project.currentBranch ?? 'unavailable'}
        </p>
        <button
          type="button"
          onClick={() => void onCreateChat(project.id)}
          className="orch-transition rounded-[6px] border border-accent bg-accent px-3.5 py-1.5 text-[12.5px] font-medium text-surface hover:border-accent-hover hover:bg-accent-hover"
        >
          Start New Chat
        </button>
      </section>
    );
  }

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (trimmed.length === 0 || sending || streaming) {
      return;
    }
    setSending(true);
    setPrompt('');
    try {
      await onSendPrompt(trimmed);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="border-b border-border-subtle pb-4">
        <h1 className="m-0 font-[var(--font-editorial)] text-[24px] font-medium tracking-[-0.015em] text-ink">
          {project.name}
        </h1>
        <div className="tabular-mono mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-secondary">
          <span>{chat.title}</span>
          <span className="text-ink-tertiary">·</span>
          <span>{project.rootPath}</span>
          {project.testCommand ? (
            <>
              <span className="text-ink-tertiary">·</span>
              <span>test: {project.testCommand}</span>
            </>
          ) : null}
        </div>
      </header>

      <div className="flex flex-col gap-4">
        {messages.length === 0 && !streaming ? (
          <p className="m-0 text-[13px] text-ink-tertiary">
            Thread initialized. Messages persist automatically across restarts.
          </p>
        ) : null}

        {messages.map((msg) => (
          <article
            key={msg.id}
            className={
              msg.role === 'user'
                ? 'surface-card px-4 py-3'
                : 'border-l-2 border-border-strong pl-4 py-1'
            }
          >
            <div className="mb-1 flex items-center gap-2 text-[11.5px] text-ink-tertiary">
              {msg.providerId ? <EngineMark provider={msg.providerId} /> : null}
              <span className="font-medium text-ink-secondary">
                {msg.role === 'user' ? 'You' : (msg.modelId ?? msg.providerId ?? 'Assistant')}
              </span>
              <span className="tabular-mono">
                {new Date(msg.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <div className="whitespace-pre-wrap text-[14px] text-ink">{msg.content}</div>
          </article>
        ))}

        {streaming ? (
          <article className="border-l-2 border-accent pl-4 py-1">
            <div className="mb-1 flex items-center gap-2 text-[11.5px] text-ink-secondary">
              <EngineMark provider={streaming.provider} />
              <span className="font-medium">{streaming.modelId}</span>
              <span className="tabular-mono text-ink-tertiary">streaming</span>
            </div>
            <div className="whitespace-pre-wrap text-[14px] text-ink">
              {streaming.text || '...'}
            </div>
          </article>
        ) : null}
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="surface-card p-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void handleSubmit(e);
            }
          }}
          rows={3}
          placeholder={`Direct ${project.name} (${project.currentBranch ?? 'repo'})...`}
          className="w-full resize-none border-0 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-tertiary"
        />
        <div className="mt-2 flex items-center justify-between border-t border-border-subtle pt-2">
          <select
            value={selectedModelHandle}
            onChange={(e) => onChangeModelHandle(e.target.value)}
            aria-label="Select engine and model"
            className="tabular-mono rounded-[6px] border border-border-subtle bg-inset px-2 py-1 text-[11.5px] text-ink outline-none focus:border-accent"
          >
            {DEFAULT_MODEL_OPTIONS.map((opt) => (
              <option key={opt.handle} value={opt.handle}>
                {opt.label}
              </option>
            ))}
          </select>

          {streaming ? (
            <button
              type="button"
              onClick={() => void onCancelTurn(streaming.turnId)}
              className="orch-transition inline-flex items-center gap-1.5 rounded-[6px] border border-fail bg-fail-bg px-3 py-1 text-[12px] font-medium text-fail"
            >
              <Stop size={13} weight="regular" />
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={sending || prompt.trim().length === 0}
              className="orch-transition inline-flex items-center gap-1.5 rounded-[6px] border border-accent bg-accent px-3 py-1 text-[12px] font-medium text-surface hover:border-accent-hover hover:bg-accent-hover disabled:opacity-50"
            >
              <PaperPlaneRight size={13} weight="regular" />
              Send
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
