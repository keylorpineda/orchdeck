import { useCallback, useEffect, useRef, useState } from 'react';
import {
  parseModelHandle,
  type ChatRecord,
  type MessageRecord,
  type ProjectWithGitStatus,
  type TurnEventNotificationParams,
} from '@orchdeck/shared';
import { ChatWorkspace, type StreamingDraft } from './components/ChatWorkspace';
import { ProjectSidebar } from './components/ProjectSidebar';
import { ThemeProvider } from './components/ThemeProvider';
import { WorkbenchShell } from './components/WorkbenchShell';
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
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selectedModelHandle, setSelectedModelHandle] = useState('claude:opus-4-6:high');
  const [streaming, setStreaming] = useState<StreamingDraft | null>(null);
  const [bridgeError, setBridgeError] = useState<string | null>(null);

  const streamingRef = useRef<StreamingDraft | null>(null);
  const activeChatRef = useRef<string | null>(null);
  streamingRef.current = streaming;
  activeChatRef.current = selectedChatId;

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
      const { projects: loadedProjects } = await api.listProjects();
      setProjects(loadedProjects);

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

    return api.onTurnEvent((payload: TurnEventNotificationParams) => {
      const current = streamingRef.current;
      if (!current || current.turnId !== payload.turnId) {
        return;
      }

      if (payload.event.type === 'text_delta') {
        const nextText = `${current.text}${payload.event.text}`;
        setStreaming({ ...current, text: nextText });
        return;
      }

      if (payload.event.type === 'done') {
        const finalText = current.text.trim();
        setStreaming(null);
        const targetChatId = activeChatRef.current;
        if (targetChatId && finalText.length > 0) {
          void api
            .appendMessage({
              chatId: targetChatId,
              role: 'assistant',
              providerId: current.provider,
              modelId: current.modelId,
              content: finalText,
            })
            .then(async () => {
              const { messages: updated } = await api.listMessages(targetChatId);
              setMessages(updated);
              if (selectedProjectId) {
                await refreshChatsForProject(selectedProjectId);
              }
            });
        }
      }
    });
  }, [refreshChatsForProject, selectedProjectId]);

  const handleSelectProject = (projectId: string): void => {
    setSelectedProjectId(projectId);
    const chats = chatsByProject[projectId] ?? [];
    const nextChatId = chats[0]?.id ?? null;
    setSelectedChatId(nextChatId);
    if (nextChatId && window.orchdeck) {
      void window.orchdeck.listMessages(nextChatId).then((res) => setMessages(res.messages));
    } else {
      setMessages([]);
    }
  };

  const handleSelectChat = (projectId: string, chatId: string): void => {
    setSelectedProjectId(projectId);
    setSelectedChatId(chatId);
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

    const parsed = parseModelHandle(selectedModelHandle);
    const started = await api.startTurn({
      projectId: project.id,
      chatId: selectedChatId,
      cwd: project.rootPath,
      modelHandle: selectedModelHandle,
      prompt,
    });
    setStreaming({
      turnId: started.turnId,
      provider: parsed.provider,
      modelId: parsed.modelId,
      text: '',
    });
  };

  const handleCancelTurn = async (turnId: string): Promise<void> => {
    await window.orchdeck?.cancelTurn(turnId);
  };

  const activeProject = projects.find((p) => p.id === selectedProjectId) ?? null;
  const activeChats = activeProject ? (chatsByProject[activeProject.id] ?? []) : [];
  const activeChat = activeChats.find((c) => c.id === selectedChatId) ?? null;

  return (
    <WorkbenchShell
      projectName={activeProject?.name}
      branchName={activeProject?.currentBranch ?? undefined}
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
        streaming={streaming}
        selectedModelHandle={selectedModelHandle}
        onChangeModelHandle={setSelectedModelHandle}
        onSendPrompt={handleSendPrompt}
        onCancelTurn={handleCancelTurn}
        onCreateChat={handleCreateChat}
      />
    </WorkbenchShell>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <WorkbenchApp />
    </ThemeProvider>
  );
}
