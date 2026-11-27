import {
  Archive,
  Check,
  FolderOpen,
  GearSix,
  GitBranch,
  PencilSimple,
  Plus,
  Trash,
  X,
} from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import type { ChatRecord, ProjectWithGitStatus } from '@orchdeck/shared';

export interface ProjectSidebarProps {
  readonly projects: readonly ProjectWithGitStatus[];
  readonly selectedProjectId: string | null;
  readonly chatsByProject: Readonly<Record<string, readonly ChatRecord[]>>;
  readonly selectedChatId: string | null;
  readonly includeArchived: boolean;
  readonly onToggleIncludeArchived: () => void;
  readonly onSelectProject: (projectId: string) => void;
  readonly onSelectChat: (projectId: string, chatId: string) => void;
  readonly onLinkRepository: (rootPath: string, testCommand?: string | null) => Promise<void>;
  readonly onPickDirectory: () => Promise<string | null>;
  readonly onUpdateProject: (
    projectId: string,
    patch: { readonly name?: string; readonly testCommand?: string | null },
  ) => Promise<void>;
  readonly onDeleteProject: (projectId: string) => Promise<void>;
  readonly onCreateChat: (projectId: string) => Promise<void>;
  readonly onRenameChat: (chatId: string, title: string) => Promise<void>;
  readonly onArchiveChat: (chatId: string, archived: boolean) => Promise<void>;
  readonly onDeleteChat: (chatId: string) => Promise<void>;
}

export function ProjectSidebar({
  projects,
  selectedProjectId,
  chatsByProject,
  selectedChatId,
  includeArchived,
  onToggleIncludeArchived,
  onSelectProject,
  onSelectChat,
  onLinkRepository,
  onPickDirectory,
  onUpdateProject,
  onDeleteProject,
  onCreateChat,
  onRenameChat,
  onArchiveChat,
  onDeleteChat,
}: ProjectSidebarProps) {
  const [addingRepo, setAddingRepo] = useState(false);
  const [manualPath, setManualPath] = useState('');
  const [manualTestCmd, setManualTestCmd] = useState('');
  const [repoError, setRepoError] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editTestCommand, setEditTestCommand] = useState('');
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const handleBrowseAndLink = async (): Promise<void> => {
    setRepoError(null);
    try {
      const picked = await onPickDirectory();
      if (!picked) {
        return;
      }
      await onLinkRepository(picked, null);
    } catch (err) {
      setRepoError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleManualSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (manualPath.trim().length === 0) {
      return;
    }
    setRepoError(null);
    try {
      await onLinkRepository(
        manualPath.trim(),
        manualTestCmd.trim().length > 0 ? manualTestCmd.trim() : null,
      );
      setManualPath('');
      setManualTestCmd('');
      setAddingRepo(false);
    } catch (err) {
      setRepoError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveProjectSettings = async (projectId: string): Promise<void> => {
    await onUpdateProject(projectId, {
      testCommand: editTestCommand.trim().length > 0 ? editTestCommand.trim() : null,
    });
    setEditingProjectId(null);
  };

  const handleCommitRename = async (chatId: string): Promise<void> => {
    if (renameDraft.trim().length === 0) {
      setRenamingChatId(null);
      return;
    }
    await onRenameChat(chatId, renameDraft.trim());
    setRenamingChatId(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <span className="tabular-mono text-[11px] uppercase tracking-[0.06em] text-ink-tertiary">
          Repositories
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void handleBrowseAndLink()}
            title="Link Git repository folder"
            aria-label="Link Git repository folder"
            className="orch-transition flex h-6 w-6 items-center justify-center rounded-[4px] text-ink-secondary hover:bg-inset hover:text-ink"
          >
            <FolderOpen size={14} weight="regular" />
          </button>
          <button
            type="button"
            onClick={() => {
              setAddingRepo((prev) => !prev);
              setRepoError(null);
            }}
            title="Enter repository path"
            aria-label="Enter repository path"
            className="orch-transition flex h-6 w-6 items-center justify-center rounded-[4px] text-ink-secondary hover:bg-inset hover:text-ink"
          >
            <Plus size={14} weight="regular" />
          </button>
        </div>
      </div>

      {addingRepo ? (
        <form
          onSubmit={(e) => void handleManualSubmit(e)}
          className="surface-card flex flex-col gap-1.5 p-2"
        >
          <input
            type="text"
            value={manualPath}
            onChange={(e) => setManualPath(e.target.value)}
            placeholder="Local Git repository path"
            className="tabular-mono w-full rounded-[4px] border border-border-subtle bg-inset px-2 py-1 text-[11.5px] text-ink outline-none focus:border-accent"
          />
          <input
            type="text"
            value={manualTestCmd}
            onChange={(e) => setManualTestCmd(e.target.value)}
            placeholder="Test command (optional, e.g. pnpm test)"
            className="tabular-mono w-full rounded-[4px] border border-border-subtle bg-inset px-2 py-1 text-[11.5px] text-ink outline-none focus:border-accent"
          />
          <div className="flex justify-end gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={() => setAddingRepo(false)}
              className="rounded-[4px] border border-border-subtle px-2 py-0.5 text-[11.5px] text-ink-secondary hover:bg-inset"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-[4px] bg-accent px-2 py-0.5 text-[11.5px] font-medium text-surface hover:bg-accent-hover"
            >
              Link
            </button>
          </div>
        </form>
      ) : null}

      {repoError ? (
        <p className="m-0 rounded-[4px] bg-fail-bg px-2 py-1.5 text-[11.5px] text-fail">
          {repoError}
        </p>
      ) : null}

      {projects.length === 0 ? (
        <div className="rounded-[6px] border border-dashed border-border-strong px-2.5 py-3 text-ink-secondary">
          <p className="m-0 text-[12px]">Link a local Git repository to start a thread.</p>
          <button
            type="button"
            onClick={() => void handleBrowseAndLink()}
            className="orch-transition mt-2 inline-flex items-center gap-1.5 rounded-[4px] border border-border-strong bg-surface px-2 py-1 text-[11.5px] font-medium text-ink hover:border-accent"
          >
            <FolderOpen size={13} weight="regular" />
            Choose Folder
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {projects.map((project) => {
            const isSelected = project.id === selectedProjectId;
            const chats = chatsByProject[project.id] ?? [];
            const isEditingSettings = editingProjectId === project.id;

            return (
              <div
                key={project.id}
                className={`rounded-[6px] border p-1.5 ${
                  isSelected
                    ? 'border-border-strong bg-surface'
                    : 'border-transparent hover:border-border-subtle'
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <button
                    type="button"
                    onClick={() => onSelectProject(project.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate text-[12.5px] font-medium text-ink">
                      {project.name}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className="tabular-mono inline-flex items-center gap-1 rounded-[4px] bg-inset px-1.5 py-0.5 text-[11px] text-ink-secondary">
                        <GitBranch size={11} weight="regular" />
                        {project.isValidGitRepo ? (project.currentBranch ?? 'detached') : 'missing'}
                      </span>
                      {project.isValidGitRepo && project.isClean === false ? (
                        <span className="tabular-mono rounded-[4px] bg-warn-bg px-1 py-0.5 text-[10.5px] text-warn">
                          {project.changedFileCount}
                        </span>
                      ) : null}
                    </div>
                  </button>

                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => void onCreateChat(project.id)}
                      title="New chat"
                      aria-label={`New chat in ${project.name}`}
                      className="orch-transition flex h-6 w-6 items-center justify-center rounded-[4px] text-ink-secondary hover:bg-inset hover:text-ink"
                    >
                      <Plus size={13} weight="regular" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (isEditingSettings) {
                          setEditingProjectId(null);
                        } else {
                          setEditingProjectId(project.id);
                          setEditTestCommand(project.testCommand ?? '');
                        }
                      }}
                      title="Project settings"
                      aria-label={`Settings for ${project.name}`}
                      className="orch-transition flex h-6 w-6 items-center justify-center rounded-[4px] text-ink-secondary hover:bg-inset hover:text-ink"
                    >
                      <GearSix size={13} weight="regular" />
                    </button>
                  </div>
                </div>

                {isEditingSettings ? (
                  <div className="mt-2 border-t border-border-subtle pt-2">
                    <label className="tabular-mono block text-[10.5px] text-ink-tertiary">
                      Test command
                    </label>
                    <input
                      type="text"
                      value={editTestCommand}
                      onChange={(e) => setEditTestCommand(e.target.value)}
                      placeholder="e.g. pnpm test"
                      className="tabular-mono mt-1 w-full rounded-[4px] border border-border-subtle bg-inset px-2 py-1 text-[11.5px] text-ink outline-none focus:border-accent"
                    />
                    <div className="mt-1.5 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => void onDeleteProject(project.id)}
                        className="inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[11px] text-fail hover:bg-fail-bg"
                      >
                        <Trash size={12} weight="regular" />
                        Unlink
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSaveProjectSettings(project.id)}
                        className="rounded-[4px] bg-accent px-2 py-0.5 text-[11px] font-medium text-surface hover:bg-accent-hover"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : null}

                {chats.length > 0 ? (
                  <ul className="mt-1.5 flex list-none flex-col gap-0.5 p-0">
                    {chats.map((chat) => {
                      const activeChat = chat.id === selectedChatId;
                      const isRenaming = renamingChatId === chat.id;

                      return (
                        <li
                          key={chat.id}
                          className={`group flex items-center justify-between gap-1 rounded-[4px] px-1.5 py-1 ${
                            activeChat
                              ? 'bg-accent-soft text-ink'
                              : 'text-ink-secondary hover:bg-inset hover:text-ink'
                          }`}
                        >
                          {isRenaming ? (
                            <div className="flex flex-1 items-center gap-1">
                              <input
                                type="text"
                                value={renameDraft}
                                onChange={(e) => setRenameDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    void handleCommitRename(chat.id);
                                  } else if (e.key === 'Escape') {
                                    setRenamingChatId(null);
                                  }
                                }}
                                autoFocus
                                className="min-w-0 flex-1 rounded-[4px] border border-border-strong bg-surface px-1.5 py-0.5 text-[12px] text-ink outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => void handleCommitRename(chat.id)}
                                aria-label="Confirm rename"
                                className="text-pass"
                              >
                                <Check size={12} weight="regular" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setRenamingChatId(null)}
                                aria-label="Cancel rename"
                                className="text-ink-tertiary"
                              >
                                <X size={12} weight="regular" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => onSelectChat(project.id, chat.id)}
                                className="min-w-0 flex-1 truncate text-left text-[12px]"
                              >
                                {chat.archivedAt ? `[Archived] ${chat.title}` : chat.title}
                              </button>
                              <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRenamingChatId(chat.id);
                                    setRenameDraft(chat.title);
                                  }}
                                  title="Rename chat"
                                  aria-label={`Rename ${chat.title}`}
                                  className="rounded-[4px] p-0.5 text-ink-tertiary hover:text-ink"
                                >
                                  <PencilSimple size={12} weight="regular" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void onArchiveChat(chat.id, !chat.archivedAt)}
                                  title={chat.archivedAt ? 'Unarchive chat' : 'Archive chat'}
                                  aria-label={chat.archivedAt ? 'Unarchive chat' : 'Archive chat'}
                                  className="rounded-[4px] p-0.5 text-ink-tertiary hover:text-ink"
                                >
                                  <Archive size={12} weight="regular" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void onDeleteChat(chat.id)}
                                  title="Delete chat"
                                  aria-label={`Delete ${chat.title}`}
                                  className="rounded-[4px] p-0.5 text-ink-tertiary hover:text-fail"
                                >
                                  <Trash size={12} weight="regular" />
                                </button>
                              </div>
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {projects.length > 0 ? (
        <button
          type="button"
          onClick={onToggleIncludeArchived}
          className="px-1 text-left text-[11px] text-ink-tertiary hover:text-ink-secondary"
        >
          {includeArchived ? 'Hide archived chats' : 'Show archived chats'}
        </button>
      ) : null}
    </div>
  );
}
