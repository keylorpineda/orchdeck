import {
  ArrowClockwise,
  CaretDown,
  CaretRight,
  Check,
  ChatCircleText,
  Flask,
  GitMerge,
  Trash,
} from '@phosphor-icons/react';
import { useState, type KeyboardEvent } from 'react';
import type { ChangeCardSnapshot, ChangeFileStatus, TestRunResult } from '@orchdeck/shared';
import { computeMicroBarSegments } from '../state/change-card-utils';
import {
  formatInlineCommentsPrompt,
  type InlineDiffComment,
} from '../state/inline-comments';
import { ShikiDiffView } from './ShikiDiffView';

export interface ChangeCardProps {
  readonly branchName: string | null;
  readonly defaultBranch?: string | undefined;
  readonly testCommand: string | null;
  readonly snapshot: ChangeCardSnapshot | null;
  readonly testResult: TestRunResult | null;
  readonly loading: boolean;
  readonly runningTests: boolean;
  readonly committing: boolean;
  readonly discarding: boolean;
  readonly integrating?: boolean | undefined;
  readonly errorMessage: string | null;
  readonly lastNotice: string | null;
  readonly onRefresh: () => Promise<void>;
  readonly onRunTests: () => Promise<void>;
  readonly onApprove: (commitMessage: string) => Promise<void>;
  readonly onDiscard: () => Promise<void>;
  readonly onIntegrateBranch?: () => Promise<void>;
  readonly onRequestChanges: (contextSummary: string) => void;
}

function statusGlyph(status: ChangeFileStatus): string {
  switch (status) {
    case 'added':
      return 'A';
    case 'deleted':
      return 'D';
    case 'renamed':
      return 'R';
    case 'untracked':
      return '?';
    case 'modified':
      return 'M';
  }
}

function statusColorClass(status: ChangeFileStatus): string {
  switch (status) {
    case 'added':
    case 'untracked':
      return 'text-pass';
    case 'deleted':
      return 'text-fail';
    case 'renamed':
    case 'modified':
      return 'text-warn';
  }
}

export function ChangeCard({
  branchName,
  defaultBranch = 'main',
  testCommand,
  snapshot,
  testResult,
  loading,
  runningTests,
  committing,
  discarding,
  integrating = false,
  errorMessage,
  lastNotice,
  onRefresh,
  onRunTests,
  onApprove,
  onDiscard,
  onIntegrateBranch,
  onRequestChanges,
}: ChangeCardProps) {
  const [expandedFiles, setExpandedFiles] = useState<Readonly<Record<string, boolean>>>({});
  const [showTestOutput, setShowTestOutput] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [inlineComments, setInlineComments] = useState<readonly InlineDiffComment[]>([]);

  const files = snapshot?.files ?? [];
  const isClean = snapshot?.isClean ?? true;
  const totalAdd = snapshot?.totalAdditions ?? 0;
  const totalDel = snapshot?.totalDeletions ?? 0;
  const activeBranch = snapshot?.branch ?? branchName ?? 'repo';

  const toggleFile = (filePath: string): void => {
    setExpandedFiles((prev) => ({
      ...prev,
      [filePath]: !prev[filePath],
    }));
  };

  const handleRowKeyDown = (event: KeyboardEvent<HTMLButtonElement>, filePath: string): void => {
    if (event.key === ' ') {
      event.preventDefault();
      toggleFile(filePath);
    }
  };

  const handleApproveSubmit = (): void => {
    const trimmed = commitMessage.trim();
    if (trimmed.length === 0 || committing || isClean) {
      return;
    }
    void onApprove(trimmed).then(() => {
      setCommitMessage('');
      setConfirmDiscard(false);
      setInlineComments([]);
    });
  };

  const handleConfirmDiscard = (): void => {
    void onDiscard().then(() => {
      setConfirmDiscard(false);
      setInlineComments([]);
    });
  };

  const sealLabel = runningTests
    ? 'RUNNING'
    : testResult
      ? testResult.passed
        ? `PASS · ${Math.round(testResult.durationMs)}ms`
        : `FAIL (${String(testResult.exitCode ?? 'timeout')})`
      : testCommand
        ? 'NOT RUN'
        : 'NO TESTS';

  const sealClasses = runningTests
    ? 'bg-warn-bg text-warn border-border-strong'
    : testResult
      ? testResult.passed
        ? 'bg-pass-bg text-pass border-border-subtle'
        : 'bg-fail-bg text-fail border-border-subtle'
      : 'bg-inset text-ink-tertiary border-border-subtle';

  return (
    <section className="surface-card overflow-hidden" aria-label="Change Card">
      <div className="flex min-h-[38px] flex-wrap items-center justify-between gap-2 border-b border-border-subtle bg-inset px-3 py-1.5">
        <div className="flex items-center gap-2.5">
          <span className="text-[12px] font-medium text-ink">
            {loading
              ? 'Inspecting working tree...'
              : isClean
                ? 'Working tree clean'
                : `${files.length} ${files.length === 1 ? 'file' : 'files'} changed`}
          </span>
          <span className="tabular-mono rounded-[4px] border border-border-subtle bg-surface px-1.5 py-0.5 text-[11px] text-ink-secondary">
            {activeBranch}
          </span>
          {!isClean ? (
            <span className="tabular-mono text-[11.5px]">
              <span className="text-pass">+{totalAdd}</span>{' '}
              <span className="text-fail">-{totalDel}</span>
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={!testResult && !testCommand}
            onClick={() => {
              if (testResult) {
                setShowTestOutput((prev) => !prev);
              } else if (testCommand) {
                void onRunTests().then(() => setShowTestOutput(true));
              }
            }}
            className={`tabular-mono orch-transition rounded-[4px] border px-2 py-0.5 text-[11px] font-medium ${sealClasses}`}
            title={testCommand ? `Test command: ${testCommand}` : 'No project test command configured'}
          >
            {sealLabel}
          </button>

          {testCommand ? (
            <button
              type="button"
              disabled={runningTests}
              onClick={() => void onRunTests().then(() => setShowTestOutput(true))}
              className="orch-transition inline-flex items-center gap-1 rounded-[4px] border border-border-subtle bg-surface px-2 py-0.5 text-[11.5px] text-ink-secondary hover:border-border-strong hover:text-ink disabled:opacity-50"
            >
              <Flask size={12} weight="regular" />
              Run Tests
            </button>
          ) : null}

          <button
            type="button"
            disabled={loading}
            onClick={() => void onRefresh()}
            title="Refresh git status and diff"
            className="orch-transition inline-flex items-center gap-1 rounded-[4px] border border-border-subtle bg-surface px-1.5 py-0.5 text-[11.5px] text-ink-secondary hover:border-border-strong hover:text-ink disabled:opacity-50"
          >
            <ArrowClockwise size={12} weight="regular" />
          </button>
        </div>
      </div>

      {errorMessage ? (
        <div className="border-b border-border-subtle bg-fail-bg px-3 py-1.5 text-[12px] text-fail">
          {errorMessage}
        </div>
      ) : null}

      {lastNotice ? (
        <div className="border-b border-border-subtle bg-pass-bg px-3 py-1.5 text-[12px] text-pass">
          {lastNotice}
        </div>
      ) : null}

      {showTestOutput && testResult ? (
        <div className="border-b border-border-subtle bg-surface px-3 py-2">
          <div className="tabular-mono mb-1 flex items-center justify-between text-[11px] text-ink-tertiary">
            <span>{testResult.command}</span>
            <button
              type="button"
              onClick={() => setShowTestOutput(false)}
              className="text-ink-secondary hover:text-ink"
            >
              Hide logs
            </button>
          </div>
          <pre className="tabular-mono m-0 max-h-[180px] overflow-auto whitespace-pre-wrap rounded-[4px] border border-border-subtle bg-inset p-2 text-[11.5px] text-ink-secondary">
            {testResult.output || '(no output)'}
          </pre>
        </div>
      ) : null}

      {!isClean ? (
        <>
          {snapshot?.isTruncated ? (
            <div className="border-b border-border-subtle bg-warn-bg px-3 py-1 text-[11.5px] text-warn">
              Diff snapshot reached the 256 KB display cap; remaining files show summary counts only.
            </div>
          ) : null}

          <div className="divide-y divide-border-subtle">
            {files.map((file) => {
              const isExpanded = expandedFiles[file.path] === true;
              const segments = computeMicroBarSegments(file.additions, file.deletions);

              return (
                <div key={file.path}>
                  <button
                    type="button"
                    onClick={() => toggleFile(file.path)}
                    onKeyDown={(e) => handleRowKeyDown(e, file.path)}
                    aria-expanded={isExpanded}
                    className="orch-transition flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-inset focus:bg-inset focus:outline-none"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {isExpanded ? (
                        <CaretDown size={12} weight="regular" className="shrink-0 text-ink-tertiary" />
                      ) : (
                        <CaretRight size={12} weight="regular" className="shrink-0 text-ink-tertiary" />
                      )}
                      <span
                        className={`tabular-mono w-[14px] shrink-0 text-center text-[11px] font-medium ${statusColorClass(file.status)}`}
                      >
                        {statusGlyph(file.status)}
                      </span>
                      <span className="tabular-mono truncate text-[12px] text-ink">{file.path}</span>
                    </div>

                    <div className="flex shrink-0 items-center gap-2.5">
                      <span className="tabular-mono text-[11.5px]">
                        <span className="text-pass">+{file.additions}</span>{' '}
                        <span className="text-fail">-{file.deletions}</span>
                      </span>
                      <span className="flex items-center gap-[2px]" aria-hidden="true">
                        {segments.map((segment, segIdx) => (
                          <span
                            key={segIdx}
                            className={`h-[9px] w-[4px] ${
                              segment === 'add'
                                ? 'bg-pass'
                                : segment === 'del'
                                  ? 'bg-fail'
                                  : 'bg-border-subtle'
                            }`}
                          />
                        ))}
                      </span>
                    </div>
                  </button>

                  {isExpanded ? (
                    <ShikiDiffView
                      filePath={file.path}
                      diff={file.diff}
                      isBinary={file.isBinary}
                      comments={inlineComments}
                      onAddComment={(comment) =>
                        setInlineComments((prev) => [
                          ...prev,
                          { ...comment, id: `c-${Date.now()}-${prev.length}` },
                        ])
                      }
                      onRemoveComment={(commentId) =>
                        setInlineComments((prev) => prev.filter((item) => item.id !== commentId))
                      }
                    />
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 border-t border-border-subtle bg-inset px-3 py-2.5">
            <input
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleApproveSubmit();
                }
              }}
              placeholder="Commit message (Ctrl+Enter to approve & commit cleanly)"
              className="w-full rounded-[6px] border border-border-strong bg-surface px-2.5 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-ink-tertiary focus:border-accent"
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={committing || commitMessage.trim().length === 0}
                  onClick={handleApproveSubmit}
                  className="orch-transition inline-flex items-center gap-1.5 rounded-[6px] border border-accent bg-accent px-3 py-1 text-[12px] font-medium text-surface hover:border-accent-hover hover:bg-accent-hover disabled:opacity-50"
                >
                  <Check size={13} weight="regular" />
                  {committing ? 'Committing...' : 'Approve & Commit'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const bundled = formatInlineCommentsPrompt(inlineComments);
                    const contextSummary =
                      bundled ||
                      `Requesting changes across ${files.map((f) => f.path).join(', ')}: `;
                    setInlineComments([]);
                    onRequestChanges(contextSummary);
                  }}
                  className="orch-transition inline-flex items-center gap-1.5 rounded-[6px] border border-border-strong bg-surface px-2.5 py-1 text-[12px] text-ink hover:border-ink-tertiary"
                >
                  <ChatCircleText size={13} weight="regular" />
                  {inlineComments.length > 0
                    ? `Request Changes (${inlineComments.length})`
                    : 'Request Changes'}
                </button>
              </div>

              {confirmDiscard ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11.5px] text-ink-secondary">
                    Stash backup & revert?
                  </span>
                  <button
                    type="button"
                    disabled={discarding}
                    onClick={handleConfirmDiscard}
                    className="orch-transition rounded-[6px] border border-fail bg-fail-bg px-2.5 py-1 text-[11.5px] font-medium text-fail disabled:opacity-50"
                  >
                    {discarding ? 'Discarding...' : 'Confirm Discard'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDiscard(false)}
                    className="orch-transition rounded-[6px] border border-border-subtle bg-surface px-2 py-1 text-[11.5px] text-ink-secondary hover:text-ink"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={discarding}
                  onClick={() => setConfirmDiscard(true)}
                  className="orch-transition inline-flex items-center gap-1 rounded-[6px] border border-border-subtle bg-surface px-2.5 py-1 text-[12px] text-fail hover:border-fail disabled:opacity-50"
                >
                  <Trash size={13} weight="regular" />
                  Discard
                </button>
              )}
            </div>
          </div>
        </>
      ) : onIntegrateBranch &&
        activeBranch !== defaultBranch &&
        activeBranch.startsWith('agent/') ? (
        <div className="flex items-center justify-between gap-2 bg-inset px-3 py-2 text-[12px]">
          <span className="text-ink-secondary">
            Task branch <span className="tabular-mono font-medium text-ink">{activeBranch}</span>{' '}
            is clean and ready for human sign-off.
          </span>
          <button
            type="button"
            disabled={integrating}
            onClick={() => void onIntegrateBranch()}
            className="orch-transition inline-flex items-center gap-1.5 rounded-[6px] border border-accent bg-accent px-2.5 py-1 text-[11.5px] font-medium text-surface hover:border-accent-hover hover:bg-accent-hover disabled:opacity-50"
          >
            <GitMerge size={13} weight="regular" />
            {integrating ? 'Integrating...' : `Integrate into ${defaultBranch}`}
          </button>
        </div>
      ) : null}
    </section>
  );
}
