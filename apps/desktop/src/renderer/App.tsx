import { useCallback, useEffect, useRef, useState } from 'react';
import {
  parseInlineMention,
  parseModelHandle,
  type ApprovalMode,
  type ChangeCardSnapshot,
  type ChatRecord,
  type MessageRecord,
  type ProjectWithGitStatus,
  type RecipeCreateParams,
  type RecipeRecord,
  type RecipeRunRecord,
  type RecipeRunUpdatedNotificationParams,
  type SecondOpinionRecord,
  type SecondOpinionResolution,
  type SecondOpinionUpdatedNotificationParams,
  type TaskRunRecord,
  type TaskRunUpdatedNotificationParams,
  type TestRunResult,
  type TurnEventNotificationParams,
  type UsageSummaryResult,
} from '@orchdeck/shared';
import { ChatWorkspace, type MessageTurnMeta } from './components/ChatWorkspace';
import { LanguageProvider } from './components/LanguageProvider';
import { ProjectSidebar } from './components/ProjectSidebar';
import { ThemeProvider } from './components/ThemeProvider';
import { UsageQuotaRadar } from './components/UsageQuotaRadar';
import { WorkbenchShell } from './components/WorkbenchShell';
import {
  FALLBACK_MODEL_OPTIONS,
  applyTurnEventToDraft,
  buildModelCatalog,
  type ModelOption,
  type StreamingTurnState,
} from './state/turn-stream';
import {
  deriveChatTitleFromPrompt,
  selectFallbackId,
  sortChatsByActivity,
} from './state/workbench-state';

function WorkbenchApp() {
  const [projects, setProjects] = useState<readonly ProjectWithGitStatus[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [chatsByProject, setChatsByProject] = useState<Readonly<Record<string, readonly ChatRecord[]>>>({});
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<readonly MessageRecord[]>([]);
  const [messageMetaById, setMessageMetaById] = useState<Readonly<Record<string, MessageTurnMeta>>>({});
  const [includeArchived, setIncludeArchived] = useState(false);
  const [modelOptions, setModelOptions] = useState<readonly ModelOption[]>(FALLBACK_MODEL_OPTIONS);
  const [chatModelHandle, setChatModelHandle] = useState('claude:opus-4-6:high');
  const [turnOverrideHandle, setTurnOverrideHandle] = useState<string | null>(null);
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>('architect');
  const [activeTaskRun, setActiveTaskRun] = useState<TaskRunRecord | null>(null);
  const [planActionBusy, setPlanActionBusy] = useState(false);
  const [recipes, setRecipes] = useState<readonly RecipeRecord[]>([]);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [activeRecipeRun, setActiveRecipeRun] = useState<RecipeRunRecord | null>(null);
  const [activeSecondOpinion, setActiveSecondOpinion] = useState<SecondOpinionRecord | null>(null);
  const [secondOpinionBusy, setSecondOpinionBusy] = useState(false);
  const [rateLimitBanner, setRateLimitBanner] = useState<string | null>(null);
  const [relayingHandoff, setRelayingHandoff] = useState(false);
  const [handoffNotice, setHandoffNotice] = useState<string | null>(null);
  const [streaming, setStreaming] = useState<StreamingTurnState | null>(null);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [changeSnapshot, setChangeSnapshot] = useState<ChangeCardSnapshot | null>(null);
  const [testResult, setTestResult] = useState<TestRunResult | null>(null);
  const [loadingChanges, setLoadingChanges] = useState(false);
  const [runningTests, setRunningTests] = useState(false);
  const [committingChanges, setCommittingChanges] = useState(false);
  const [discardingChanges, setDiscardingChanges] = useState(false);
  const [integratingBranch, setIntegratingBranch] = useState(false);
  const [worktreeBusy, setWorktreeBusy] = useState(false);
  const [usageSummary, setUsageSummary] = useState<UsageSummaryResult | null>(null);
  const [includeLocalLogs, setIncludeLocalLogs] = useState(false);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [changeNotice, setChangeNotice] = useState<string | null>(null);

  const streamingRef = useRef<StreamingTurnState | null>(null);
  const activeChatRef = useRef<string | null>(null);
  streamingRef.current = streaming;
  activeChatRef.current = selectedChatId;

  const refreshUsageSummary = useCallback(
    async (optInLogs = includeLocalLogs): Promise<void> => {
      const api = window.orchdeck;
      if (!api) {
        return;
      }
      setLoadingUsage(true);
      try {
        const result = await api.getUsageSummary({ includeLocalLogs: optInLogs });
        setUsageSummary(result);
      } finally {
        setLoadingUsage(false);
      }
    },
    [includeLocalLogs],
  );

  const refreshChangeCard = useCallback(
    async (projectId: string | null, chatId?: string | null): Promise<void> => {
      const api = window.orchdeck;
      if (!api || !projectId) {
        setChangeSnapshot(null);
        return;
      }
      setLoadingChanges(true);
      setChangeError(null);
      try {
        const { snapshot } = await api.inspectChanges(projectId, chatId ?? undefined);
        setChangeSnapshot(snapshot);
      } catch (err) {
        setChangeError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoadingChanges(false);
      }
    },
    [],
  );

  const refreshChatsForProject = useCallback(
    async (projectId: string, showArchived = includeArchived): Promise<readonly ChatRecord[]> => {
      const api = window.orchdeck;
      if (!api) {
        return [];
      }
      const { chats } = await api.listChats({ projectId, includeArchived: showArchived });
      const sorted = sortChatsByActivity(chats);
      setChatsByProject((prev) => ({ ...prev, [projectId]: sorted }));
      return sorted;
    },
    [includeArchived],
  );

  const loadInitialWorkspace = useCallback(async () => {
    const api = window.orchdeck;
    if (!api) {
      setBridgeError('Preload bridge unavailable (browser preview mode).');
      return;
    }

    try {
      const [{ projects: loadedProjects }, { adapters }, { recipes: loadedRecipes }, usage] =
        await Promise.all([
          api.listProjects(),
          api.listAdapters(),
          api.listRecipes(),
          api.getUsageSummary({ includeLocalLogs }),
        ]);
      setProjects(loadedProjects);
      setModelOptions(buildModelCatalog(adapters));
      setRecipes(loadedRecipes);
      setUsageSummary(usage);

      const chatMap: Record<string, readonly ChatRecord[]> = {};
      await Promise.all(
        loadedProjects.map(async (proj) => {
          const { chats } = await api.listChats({
            projectId: proj.id,
            includeArchived,
          });
          chatMap[proj.id] = sortChatsByActivity(chats);
        }),
      );
      setChatsByProject(chatMap);

      const firstProject = loadedProjects[0] ?? null;
      if (firstProject) {
        setSelectedProjectId(firstProject.id);
        if (firstProject.isValidGitRepo) {
          void refreshChangeCard(firstProject.id);
        }
        const firstChat = chatMap[firstProject.id]?.[0] ?? null;
        if (firstChat) {
          setSelectedChatId(firstChat.id);
          const { messages: loadedMessages } = await api.listMessages(firstChat.id);
          setMessages(loadedMessages);
        }
      }
    } catch (err) {
      setBridgeError(err instanceof Error ? err.message : String(err));
    }
  }, [includeArchived]);

  useEffect(() => {
    void loadInitialWorkspace();
  }, [loadInitialWorkspace]);

  useEffect(() => {
    const api = window.orchdeck;
    if (!api) {
      return;
    }

    const unsubTurn = api.onTurnEvent((payload: TurnEventNotificationParams) => {
      const current = streamingRef.current;
      if (!current || current.turnId !== payload.turnId) {
        return;
      }

      const nextState = applyTurnEventToDraft(current, payload.event);
      if (payload.event.type === 'rate_limit') {
        setRateLimitBanner(payload.event.message);
      }
      if (payload.event.type !== 'done') {
        setStreaming(nextState);
        return;
      }

      if (payload.event.outcome === 'rate_limited' && nextState.rateLimitMessage) {
        setRateLimitBanner(nextState.rateLimitMessage);
      }

      const finalText = nextState.text.trim() || nextState.rateLimitMessage || '';
      setStreaming(null);
      const targetChatId = activeChatRef.current;
      if (targetChatId && finalText.length > 0) {
        void api
          .appendMessage({
            chatId: targetChatId,
            role: 'assistant',
            providerId: nextState.provider,
            modelId: nextState.modelId,
            content: finalText,
          })
          .then(async ({ message }) => {
            setMessageMetaById((prev) => ({
              ...prev,
              [message.id]: {
                tools: nextState.tools,
                thinking: nextState.thinking,
                changedFiles: nextState.changedFiles,
              },
            }));
            const { messages: updated } = await api.listMessages(targetChatId);
            setMessages(updated);
            if (selectedProjectId) {
              const [{ projects: refreshedProjects }] = await Promise.all([
                api.listProjects(),
                refreshChatsForProject(selectedProjectId),
                refreshChangeCard(selectedProjectId, targetChatId),
                refreshUsageSummary(),
              ]);
              setProjects(refreshedProjects);
            }
          });
      }
    });

    const unsubTaskRun = api.onTaskRunUpdated((payload: TaskRunUpdatedNotificationParams) => {
      setActiveTaskRun((prev) => {
        if (
          prev &&
          prev.id !== payload.taskRun.id &&
          prev.state !== 'AWAITING_FINAL_REVIEW' &&
          prev.state !== 'COMMITTED_ON_BRANCH' &&
          prev.state !== 'DISCARDED'
        ) {
          return prev;
        }
        return payload.taskRun;
      });

      if (
        selectedProjectId &&
        payload.taskRun.projectId === selectedProjectId &&
        (payload.taskRun.state === 'EXECUTING' ||
          payload.taskRun.state === 'AWAITING_FINAL_REVIEW' ||
          payload.taskRun.state === 'DISCARDED')
      ) {
        void api.listProjects().then(({ projects: refreshedProjects }) => {
          setProjects(refreshedProjects);
        });
        void refreshChangeCard(selectedProjectId);
      }
    });

    const unsubRecipeRun = api.onRecipeRunUpdated((payload: RecipeRunUpdatedNotificationParams) => {
      setActiveRecipeRun(payload.recipeRun);
      if (payload.recipeRun.status === 'RATE_LIMITED' && payload.recipeRun.errorMessage) {
        setRateLimitBanner(payload.recipeRun.errorMessage);
      }
      if (
        selectedProjectId &&
        payload.recipeRun.projectId === selectedProjectId &&
        payload.recipeRun.status !== 'RUNNING'
      ) {
        void api.listProjects().then(({ projects: refreshedProjects }) => {
          setProjects(refreshedProjects);
        });
        void refreshChangeCard(selectedProjectId);
      }
    });

    const unsubSecondOpinion = api.onSecondOpinionUpdated(
      (payload: SecondOpinionUpdatedNotificationParams) => {
        setActiveSecondOpinion(payload.secondOpinion);
      },
    );

    return () => {
      unsubTurn();
      unsubTaskRun();
      unsubRecipeRun();
      unsubSecondOpinion();
    };
  }, [refreshChangeCard, refreshChatsForProject, refreshUsageSummary, selectedProjectId]);

  const handleSelectProject = (projectId: string): void => {
    setSelectedProjectId(projectId);
    setTestResult(null);
    setChangeNotice(null);
    const chats = chatsByProject[projectId] ?? [];
    const nextChatId = chats[0]?.id ?? null;
    setSelectedChatId(nextChatId);
    void refreshChangeCard(projectId, nextChatId);
    if (nextChatId && window.orchdeck) {
      void window.orchdeck.listMessages(nextChatId).then((res) => setMessages(res.messages));
    } else {
      setMessages([]);
    }
  };

  const handleSelectChat = (projectId: string, chatId: string): void => {
    setSelectedProjectId(projectId);
    setSelectedChatId(chatId);
    void refreshChangeCard(projectId, chatId);
    if (window.orchdeck) {
      void window.orchdeck.listMessages(chatId).then((res) => setMessages(res.messages));
    }
  };

  const handleLinkRepository = async (
    rootPath: string,
    testCommand?: string | null,
  ): Promise<void> => {
    const api = window.orchdeck;
    if (!api) {
      return;
    }
    const { project } = await api.createProject({ rootPath, testCommand });
    const { chat } = await api.createChat({ projectId: project.id, title: 'New chat' });
    const { projects: refreshed } = await api.listProjects();
    setProjects(refreshed);
    setSelectedProjectId(project.id);
    setChatsByProject((prev) => ({ ...prev, [project.id]: [chat] }));
    setSelectedChatId(chat.id);
    setMessages([]);
  };

  const handlePickDirectory = async (): Promise<string | null> => {
    const api = window.orchdeck;
    if (!api) {
      return null;
    }
    const res = await api.pickDirectory();
    return res.canceled ? null : res.directoryPath;
  };

  const handleUpdateProject = async (
    projectId: string,
    patch: { readonly name?: string; readonly testCommand?: string | null },
  ): Promise<void> => {
    const api = window.orchdeck;
    if (!api) {
      return;
    }
    await api.updateProject({ id: projectId, ...patch });
    const { projects: refreshed } = await api.listProjects();
    setProjects(refreshed);
  };

  const handleDeleteProject = async (projectId: string): Promise<void> => {
    const api = window.orchdeck;
    if (!api) {
      return;
    }
    await api.deleteProject(projectId);
    const { projects: refreshed } = await api.listProjects();
    setProjects(refreshed);
    const nextProjectId = selectFallbackId(refreshed, selectedProjectId === projectId ? null : selectedProjectId);
    setSelectedProjectId(nextProjectId);
    const nextChatId = nextProjectId ? (chatsByProject[nextProjectId]?.[0]?.id ?? null) : null;
    setSelectedChatId(nextChatId);
    setMessages([]);
  };

  const handleCreateChat = async (projectId: string): Promise<void> => {
    const api = window.orchdeck;
    if (!api) {
      return;
    }
    const { chat } = await api.createChat({ projectId, title: 'New chat' });
    await refreshChatsForProject(projectId);
    setSelectedProjectId(projectId);
    setSelectedChatId(chat.id);
    setMessages([]);
  };

  const handleRenameChat = async (chatId: string, title: string): Promise<void> => {
    const api = window.orchdeck;
    if (!api) {
      return;
    }
    const { chat } = await api.renameChat({ id: chatId, title });
    await refreshChatsForProject(chat.projectId);
  };

  const handleArchiveChat = async (chatId: string, archived: boolean): Promise<void> => {
    const api = window.orchdeck;
    if (!api) {
      return;
    }
    const { chat } = await api.archiveChat({ id: chatId, archived });
    const remaining = await refreshChatsForProject(chat.projectId);
    if (selectedChatId === chatId) {
      const fallback = selectFallbackId(remaining, null);
      setSelectedChatId(fallback);
      if (fallback) {
        const res = await api.listMessages(fallback);
        setMessages(res.messages);
      } else {
        setMessages([]);
      }
    }
  };

  const handleDeleteChat = async (chatId: string): Promise<void> => {
    const api = window.orchdeck;
    if (!api || !selectedProjectId) {
      return;
    }
    await api.deleteChat(chatId);
    const remaining = await refreshChatsForProject(selectedProjectId);
    if (selectedChatId === chatId) {
      const fallback = selectFallbackId(remaining, null);
      setSelectedChatId(fallback);
      if (fallback) {
        const res = await api.listMessages(fallback);
        setMessages(res.messages);
      } else {
        setMessages([]);
      }
    }
  };

  const handleSendPrompt = async (prompt: string): Promise<void> => {
    const api = window.orchdeck;
    const project = projects.find((p) => p.id === selectedProjectId) ?? null;
    if (!api || !project || !selectedChatId) {
      return;
    }

    const activeChats = chatsByProject[project.id] ?? [];
    const currentChat = activeChats.find((c) => c.id === selectedChatId) ?? null;
    if (currentChat && currentChat.title === 'New chat' && messages.length === 0) {
      await api.renameChat({
        id: currentChat.id,
        title: deriveChatTitleFromPrompt(prompt),
      });
    }

    await api.appendMessage({
      chatId: selectedChatId,
      role: 'user',
      content: prompt,
    });

    const [{ messages: updatedMessages }] = await Promise.all([
      api.listMessages(selectedChatId),
      refreshChatsForProject(project.id),
    ]);
    setMessages(updatedMessages);

    const mention = parseInlineMention(prompt);
    const effectivePrompt = mention.cleanedPrompt;
    const effectiveHandle = mention.overrideHandle ?? turnOverrideHandle ?? chatModelHandle;
    setTurnOverrideHandle(null);
    setRateLimitBanner(null);
    setHandoffNotice(null);
    setActiveTaskRun(null);

    const effectiveCwd = currentChat?.worktreePath ?? project.rootPath;

    if (selectedRecipeId && !mention.overrideHandle) {
      const { recipeRun } = await api.runRecipe({
        recipeId: selectedRecipeId,
        projectId: project.id,
        chatId: selectedChatId,
        cwd: effectiveCwd,
        prompt: effectivePrompt,
      });
      setActiveRecipeRun(recipeRun);
      return;
    }

    const parsed = parseModelHandle(effectiveHandle);
    const { taskRun } = await api.startTaskRun({
      projectId: project.id,
      chatId: selectedChatId,
      cwd: effectiveCwd,
      modelHandle: effectiveHandle,
      prompt: effectivePrompt,
      mode: approvalMode,
    });
    setActiveTaskRun(taskRun);
    if (taskRun.activeTurnId) {
      setStreaming({
        turnId: taskRun.activeTurnId,
        provider: parsed.provider,
        modelId: parsed.modelId,
        text: '',
        thinking: '',
        tools: [],
        changedFiles: [],
        rateLimitMessage: null,
      });
    }
  };

  const handleCreateRecipe = async (params: RecipeCreateParams): Promise<void> => {
    const api = window.orchdeck;
    if (!api) {
      return;
    }
    const { recipe } = await api.createRecipe(params);
    const { recipes: refreshed } = await api.listRecipes();
    setRecipes(refreshed);
    setSelectedRecipeId(recipe.id);
  };

  const handleDeleteRecipe = async (recipeId: string): Promise<void> => {
    const api = window.orchdeck;
    if (!api) {
      return;
    }
    await api.deleteRecipe(recipeId);
    const { recipes: refreshed } = await api.listRecipes();
    setRecipes(refreshed);
    if (selectedRecipeId === recipeId) {
      setSelectedRecipeId(null);
    }
  };

  const handleRelayHandoff = async (targetModelHandle: string): Promise<void> => {
    const api = window.orchdeck;
    const project = projects.find((p) => p.id === selectedProjectId) ?? null;
    if (!api || !project || !selectedChatId) {
      return;
    }
    setRelayingHandoff(true);
    setHandoffNotice(null);
    try {
      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
      const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant');
      const relayed = await api.relayHandoff({
        projectId: project.id,
        chatId: selectedChatId,
        cwd: project.rootPath,
        targetModelHandle,
        goal: lastUserMsg?.content ?? 'Continue active repository task cleanly',
        decisions: lastAssistantMsg ? [lastAssistantMsg.content.slice(0, 240)] : [],
        nextStep: 'Continue work from the deterministic handoff packet.',
        sourceModelHandle: turnOverrideHandle ?? chatModelHandle,
        latestTestOutput: testResult?.output ?? '',
        reason: rateLimitBanner ?? 'Manual 1-click engine relay',
      });
      setRateLimitBanner(null);
      setChatModelHandle(relayed.targetModelHandle);
      setHandoffNotice(`Saved ${relayed.handoffPath} and resumed on ${relayed.targetModelHandle}.`);
      const parsed = parseModelHandle(relayed.targetModelHandle);
      setStreaming({
        turnId: relayed.turnId,
        provider: parsed.provider,
        modelId: parsed.modelId,
        text: '',
        thinking: '',
        tools: [],
        changedFiles: [],
        rateLimitMessage: null,
      });
    } finally {
      setRelayingHandoff(false);
    }
  };

  const handleApprovePlan = async (taskRunId: string): Promise<void> => {
    const api = window.orchdeck;
    if (!api) {
      return;
    }
    setPlanActionBusy(true);
    try {
      const { taskRun } = await api.approveTaskRunPlan(taskRunId);
      setActiveTaskRun(taskRun);
      const { projects: refreshedProjects } = await api.listProjects();
      setProjects(refreshedProjects);
      if (taskRun.activeTurnId) {
        const parsed = parseModelHandle(taskRun.modelHandle);
        setStreaming({
          turnId: taskRun.activeTurnId,
          provider: parsed.provider,
          modelId: parsed.modelId,
          text: '',
          thinking: '',
          tools: [],
          changedFiles: [],
          rateLimitMessage: null,
        });
      }
    } finally {
      setPlanActionBusy(false);
    }
  };

  const handleRejectPlan = async (taskRunId: string): Promise<void> => {
    const api = window.orchdeck;
    if (!api) {
      return;
    }
    setPlanActionBusy(true);
    try {
      const { taskRun } = await api.rejectTaskRunPlan(taskRunId);
      setActiveTaskRun(taskRun);
    } finally {
      setPlanActionBusy(false);
    }
  };

  const handleCancelTurn = async (turnId: string): Promise<void> => {
    await window.orchdeck?.cancelTurn(turnId);
  };

  const handleRunTests = async (): Promise<void> => {
    const api = window.orchdeck;
    if (!api || !selectedProjectId) {
      return;
    }
    setRunningTests(true);
    setChangeError(null);
    try {
      const { result } = await api.runProjectTests(selectedProjectId, selectedChatId ?? undefined);
      setTestResult(result);
    } catch (err) {
      setChangeError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunningTests(false);
    }
  };

  const handleApproveChanges = async (commitMessage: string): Promise<void> => {
    const api = window.orchdeck;
    if (!api || !selectedProjectId) {
      return;
    }
    setCommittingChanges(true);
    setChangeError(null);
    setChangeNotice(null);
    try {
      const { branch, commitSha } = await api.approveChanges({
        projectId: selectedProjectId,
        chatId: selectedChatId ?? undefined,
        commitMessage,
        branchSlug: deriveChatTitleFromPrompt(commitMessage),
      });
      const [{ projects: refreshedProjects }] = await Promise.all([
        api.listProjects(),
        refreshChangeCard(selectedProjectId, selectedChatId),
      ]);
      setProjects(refreshedProjects);
      setChangeNotice(`Committed ${commitSha.slice(0, 7)} cleanly on ${branch}.`);
    } catch (err) {
      setChangeError(err instanceof Error ? err.message : String(err));
    } finally {
      setCommittingChanges(false);
    }
  };

  const handleDiscardChanges = async (): Promise<void> => {
    const api = window.orchdeck;
    if (!api || !selectedProjectId) {
      return;
    }
    setDiscardingChanges(true);
    setChangeError(null);
    setChangeNotice(null);
    try {
      const result = await api.discardChanges(selectedProjectId, selectedChatId ?? undefined);
      const [{ projects: refreshedProjects }] = await Promise.all([
        api.listProjects(),
        refreshChangeCard(selectedProjectId, selectedChatId),
      ]);
      setProjects(refreshedProjects);
      setChangeNotice(
        result.stashCreated
          ? `Discarded working changes cleanly (stash backup ${result.stashRef?.slice(0, 7) ?? 'stash@{0}'}).`
          : 'Working tree had no pending changes.',
      );
    } catch (err) {
      setChangeError(err instanceof Error ? err.message : String(err));
    } finally {
      setDiscardingChanges(false);
    }
  };

  const handleIntegrateBranch = async (): Promise<void> => {
    const api = window.orchdeck;
    const project = projects.find((p) => p.id === selectedProjectId) ?? null;
    if (!api || !project) {
      return;
    }
    setIntegratingBranch(true);
    setChangeError(null);
    setChangeNotice(null);
    try {
      const result = await api.integrateBranch({
        projectId: project.id,
        chatId: selectedChatId ?? undefined,
        targetBranch: project.defaultBranch,
        strategy: 'merge',
      });
      const [{ projects: refreshedProjects }] = await Promise.all([
        api.listProjects(),
        refreshChangeCard(project.id, selectedChatId),
      ]);
      setProjects(refreshedProjects);
      if (result.integrated) {
        setChangeNotice(result.message);
      } else {
        setChangeError(result.message);
      }
    } catch (err) {
      setChangeError(err instanceof Error ? err.message : String(err));
    } finally {
      setIntegratingBranch(false);
    }
  };

  const handleCreateWorktree = async (chatId: string): Promise<void> => {
    const api = window.orchdeck;
    if (!api || !selectedProjectId) {
      return;
    }
    setWorktreeBusy(true);
    setChangeError(null);
    try {
      await api.createWorktree({ projectId: selectedProjectId, chatId });
      await Promise.all([
        refreshChatsForProject(selectedProjectId),
        refreshChangeCard(selectedProjectId, chatId),
      ]);
    } catch (err) {
      setChangeError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorktreeBusy(false);
    }
  };

  const handleRemoveWorktree = async (chatId: string): Promise<void> => {
    const api = window.orchdeck;
    if (!api || !selectedProjectId) {
      return;
    }
    setWorktreeBusy(true);
    setChangeError(null);
    try {
      await api.removeWorktree({ projectId: selectedProjectId, chatId });
      await Promise.all([
        refreshChatsForProject(selectedProjectId),
        refreshChangeCard(selectedProjectId, chatId),
      ]);
    } catch (err) {
      setChangeError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorktreeBusy(false);
    }
  };

  const handleStartSecondOpinion = async (
    promptText: string,
    modelBHandle: string,
  ): Promise<void> => {
    const api = window.orchdeck;
    const project = projects.find((p) => p.id === selectedProjectId) ?? null;
    if (!api || !project || !selectedChatId) {
      return;
    }
    setSecondOpinionBusy(true);
    try {
      const modelAHandle = turnOverrideHandle ?? chatModelHandle;
      const { secondOpinion } = await api.startSecondOpinion({
        projectId: project.id,
        chatId: selectedChatId,
        cwd: project.rootPath,
        prompt: promptText,
        modelAHandle,
        modelBHandle,
      });
      setActiveSecondOpinion(secondOpinion);
    } finally {
      setSecondOpinionBusy(false);
    }
  };

  const handleResolveSecondOpinion = async (
    secondOpinionId: string,
    resolution: SecondOpinionResolution,
    followUpPrompt: string,
  ): Promise<void> => {
    const api = window.orchdeck;
    if (!api) {
      return;
    }
    setSecondOpinionBusy(true);
    try {
      const { secondOpinion } = await api.resolveSecondOpinion({
        secondOpinionId,
        resolution,
      });
      setActiveSecondOpinion(secondOpinion);
      await handleSendPrompt(followUpPrompt);
    } finally {
      setSecondOpinionBusy(false);
    }
  };

  const activeProject = projects.find((p) => p.id === selectedProjectId) ?? null;
  const activeChats = activeProject ? (chatsByProject[activeProject.id] ?? []) : [];
  const activeChat = activeChats.find((c) => c.id === selectedChatId) ?? null;

  return (
    <WorkbenchShell
      projectName={activeProject?.name}
      branchName={activeChat?.worktreeBranch ?? activeProject?.currentBranch ?? undefined}
      radarSlot={
        <UsageQuotaRadar
          summary={usageSummary}
          includeLocalLogs={includeLocalLogs}
          loading={loadingUsage}
          onToggleLocalLogs={(next) => {
            setIncludeLocalLogs(next);
            void refreshUsageSummary(next);
          }}
          onRefresh={() => refreshUsageSummary()}
        />
      }
      sidebarContent={
        <ProjectSidebar
          projects={projects}
          selectedProjectId={selectedProjectId}
          chatsByProject={chatsByProject}
          selectedChatId={selectedChatId}
          includeArchived={includeArchived}
          onToggleIncludeArchived={() => setIncludeArchived((prev) => !prev)}
          onSelectProject={handleSelectProject}
          onSelectChat={handleSelectChat}
          onLinkRepository={handleLinkRepository}
          onPickDirectory={handlePickDirectory}
          onUpdateProject={handleUpdateProject}
          onDeleteProject={handleDeleteProject}
          onCreateChat={handleCreateChat}
          onRenameChat={handleRenameChat}
          onArchiveChat={handleArchiveChat}
          onDeleteChat={handleDeleteChat}
        />
      }
    >
      {bridgeError ? (
        <div className="mb-4 rounded-[6px] bg-warn-bg px-3 py-2 text-[12px] text-warn">
          {bridgeError}
        </div>
      ) : null}

      <ChatWorkspace
        project={activeProject}
        chat={activeChat}
        messages={messages}
        messageMetaById={messageMetaById}
        streaming={streaming}
        modelOptions={modelOptions}
        chatModelHandle={chatModelHandle}
        turnOverrideHandle={turnOverrideHandle}
        approvalMode={approvalMode}
        activeTaskRun={activeTaskRun}
        planActionBusy={planActionBusy}
        recipes={recipes}
        selectedRecipeId={selectedRecipeId}
        activeRecipeRun={activeRecipeRun}
        activeSecondOpinion={activeSecondOpinion}
        secondOpinionBusy={secondOpinionBusy}
        rateLimitBanner={rateLimitBanner}
        relayingHandoff={relayingHandoff}
        handoffNotice={handoffNotice}
        changeSnapshot={changeSnapshot}
        testResult={testResult}
        loadingChanges={loadingChanges}
        runningTests={runningTests}
        committingChanges={committingChanges}
        discardingChanges={discardingChanges}
        integratingBranch={integratingBranch}
        worktreeBusy={worktreeBusy}
        changeError={changeError}
        changeNotice={changeNotice}
        onChangeChatModel={setChatModelHandle}
        onChangeTurnOverride={setTurnOverrideHandle}
        onChangeApprovalMode={setApprovalMode}
        onSelectRecipe={setSelectedRecipeId}
        onCreateRecipe={handleCreateRecipe}
        onDeleteRecipe={handleDeleteRecipe}
        onRelayHandoff={handleRelayHandoff}
        onStartSecondOpinion={handleStartSecondOpinion}
        onResolveSecondOpinion={handleResolveSecondOpinion}
        onApprovePlan={handleApprovePlan}
        onRejectPlan={handleRejectPlan}
        onSendPrompt={handleSendPrompt}
        onCancelTurn={handleCancelTurn}
        onCreateChat={handleCreateChat}
        onRefreshChanges={() => refreshChangeCard(selectedProjectId, selectedChatId)}
        onRunTests={handleRunTests}
        onApproveChanges={handleApproveChanges}
        onDiscardChanges={handleDiscardChanges}
        onIntegrateBranch={handleIntegrateBranch}
        onCreateWorktree={handleCreateWorktree}
        onRemoveWorktree={handleRemoveWorktree}
      />
    </WorkbenchShell>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <WorkbenchApp />
      </LanguageProvider>
    </ThemeProvider>
  );
}
