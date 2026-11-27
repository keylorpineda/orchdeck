import { GitBranch, PaperPlaneRight, Scales, Stop, Trash } from '@phosphor-icons/react';
import { Suspense, lazy, useRef, useState, type FormEvent } from 'react';
import {
  TASK_TAGS,
  parseInlineMention,
  type ApprovalMode,
  type ChangeCardSnapshot,
  type ChatRecord,
  type MessageRecord,
  type ModelRecommendation,
  type ProjectWithGitStatus,
  type RecipeCreateParams,
  type RecipeRecord,
  type RecipeRunRecord,
  type SecondOpinionRecord,
  type SecondOpinionResolution,
  type TaskRunRecord,
  type TaskTag,
  type TestRunResult,
} from '@orchdeck/shared';
import {
  formatModelLabel,
  type ModelOption,
  type StreamingTurnState,
  type ToolActivityEntry,
} from '../state/turn-stream';
import { ApprovalModePicker } from './ApprovalModePicker';
import { CoordinationLogCard } from './CoordinationLogCard';
import { EngineMark } from './EngineMark';
import { HandoffRelayBanner } from './HandoffRelayBanner';
import { useLanguage } from './LanguageProvider';
import { ModelPicker } from './ModelPicker';
import { PlanApprovalCard } from './PlanApprovalCard';
import { RecipePicker } from './RecipePicker';
import { ToolActivityBlock } from './ToolActivityBlock';
import { ZompoStatusStrip } from './ZompoStatusStrip';

const ChangeCard = lazy(() =>
  import('./ChangeCard').then((m) => ({ default: m.ChangeCard })),
);
const MarkdownContent = lazy(() =>
  import('./MarkdownContent').then((m) => ({ default: m.MarkdownContent })),
);
const SecondOpinionCard = lazy(() =>
  import('./SecondOpinionCard').then((m) => ({ default: m.SecondOpinionCard })),
);

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
  readonly approvalMode: ApprovalMode;
  readonly activeTaskRun: TaskRunRecord | null;
  readonly planActionBusy: boolean;
  readonly recipes: readonly RecipeRecord[];
  readonly selectedRecipeId: string | null;
  readonly activeRecipeRun: RecipeRunRecord | null;
  readonly activeSecondOpinion: SecondOpinionRecord | null;
  readonly secondOpinionBusy: boolean;
  readonly rateLimitBanner: string | null;
  readonly relayingHandoff: boolean;
  readonly handoffNotice: string | null;
  readonly changeSnapshot: ChangeCardSnapshot | null;
  readonly testResult: TestRunResult | null;
  readonly loadingChanges: boolean;
  readonly runningTests: boolean;
  readonly committingChanges: boolean;
  readonly discardingChanges: boolean;
  readonly integratingBranch: boolean;
  readonly worktreeBusy?: boolean | undefined;
  readonly changeError: string | null;
  readonly changeNotice: string | null;
  readonly taskTag?: TaskTag | undefined;
  readonly recommendation?: ModelRecommendation | null | undefined;
  readonly onChangeTaskTag?: ((tag: TaskTag) => void) | undefined;
  readonly onChangeChatModel: (handle: string) => void;
  readonly onChangeTurnOverride: (handle: string | null) => void;
  readonly onChangeApprovalMode: (mode: ApprovalMode) => void;
  readonly onSelectRecipe: (recipeId: string | null) => void;
  readonly onCreateRecipe: (params: RecipeCreateParams) => Promise<void>;
  readonly onDeleteRecipe: (recipeId: string) => Promise<void>;
  readonly onRelayHandoff: (targetModelHandle: string) => Promise<void>;
  readonly onStartSecondOpinion: (prompt: string, modelBHandle: string) => Promise<void>;
  readonly onResolveSecondOpinion: (
    secondOpinionId: string,
    resolution: SecondOpinionResolution,
    followUpPrompt: string,
  ) => Promise<void>;
  readonly onApprovePlan: (taskRunId: string) => Promise<void>;
  readonly onRejectPlan: (taskRunId: string) => Promise<void>;
  readonly onSendPrompt: (prompt: string) => Promise<void>;
  readonly onCancelTurn: (turnId: string) => Promise<void>;
  readonly onCreateChat: (projectId: string) => Promise<void>;
  readonly onRefreshChanges: () => Promise<void>;
  readonly onRunTests: () => Promise<void>;
  readonly onApproveChanges: (commitMessage: string) => Promise<void>;
  readonly onDiscardChanges: () => Promise<void>;
  readonly onIntegrateBranch: () => Promise<void>;
  readonly onCreateWorktree?: ((chatId: string) => Promise<void>) | undefined;
  readonly onRemoveWorktree?: ((chatId: string) => Promise<void>) | undefined;
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
  recipes,
  selectedRecipeId,
  activeRecipeRun,
  activeSecondOpinion,
  secondOpinionBusy,
  rateLimitBanner,
  relayingHandoff,
  handoffNotice,
  changeSnapshot,
  testResult,
  loadingChanges,
  runningTests,
  committingChanges,
  discardingChanges,
  integratingBranch,
  worktreeBusy = false,
  changeError,
  changeNotice,
  taskTag = 'feature',
  recommendation = null,
  onChangeTaskTag,
  onChangeChatModel,
  onChangeTurnOverride,
  onChangeApprovalMode,
  onSelectRecipe,
  onCreateRecipe,
  onDeleteRecipe,
  onRelayHandoff,
  onStartSecondOpinion,
  onResolveSecondOpinion,
  onApprovePlan,
  onRejectPlan,
  onSendPrompt,
  onCancelTurn,
  onCreateChat,
  onRefreshChanges,
  onRunTests,
  onApproveChanges,
  onDiscardChanges,
  onIntegrateBranch,
  onCreateWorktree,
  onRemoveWorktree,
}: ChatWorkspaceProps) {
  const { dict } = useLanguage();
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const effectiveHandle = turnOverrideHandle ?? chatModelHandle;
  const parsedMention = parseInlineMention(prompt);
  const zompoMood =
    streaming || activeRecipeRun?.status === 'RUNNING'
      ? 'working'
      : activeTaskRun?.state === 'AWAITING_PLAN_APPROVAL'
        ? 'waiting'
        : changeNotice && changeNotice.startsWith('Committed')
          ? 'committed'
          : 'idle';

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
          {dict.startNewChat}
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
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border-subtle pb-4">
        <div>
          <h1 className="m-0 font-[var(--font-editorial)] text-[24px] font-medium tracking-[-0.015em] text-ink">
            {project.name}
          </h1>
          <div className="tabular-mono mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-secondary">
            <span>{chat.title}</span>
            <span className="text-ink-tertiary">·</span>
            <span>{chat.worktreePath ?? project.rootPath}</span>
            {chat.worktreeBranch ? (
              <span className="rounded-[4px] bg-accent-soft px-1.5 py-0.5 text-[10.5px] text-accent">
                worktree: {chat.worktreeBranch}
              </span>
            ) : null}
            {project.testCommand ? (
              <>
                <span className="text-ink-tertiary">·</span>
                <span>test: {project.testCommand}</span>
              </>
            ) : null}
          </div>
        </div>

        {project.isValidGitRepo && (onCreateWorktree || onRemoveWorktree) ? (
          <div className="flex items-center gap-1.5">
            {chat.worktreePath ? (
              <button
                type="button"
                disabled={worktreeBusy}
                onClick={() => void onRemoveWorktree?.(chat.id)}
                className="orch-transition inline-flex items-center gap-1 rounded-[6px] border border-border-strong bg-surface px-2 py-1 text-[11.5px] text-fail hover:border-fail disabled:opacity-50"
                title="Remove isolated worktree for this chat"
              >
                <Trash size={12} weight="regular" />
                {dict.removeWorktree}
              </button>
            ) : (
              <button
                type="button"
                disabled={worktreeBusy}
                onClick={() => void onCreateWorktree?.(chat.id)}
                className="orch-transition inline-flex items-center gap-1 rounded-[6px] border border-border-subtle bg-inset px-2 py-1 text-[11.5px] text-ink-secondary hover:border-border-strong hover:text-ink disabled:opacity-50"
                title="Isolate this chat in a dedicated git worktree"
              >
                <GitBranch size={12} weight="regular" />
                {dict.isolateWorktree}
              </button>
            )}
          </div>
        ) : null}
      </header>

      <ZompoStatusStrip
        mood={zompoMood}
        detailLabel={`${project.name} · ${chat.worktreeBranch ?? project.currentBranch ?? 'repo'}`}
      />

      <div className="pixel-rule" aria-hidden="true" />

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
                <Suspense fallback={<div className="whitespace-pre-wrap text-[14px] text-ink">{msg.content}</div>}>
                  <MarkdownContent content={msg.content} />
                </Suspense>
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
              <Suspense fallback={<div className="whitespace-pre-wrap text-[14px] text-ink">{streaming.text}</div>}>
                <MarkdownContent content={streaming.text} />
              </Suspense>
            ) : (
              <p className="tabular-mono m-0 text-[12px] text-ink-tertiary">Awaiting output...</p>
            )}
          </article>
        ) : null}
      </div>

      {activeTaskRun?.roleViolationDetected ? (
        <div className="surface-card border-l-2 border-l-fail bg-fail-bg px-3 py-2 text-[12px] text-fail">
          {activeTaskRun.errorMessage ??
            'Read-only guard detected an unauthorized edit attempt and reverted repository files.'}
        </div>
      ) : null}

      {activeSecondOpinion ? (
        <Suspense fallback={null}>
          <SecondOpinionCard
            opinion={activeSecondOpinion}
            modelOptions={modelOptions}
            busy={secondOpinionBusy}
            onResolve={onResolveSecondOpinion}
          />
        </Suspense>
      ) : null}

      {activeRecipeRun ? (
        <CoordinationLogCard recipeRun={activeRecipeRun} modelOptions={modelOptions} />
      ) : null}

      {activeTaskRun && activeTaskRun.state === 'AWAITING_PLAN_APPROVAL' ? (
        <PlanApprovalCard
          taskRun={activeTaskRun}
          busy={planActionBusy}
          onApprovePlan={onApprovePlan}
          onRejectPlan={onRejectPlan}
        />
      ) : null}

      <HandoffRelayBanner
        modelOptions={modelOptions}
        currentModelHandle={effectiveHandle}
        rateLimitReason={rateLimitBanner}
        busy={relayingHandoff}
        lastHandoffNotice={handoffNotice}
        onRelay={onRelayHandoff}
      />

      {project.isValidGitRepo ? (
        <Suspense fallback={null}>
          <ChangeCard
            branchName={project.currentBranch}
            defaultBranch={project.defaultBranch}
            testCommand={project.testCommand}
            snapshot={changeSnapshot}
            testResult={testResult}
            loading={loadingChanges}
            runningTests={runningTests}
            committing={committingChanges}
            discarding={discardingChanges}
            integrating={integratingBranch}
            errorMessage={changeError}
            lastNotice={changeNotice}
            onRefresh={onRefreshChanges}
            onRunTests={onRunTests}
            onApprove={onApproveChanges}
            onDiscard={onDiscardChanges}
            onIntegrateBranch={onIntegrateBranch}
            onRequestChanges={(contextSummary) => {
              setPrompt((prev) => (prev.trim().length === 0 ? contextSummary : prev));
              composerRef.current?.focus();
            }}
          />
        </Suspense>
      ) : null}

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className={`surface-card p-3 ${
          approvalMode === 'branch_pilot'
            ? 'border-t-2 border-t-accent'
            : approvalMode === 'express'
              ? 'border-t-2 border-t-warn'
              : ''
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
          placeholder={`Direct ${project.name} (${project.currentBranch ?? 'repo'}) — tip: @neon, @codex, @opus...`}
          className="w-full resize-none border-0 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-tertiary"
        />
        {parsedMention.overrideHandle ? (
          <div className="tabular-mono mb-1.5 text-[11px] text-accent">
            Inline override @{parsedMention.alias} {'→'}{' '}
            {formatModelLabel(parsedMention.overrideHandle, modelOptions)}
          </div>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <ModelPicker
              options={modelOptions}
              selectedHandle={effectiveHandle}
              isTurnOverride={turnOverrideHandle !== null}
              onSelectChatModel={onChangeChatModel}
              onSelectTurnOverride={onChangeTurnOverride}
            />
            {onChangeTaskTag ? (
              <select
                aria-label={dict.taskTagLabel}
                value={taskTag}
                onChange={(e) => onChangeTaskTag(e.target.value as TaskTag)}
                className="tabular-mono rounded-[6px] border border-border-subtle bg-inset px-2 py-1 text-[11px] text-ink-secondary outline-none hover:border-border-strong"
              >
                {TASK_TAGS.map((tagOpt) => (
                  <option key={tagOpt} value={tagOpt}>
                    {tagOpt}
                  </option>
                ))}
              </select>
            ) : null}
            {recommendation ? (
              <div
                className="inline-flex items-center gap-1.5 rounded-[4px] border border-border-subtle bg-inset px-2 py-0.5 text-[11px] text-ink-secondary"
                title={recommendation.reason}
              >
                <span className="font-medium text-ink">
                  {dict.recommendedLabel}:{' '}
                  {formatModelLabel(recommendation.recommendedHandle, modelOptions)}
                </span>
                <span className="hidden max-w-[190px] truncate text-ink-tertiary sm:inline">
                  · {recommendation.reason}
                </span>
                {recommendation.recommendedHandle !== effectiveHandle ? (
                  <button
                    type="button"
                    onClick={() => onChangeChatModel(recommendation.recommendedHandle)}
                    className="rounded-[3px] bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent hover:bg-accent hover:text-surface"
                  >
                    {dict.useSuggested}
                  </button>
                ) : null}
              </div>
            ) : null}
            <RecipePicker
              recipes={recipes}
              selectedRecipeId={selectedRecipeId}
              modelOptions={modelOptions}
              disabled={Boolean(streaming) || activeRecipeRun?.status === 'RUNNING'}
              onSelectRecipe={onSelectRecipe}
              onCreateRecipe={onCreateRecipe}
              onDeleteRecipe={onDeleteRecipe}
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
              {dict.stop}
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={sending || prompt.trim().length === 0 || modelOptions.length < 2}
                onClick={() => {
                  const trimmed = prompt.trim();
                  if (!trimmed) {
                    return;
                  }
                  const partner =
                    modelOptions.find((opt) => opt.handle !== effectiveHandle)?.handle ??
                    modelOptions[0]?.handle ??
                    effectiveHandle;
                  setPrompt('');
                  void onStartSecondOpinion(trimmed, partner);
                }}
                title="Compare 2 read-only models side by side"
                className="orch-transition inline-flex items-center gap-1.5 rounded-[6px] border border-border-strong bg-surface px-2.5 py-1 text-[12px] text-ink hover:border-accent disabled:opacity-50"
              >
                <Scales size={13} weight="regular" />
                {dict.secondOpinion}
              </button>
              <button
                type="submit"
                disabled={sending || prompt.trim().length === 0}
                className="orch-transition inline-flex items-center gap-1.5 rounded-[6px] border border-accent bg-accent px-3 py-1 text-[12px] font-medium text-surface hover:border-accent-hover hover:bg-accent-hover disabled:opacity-50"
              >
                <PaperPlaneRight size={13} weight="regular" />
                {dict.send}
              </button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
