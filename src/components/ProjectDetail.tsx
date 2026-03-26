import React, { useState, useRef, useEffect } from "react";
import FileManager from "./FileManager";
import SlidePreview from "./SlidePreview";
import AIChat from "./AIChat";
import { generateSlides, planSearch, executeSearch, formatSearchContext, saveProjectContext, loadProjectContextFormatted } from "../lib/ai";
import { useLanguage } from "../hooks/useLanguage";
import { getSlideInfo, saveSlideInfo, saveState, loadStateContent, deleteState } from "../lib/versionControl";
import { CheckCircle, AlertCircle } from "lucide-react";
import { Project, SlideInfo, Toast, ChatMessage, LocalFile, ConversationContext } from "@/types";

interface ProjectDetailProps {
  project: Project;
  onBack: () => void;
}

const MAX_MANUAL_HISTORY = 10;
const MAX_AUTO_HISTORY = 10;

export default function ProjectDetail({ project, onBack }: ProjectDetailProps) {
  const [leftWidth, setLeftWidth] = useState(20);
  const [rightWidth, setRightWidth] = useState(25);
  const [slidesData, setSlidesData] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [slideInfo, setSlideInfo] = useState<SlideInfo | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<Toast>({ show: false, message: "", type: "success" });
  const [loadedChatHistory, setLoadedChatHistory] = useState<ChatMessage[] | null>(null);
  const [conversationSummary, setConversationSummary] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingNewChat, setIsCreatingNewChat] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<LocalFile[]>([]);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const { t } = useLanguage();

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 2000);
  };

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chatHistoryRef = useRef<ChatMessage[]>([]);
  const isResizingLeft = useRef(false);
  const isResizingRight = useRef(false);

  const buildConversationSummary = (history: ChatMessage[], currentFiles: LocalFile[]): string => {
    const recent = history
      .filter(msg => !msg.isError)
      .slice(-6)
      .map(msg => {
        const normalized = msg.role === 'assistant' && /<!doctype\s+html/i.test(msg.content)
          ? 'Updated the presentation HTML.'
          : msg.content.replace(/\s+/g, ' ').trim();
        return {
          role: msg.role,
          content: normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized,
        };
      });

    const lines: string[] = [];
    const userMessages = recent.filter(msg => msg.role === 'user');
    const assistantMessages = recent.filter(msg => msg.role === 'assistant');

    if (userMessages.length > 0) {
      lines.push(`Recent user requests: ${userMessages.map(msg => msg.content).join(' | ')}`);
    }
    if (assistantMessages.length > 0) {
      lines.push(`Recent assistant work: ${assistantMessages.map(msg => msg.content).join(' | ')}`);
    }
    if (currentFiles.length > 0) {
      lines.push(`Project source files: ${currentFiles.map(file => file.name).join(', ')}`);
    }

    return lines.join('\n');
  };

  const buildConversationContext = (history: ChatMessage[], currentFiles: LocalFile[]): ConversationContext => ({
    summary: buildConversationSummary(history, currentFiles),
    fileSnapshot: currentFiles.map(file => ({
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
    })),
  });

  // Load initial state
  useEffect(() => {
    const loadInitial = async () => {
      try {
        const info = await getSlideInfo(project.id);
        setSlideInfo(info);

        let latestState = null;
        if (info) {
          const manualStates = info.states || [];
          const autoStates = info.auto_states || [];

          if (info.current_state) {
            latestState = manualStates.find(s => s.id === info.current_state) ||
                          autoStates.find(s => s.id === info.current_state);
          }
          if (!latestState) {
            if (manualStates.length > 0) latestState = manualStates[manualStates.length - 1];
            else if (autoStates.length > 0) latestState = autoStates[autoStates.length - 1];
          }
        }

        if (latestState) {
          const { html, chat, context } = await loadStateContent(project.id, latestState.path);
          setSlidesData(html);
          if (chat && chat.length > 0) {
            setLoadedChatHistory(chat);
          }
          setConversationSummary(context?.summary || '');
          setCurrentVersion(latestState.id);
        }
      } catch (error) {
        console.error("Failed to load initial state:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadInitial();
  }, [project.id]);

  const filterChatHistory = (history: ChatMessage[]): ChatMessage[] => {
    if (!history) return [];
    const filtered: ChatMessage[] = [];
    for (let i = 0; i < history.length; i++) {
      const msg = history[i];
      if (i === 0 && msg.role === 'assistant') continue;
      if (msg.isError) continue;
      if (i + 1 < history.length && history[i+1].isError) continue;
      filtered.push(msg);
    }
    return filtered;
  };

  const [searchStatus, setSearchStatus] = useState<'idle' | 'planning' | 'searching' | 'generating'>('idle');

  const handleGenerateSlides = async (userPrompt: string = "", includeSlides: boolean = true, inlineAttachments?: import("@/types").ChatAttachment[], providerOverride?: import("@/types").AIProvider) => {
    setIsGenerating(true);
    try {
      const rawHistory = chatHistoryRef.current || [];
      const filteredHistory = filterChatHistory(rawHistory);
      const currentSlidesForApi = includeSlides ? slidesData : null;

      // Planner decides: (1) whether to search the web, (2) whether to include existing context
      let searchContext = '';
      let persistedContext = '';
      console.log('[handleGenerateSlides] userPrompt:', userPrompt ? `"${userPrompt.slice(0, 80)}..."` : '(empty)');
      console.log('[handleGenerateSlides] providerOverride:', providerOverride, 'project.id:', project.id);
      if (userPrompt) {
        try {
          setSearchStatus('planning');
          console.log('[handleGenerateSlides] About to call planSearch...');
          const plan = await planSearch(userPrompt, providerOverride, project.id);
          console.log('[handleGenerateSlides] planSearch returned:', plan);

          if (plan.needsSearch && plan.queries.length > 0) {
            setSearchStatus('searching');
            const searchResult = await executeSearch(plan.queries);
            if (searchResult.results.length > 0) {
              searchContext = formatSearchContext(searchResult);
              // Persist search results to project context for future reuse
              try {
                await saveProjectContext(project.id, { searchResults: searchResult.results });
              } catch { /* non-fatal */ }
            }
          }

          // Load persisted context only if planner says it's needed
          if (plan.needsContext && !searchContext) {
            try {
              persistedContext = await loadProjectContextFormatted(project.id);
            } catch { /* non-fatal */ }
          }
        } catch (err) {
          console.error('[handleGenerateSlides] Search agent error:', err);
        }
      }
      setSearchStatus('generating');

      const responseData = await generateSlides(
        project.id,
        userPrompt,
        filteredHistory,
        currentSlidesForApi,
        uploadedFiles,
        conversationSummary,
        inlineAttachments,
        providerOverride,
        searchContext || persistedContext
      );
      const { content, chatText, usage } = responseData;
      setSlidesData(content);

      // Auto Save
      const currentAutoStates = slideInfo?.auto_states || [];
      const maxAutoIndex = currentAutoStates.reduce((max, s) => {
        const idx = parseInt(s.id.split('_')[1] || "0");
        return idx > max ? idx : max;
      }, 0);
      const nextAutoIndex = maxAutoIndex + 1;

      const historyToSave: ChatMessage[] = [
        ...filteredHistory,
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: chatText || content, usage: usage }
      ];
      const nextContext = buildConversationContext(historyToSave, uploadedFiles);

      const newState = await saveState(project.id, nextAutoIndex, content, historyToSave, nextContext, true);
      let newAutoStates = [...currentAutoStates, newState];

      if (newAutoStates.length > MAX_AUTO_HISTORY) {
        const stateToRemove = newAutoStates[0];
        await deleteState(project.id, stateToRemove.path);
        newAutoStates = newAutoStates.slice(1);
      }

      const newInfo: SlideInfo = {
        ...slideInfo,
        states: slideInfo?.states || [],
        auto_states: newAutoStates,
        current_state: newState.id
      };

      await saveSlideInfo(project.id, newInfo);
      setSlideInfo(newInfo);
      setCurrentVersion(newState.id);
      setConversationSummary(nextContext.summary);

      return { content, chatText, usage };
    } catch (error) {
      console.error("Failed to generate slides:", error);
      throw error;
    } finally {
      setIsGenerating(false);
      setSearchStatus('idle');
    }
  };

  const handleManualSave = async (contentToSave?: string) => {
    const content = contentToSave || slidesData;
    if (!content) return;

    let currentStates = slideInfo?.states || [];
    if (currentStates.length >= MAX_MANUAL_HISTORY) {
      const confirmed = window.confirm(`You have reached the maximum limit of ${MAX_MANUAL_HISTORY} manual save states. Saving this new state will delete the oldest one. Do you want to proceed?`);
      if (!confirmed) return;
      const stateToDelete = currentStates[0];
      try {
        await deleteState(project.id, stateToDelete.path);
        currentStates = currentStates.slice(1);
      } catch (error) {
        console.error("Failed to delete oldest state:", error);
        showToast("Failed to delete oldest state", "error");
        return;
      }
    }

    setIsSaving(true);
    try {
      const maxManualIndex = currentStates.reduce((max, s) => {
        const idx = parseInt(s.id.split('_')[1] || "0");
        return idx > max ? idx : max;
      }, 0);
      const nextIndex = maxManualIndex + 1;

      const historyToSave = filterChatHistory(chatHistoryRef.current);
      const currentContext = buildConversationContext(historyToSave, uploadedFiles);
      const newState = await saveState(project.id, nextIndex, content, historyToSave, currentContext, false);

      const newInfo: SlideInfo = {
        ...slideInfo,
        states: [...currentStates, newState],
        auto_states: slideInfo?.auto_states || [],
        current_state: newState.id
      };

      await saveSlideInfo(project.id, newInfo);
      setSlideInfo(newInfo);
      setCurrentVersion(newState.id);
      showToast(t('common.saved'), "success");
    } catch (error) {
      console.error("Failed to save slides:", error);
      showToast("Failed to save slides", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadVersion = async (stateId: string) => {
    try {
      const manualStates = slideInfo?.states || [];
      const autoStates = slideInfo?.auto_states || [];
      const state = manualStates.find(s => s.id === stateId) || autoStates.find(s => s.id === stateId);
      if (!state) throw new Error("State not found");

      const { html, chat, context } = await loadStateContent(project.id, state.path);
      setSlidesData(html);
      if (chat && chat.length > 0) {
        setLoadedChatHistory(chat);
      } else {
        setLoadedChatHistory(null);
      }
      setConversationSummary(context?.summary || '');
      setCurrentVersion(stateId);
    } catch (error) {
      console.error("Failed to load version:", error);
      alert("Failed to load version");
    }
  };

  const handleRenameVersion = async (stateId: string, newName: string) => {
    if (!slideInfo) return;
    const isAuto = slideInfo.auto_states?.some(s => s.id === stateId);
    if (isAuto) {
      alert("Cannot rename auto-saved versions.");
      return;
    }

    const updatedStates = slideInfo.states.map(s =>
      s.id === stateId ? { ...s, name: newName } : s
    );
    const newInfo = { ...slideInfo, states: updatedStates };
    try {
      await saveSlideInfo(project.id, newInfo);
      setSlideInfo(newInfo);
    } catch (error) {
      console.error("Failed to rename version:", error);
      alert("Failed to rename version");
    }
  };

  const handleDeleteVersion = async (stateId: string) => {
    if (!slideInfo) return;
    const stateToDelete = slideInfo.states?.find(s => s.id === stateId);
    if (!stateToDelete) return;

    try {
      await deleteState(project.id, stateToDelete.path);
      const updatedStates = slideInfo.states.filter(s => s.id !== stateId);
      const newInfo = { ...slideInfo, states: updatedStates };
      await saveSlideInfo(project.id, newInfo);
      setSlideInfo(newInfo);
      showToast("Version deleted", "success");
      if (currentVersion === stateId) setCurrentVersion(null);
    } catch (error) {
      console.error("Failed to delete version:", error);
      showToast("Failed to delete version", "error");
    }
  };

  const autoSaveCurrentState = async () => {
    if (!slidesData) return;
    const autoStates = slideInfo?.auto_states || [];
    const lastAutoState = autoStates.length > 0 ? autoStates[autoStates.length - 1] : null;

    let shouldSave = true;
    if (lastAutoState) {
      try {
        const { html, chat } = await loadStateContent(project.id, lastAutoState.path);
        const currentFilteredChat = filterChatHistory(chatHistoryRef.current);
        const normalize = (history: ChatMessage[]) => history.map(({ role, content, usage }) => ({ role, content, usage }));
        const loadedChatStr = JSON.stringify(normalize(chat || []));
        const currentChatStr = JSON.stringify(normalize(currentFilteredChat || []));
        if (html === slidesData && loadedChatStr === currentChatStr) shouldSave = false;
      } catch (error) {
        console.warn("Failed to compare with last auto save:", error);
      }
    }

    if (shouldSave) {
      try {
        const maxAutoIndex = autoStates.reduce((max, s) => {
          const idx = parseInt(s.id.split('_')[1] || "0");
          return idx > max ? idx : max;
        }, 0);
        const nextAutoIndex = maxAutoIndex + 1;

        const historyToSave = filterChatHistory(chatHistoryRef.current);
        const currentContext = buildConversationContext(historyToSave, uploadedFiles);
        const newState = await saveState(project.id, nextAutoIndex, slidesData, historyToSave, currentContext, true);
        let newAutoStates = [...autoStates, newState];

        if (newAutoStates.length > MAX_AUTO_HISTORY) {
          const stateToRemove = newAutoStates[0];
          await deleteState(project.id, stateToRemove.path);
          newAutoStates = newAutoStates.slice(1);
        }

        const newInfo: SlideInfo = {
          ...slideInfo,
          states: slideInfo?.states || [],
          auto_states: newAutoStates,
          current_state: newState.id
        };
        await saveSlideInfo(project.id, newInfo);
        setSlideInfo(newInfo);
        setCurrentVersion(newState.id);
        setConversationSummary(currentContext.summary);
      } catch (error) {
        console.error("Auto save failed:", error);
      }
    }
  };

  const handleNewChat = async () => {
    setIsCreatingNewChat(true);
    try {
      await autoSaveCurrentState();
      setLoadedChatHistory(null);
      chatHistoryRef.current = [];
      setConversationSummary("");
    } finally {
      setIsCreatingNewChat(false);
    }
  };

  const startResizingLeft = () => {
    isResizingLeft.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const startResizingRight = () => {
    isResizingRight.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const stopResizing = () => {
    isResizingLeft.current = false;
    isResizingRight.current = false;
    document.body.style.cursor = "default";
    document.body.style.userSelect = "auto";
  };

  const resize = (e: MouseEvent) => {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const containerWidth = containerRect.width;

    if (isResizingLeft.current) {
      const newLeftWidth = ((e.clientX - containerRect.left) / containerWidth) * 100;
      if (newLeftWidth > 15 && newLeftWidth < 40) setLeftWidth(newLeftWidth);
    }

    if (isResizingRight.current) {
      const newRightWidth = ((containerRect.right - e.clientX) / containerWidth) * 100;
      if (newRightWidth > 15 && newRightWidth < 40) setRightWidth(newRightWidth);
    }
  };

  useEffect(() => {
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, []);

  return (
    <div className="h-[calc(100vh-64px)] p-4 bg-background text-text-primary overflow-hidden relative">
      {isLoading ? (
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-400 text-sm">{t('common.loading')}</p>
          </div>
        </div>
      ) : (
      <div ref={containerRef} className="flex h-full gap-0 relative">
        {/* Left Pane: Sources (Files) */}
        <div
          style={{ width: `${leftWidth}%` }}
          className="h-full overflow-hidden rounded-2xl border border-border bg-background flex-shrink-0"
        >
          <FileManager
            projectId={project.id}
            onFilesChange={setUploadedFiles}
          />
        </div>

        {/* Left Resizer */}
        <div
          onMouseDown={startResizingLeft}
          className="w-4 cursor-col-resize flex items-center justify-center hover:bg-white/5 active:bg-blue-500/20 transition-colors -ml-2 -mr-2 z-10 select-none"
        >
          <div className="w-1 h-8 bg-gray-700 rounded-full" />
        </div>

        {/* Middle Pane: Slides */}
        <div className="flex-1 h-full overflow-hidden rounded-2xl border border-border bg-background shadow-lg shadow-black/50 mx-2">
          <SlidePreview
            slidesData={slidesData}
            isGenerating={isGenerating}
            isCreatingNewChat={isCreatingNewChat}
            onSave={handleManualSave}
            isSaving={isSaving}
            manualVersions={slideInfo?.states || []}
            autoVersions={slideInfo?.auto_states || []}
            currentVersion={currentVersion}
            onLoadVersion={handleLoadVersion}
            onRenameVersion={handleRenameVersion}
            onDeleteVersion={handleDeleteVersion}
            onEditorChange={(html: string) => setSlidesData(html)}
            onFixOverflow={(prompt: string) => setPendingMessage(prompt)}
            projectId={project.id}
          />
        </div>

        {/* Right Resizer */}
        <div
          onMouseDown={startResizingRight}
          className="w-4 cursor-col-resize flex items-center justify-center hover:bg-white/5 active:bg-blue-500/20 transition-colors -ml-2 -mr-2 z-10 select-none"
        >
          <div className="w-1 h-8 bg-gray-700 rounded-full" />
        </div>

        {/* Right Pane: AI Chat */}
        <div
          style={{ width: `${rightWidth}%` }}
          className="h-full overflow-hidden rounded-2xl border border-border bg-background flex-shrink-0"
        >
          <AIChat
            onGenerate={handleGenerateSlides}
            onNewChat={handleNewChat}
            isGenerating={isGenerating}
            isCreatingNewChat={isCreatingNewChat}
            chatHistoryRef={chatHistoryRef}
            loadedHistory={loadedChatHistory}
            pendingMessage={pendingMessage}
            onPendingMessageConsumed={() => setPendingMessage(null)}
            searchStatus={searchStatus}
          />
        </div>
      </div>
      )}

      {/* Toast */}
      {toast.show && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border ${
            toast.type === 'success'
              ? 'bg-green-500/10 border-green-500/20 text-green-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          } backdrop-blur-md`}>
            {toast.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
            <span className="font-medium text-sm">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
