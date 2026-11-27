import { PaperPlaneRight, Stop } from '@phosphor-icons/react';
import { useRef, useState, type FormEvent } from 'react';
import type {
  ChangeCardSnapshot,
  ChatRecord,
  MessageRecord,
  ProjectWithGitStatus,
  TaskRunRecord,
  TestRunResult,
} from '@orchdeck/shared';
import type { V01ApprovalMode } from '../state/approval-mode';
import {
  formatModelLabel,
  type ModelOption,
  type StreamingTurnState,
  type ToolActivityEntry,
} from '../state/turn-stream';
import { ApprovalModePicker } from './ApprovalModePicker';
import { ChangeCard } from './ChangeCard';
import { EngineMark } from './EngineMark';
import { MarkdownContent } from './MarkdownContent';
import { ModelPicker } from './ModelPicker';
import { PlanApprovalCard } from './PlanApprovalCard';
import { ToolActivityBlock } from './ToolActivityBlock';

export interface MessageTurnMeta {
  readonly tools: readonly ToolActivityEntry[];
  readonly thinking?: string | undefined;
  readonly changedFiles?: readonly string[] | undefined;
}

export interface ChatWorkspaceProps {
  readonly project: ProjectWithGitStatus | null;
  readonly chat: ChatRecord | null;
  readonly messages: readonly MessageRecord[];
  readonly messageMetaById: Readonly<Record<string, MessageTurnMeta>>;
  readonly streaming: StreamingTurnState | null;
  readonly modelOptions: readonly ModelOption[];
  readonly chatModelHandle: string;
  readonly turnOverrideHandle: string | null;
  readonly approvalMode: V01ApprovalMode;
  readonly activeTaskRun: TaskRunRecord | null;
  readonly planActionBusy: boolean;
  readonly changeSnapshot: ChangeCardSnapshot | null;
  readonly testResult: TestRunResult | null;
  readonly loadingChanges: boolean;
  readonly runningTests: boolean;
  readonly committingChanges: boolean;
  readonly discardingChanges: boolean;
  readonly changeError: string | null;
  readonly changeNotice: string | null;
  readonly onChangeChatModel: (handle: string) => void;
  readonly onChangeTurnOverride: (handle: string | null) => void;
  readonly onChangeApprovalMode: (mode: V01ApprovalMode) => void;
  readonly onApprovePlan: (taskRunId: string) => Promise<void>;
  readonly onRejectPlan: (taskRunId: string) => Promise<void>;
  readonly onSendPrompt: (prompt: string) => Promise<void>;
  readonly onCancelTurn: (turnId: string) => Promise<void>;
  readonly onCreateChat: (projectId: string) => Promise<void>;
  readonly onRefreshChanges: () => Promise<void>;
  readonly onRunTests: () => Promise<void>;
  readonly onApproveChanges: (commitMessage: string) => Promise<void>;
  readonly onDiscardChanges: () => Promise<void>;
}

export function ChatWorkspace({
  project,
  chat,
  messages,
  messageMetaById,
  streaming,
  modelOptions,
  chatModelHandle,
  turnOverrideHandle,
  approvalMode,
  activeTaskRun,
  planActionBusy,
  changeSnapshot,
  testResult,
  loadingChanges,
  runningTests,
  committingChanges,
  discardingChanges,
  changeError,
  changeNotice,
  onChangeChatModel,
  onChangeTurnOverride,
  onChangeApprovalMode,
  onApprovePlan,
  onRejectPlan,
  onSendPrompt,
  onCancelTurn,
  onCreateChat,
  onRefreshChanges,
  onRunTests,
  onApproveChanges,
  onDiscardChanges,
}: ChatWorkspaceProps) {
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const effectiveHandle = turnOverrideHandle ?? chatModelHandle;

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

      <div className="flex flex-col gap-5">
        {messages.length === 0 && !streaming ? (
          <p className="m-0 text-[13px] text-ink-tertiary">
            Thread initialized. Press Ctrl+M to pick an engine and model, or Ctrl+Enter to send.
          </p>
        ) : null}

        {messages.map((msg) => {
          const meta = messageMetaById[msg.id];
          const modelLabel =
            msg.providerId && msg.modelId
              ? formatModelLabel(`${msg.providerId}:${msg.modelId}`, modelOptions)
              : (msg.modelId ?? msg.providerId ?? 'Assistant');

          return (
            <article
              key={msg.id}
              className={
                msg.role === 'user'
                  ? 'surface-card max-w-[68ch] px-4 py-3'
                  : 'border-l-2 border-border-strong py-0.5 pl-4'
              }
            >
              <div className="mb-1.5 flex items-center gap-2 text-[11.5px] text-ink-tertiary">
                {msg.providerId ? <EngineMark provider={msg.providerId} /> : null}
                <span className="font-medium text-ink-secondary">
                  {msg.role === 'user' ? 'You' : modelLabel}
                </span>
                <span className="tabular-mono">
                  {new Date(msg.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              {msg.role === 'assistant' && meta ? (
                <ToolActivityBlock
                  tools={meta.tools}
                  thinking={meta.thinking}
                  changedFiles={meta.changedFiles}
                />
              ) : null}

              {msg.role === 'user' ? (
                <div className="whitespace-pre-wrap text-[14px] text-ink">{msg.content}</div>
              ) : (
                <MarkdownContent content={msg.content} />
              )}
            </article>
          );
        })}

        {streaming ? (
          <article className="border-l-2 border-accent py-0.5 pl-4">
            <div className="mb-1.5 flex items-center gap-2 text-[11.5px] text-ink-secondary">
              <EngineMark provider={streaming.provider} />
              <span className="font-medium">
                {formatModelLabel(`${streaming.provider}:${streaming.modelId}`, modelOptions)}
              </span>
              <span className="tabular-mono text-ink-tertiary">streaming</span>
            </div>

            <ToolActivityBlock
              tools={streaming.tools}
              thinking={streaming.thinking}
              changedFiles={streaming.changedFiles}
              defaultExpanded
            />

            {streaming.rateLimitMessage ? (
              <div className="mb-2 rounded-[6px] bg-warn-bg px-2.5 py-1.5 text-[12px] text-warn">
                {streaming.rateLimitMessage}
              </div>
            ) : null}

            {streaming.text ? (
              <MarkdownContent content={streaming.text} />
            ) : (
              <p className="tabular-mono m-0 text-[12px] text-ink-tertiary">Awaiting output...</p>
            )}
          </article>
        ) : null}
      </div>

      {activeTaskRun && activeTaskRun.state === 'AWAITING_PLAN_APPROVAL' ? (
        <PlanApprovalCard
          taskRun={activeTaskRun}
          busy={planActionBusy}
          onApprovePlan={onApprovePlan}
          onRejectPlan={onRejectPlan}
        />
      ) : null}

      {project.isValidGitRepo ? (
        <ChangeCard
          branchName={project.currentBranch}
          testCommand={project.testCommand}
          snapshot={changeSnapshot}
          testResult={testResult}
          loading={loadingChanges}
          runningTests={runningTests}
          committing={committingChanges}
          discarding={discardingChanges}
          errorMessage={changeError}
          lastNotice={changeNotice}
          onRefresh={onRefreshChanges}
          onRunTests={onRunTests}
          onApprove={onApproveChanges}
          onDiscard={onDiscardChanges}
          onRequestChanges={(contextSummary) => {
            setPrompt((prev) => (prev.trim().length === 0 ? contextSummary : prev));
            composerRef.current?.focus();
          }}
        />
      ) : null}

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className={`surface-card p-3 ${
          approvalMode === 'express' ? 'border-t-2 border-t-warn' : ''
        }`}
      >
        <textarea
          ref={composerRef}
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
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <ModelPicker
              options={modelOptions}
              selectedHandle={effectiveHandle}
              isTurnOverride={turnOverrideHandle !== null}
              onSelectChatModel={onChangeChatModel}
              onSelectTurnOverride={onChangeTurnOverride}
            />
            <ApprovalModePicker
              mode={approvalMode}
              onChangeMode={onChangeApprovalMode}
              disabled={Boolean(streaming)}
            />
          </div>

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
