import React, { useState, useRef, useEffect, useCallback } from "react";
import { Send, Bot, User, Plus, Info, X, Paperclip, Image as ImageIcon, FileText, ChevronDown } from "lucide-react";
import { useLanguage } from "../hooks/useLanguage";
import { ChatMessage, ChatAttachment, AIProvider } from "@/types";
import { loadSettings, getConfiguredProviders, getCachedSettings } from "@/lib/ai";

interface AIChatProps {
  onGenerate: (prompt: string, includeSlides: boolean, attachments?: ChatAttachment[], providerOverride?: AIProvider) => Promise<any>;
  isGenerating: boolean;
  chatHistoryRef: React.MutableRefObject<ChatMessage[]>;
  loadedHistory: ChatMessage[] | null;
  onNewChat: () => Promise<void>;
  isCreatingNewChat: boolean;
  pendingMessage?: string | null;
  onPendingMessageConsumed?: () => void;
  searchStatus?: 'idle' | 'planning' | 'searching' | 'generating';
}

const PROVIDER_LABELS: Record<AIProvider, string> = {
  claude: 'Claude',
  gemini: 'Gemini',
  openai: 'OpenAI',
  kimi: 'Kimi Coding',
  zhipu: 'GLM Coding',
  qwen: 'Qwen Coding',
};

export default function AIChat({ onGenerate, isGenerating, chatHistoryRef, loadedHistory, onNewChat, isCreatingNewChat, pendingMessage, onPendingMessageConsumed, searchStatus = 'idle' }: AIChatProps) {
  const [message, setMessage] = useState<string>("");
  const [includeSlides, setIncludeSlides] = useState(true);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<AIProvider | null>(() => {
    const saved = localStorage.getItem('openslides_selected_provider');
    return saved ? (saved as AIProvider) : null;
  });
  const [configuredProviders, setConfiguredProviders] = useState<AIProvider[]>([]);
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const dropZoneRef = useRef<HTMLFormElement | null>(null);
  const providerDropdownRef = useRef<HTMLDivElement | null>(null);
  const { t } = useLanguage();

  // Load configured providers on mount and refresh periodically
  const refreshProviders = useCallback(() => {
    loadSettings().then(() => {
      const configured = getConfiguredProviders();
      setConfiguredProviders(configured);
      const settings = getCachedSettings();
      if (settings && !selectedProvider) {
        setSelectedProvider(settings.activeProvider);
        localStorage.setItem('openslides_selected_provider', settings.activeProvider);
      }
    });
  }, [selectedProvider]);

  useEffect(() => {
    refreshProviders();
  }, []);

  // Refresh provider list when dropdown is opened (catches settings changes)
  useEffect(() => {
    if (showProviderDropdown) {
      refreshProviders();
    }
  }, [showProviderDropdown, refreshProviders]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (providerDropdownRef.current && !providerDropdownRef.current.contains(e.target as Node)) {
        setShowProviderDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml', 'application/pdf'];

  const fileToAttachment = useCallback((file: File): Promise<ChatAttachment> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          name: file.name,
          dataUrl: reader.result as string,
          mimeType: file.type,
          size: file.size,
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const valid = fileArray.filter(f => ALLOWED_TYPES.includes(f.type));
    if (valid.length === 0) return;
    const newAttachments = await Promise.all(valid.map(fileToAttachment));
    setAttachments(prev => [...prev, ...newAttachments]);
  }, [fileToAttachment]);

  const removeAttachment = useCallback((index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  }, []);

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: t('aiChat.initialMessage'),
    },
  ]);

  // Update chat history when loaded from parent
  useEffect(() => {
    if (loadedHistory) {
      setChatHistory([
        {
          role: "assistant",
          content: t('aiChat.initialMessage'),
        },
        ...loadedHistory
      ]);
    }
  }, [loadedHistory, t]);

  // Expose chat history to parent via ref
  useEffect(() => {
    if (chatHistoryRef) {
      chatHistoryRef.current = chatHistory;
    }
  }, [chatHistory, chatHistoryRef]);

  // Update initial message when language changes, if no interaction yet
  useEffect(() => {
    if (chatHistory.length === 1 && chatHistory[0].role === 'assistant' && !loadedHistory) {
      setChatHistory([
        {
          role: "assistant",
          content: t('aiChat.initialMessage'),
        },
      ]);
    }
  }, [t, loadedHistory]);

  const handleNewChatClick = async () => {
      if (onNewChat && !isCreatingNewChat) {
          await onNewChat();
          setChatHistory([
            {
              role: "assistant",
              content: t('aiChat.initialMessage'),
            },
          ]);
      }
  };

  const sendMessage = async (userMessage: string, currentAttachments?: ChatAttachment[]) => {
    // Add user message with attachments
    const newHistory: ChatMessage[] = [...chatHistory, { role: "user", content: userMessage, attachments: currentAttachments }];
    setChatHistory(newHistory);

    if (onGenerate) {
      try {
        const response: any = await onGenerate(userMessage, includeSlides, currentAttachments, selectedProvider || undefined);

        let displayText: string = response;
        let usage = null;

        if (typeof response === 'object') {
            displayText = response.chatText || response.content || response;
            usage = response.usage;
        }

        setChatHistory((prev) => [
          ...prev,
          {
            role: "assistant",
            content: displayText,
            usage: usage
          } as ChatMessage,
        ]);
      } catch (error: any) {
        const errorMap: Record<string, string> = {
          'NO_API_KEY': t('aiChat.noApiKey'),
        };
        const msg = errorMap[error?.message] || error?.message || t('aiChat.genericError');
        setChatHistory((prev) => [
          ...prev,
          {
            role: "assistant",
            content: msg,
            isError: true,
          },
        ]);
      }
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!message.trim() && attachments.length === 0) || isGenerating) return;

    const userMessage = message;
    const currentAttachments = attachments.length > 0 ? [...attachments] : undefined;
    setMessage("");
    setAttachments([]);
    await sendMessage(userMessage, currentAttachments);
  };

  // Handle programmatic messages from parent (e.g. fix overflow)
  useEffect(() => {
    if (pendingMessage && !isGenerating) {
      onPendingMessageConsumed?.();
      sendMessage(pendingMessage);
    }
  }, [pendingMessage]);

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory, isGenerating, isCreatingNewChat]);

  const renderMessageContent = (content: string) => {
    if (typeof content !== 'string') return content;
    // Replace markdown code blocks for display
    let displayContent = content.replace(/```html[\s\S]*?```/gi, "\n[display in the preview]\n");
    // Also replace raw html tags just in case old history format
    displayContent = displayContent.replace(/<html>[\s\S]*?<\/html>/gi, "\n[display in the preview]\n");

    // Split out the "Displayed in the editor" badge
    const editorBadge = /\n*📄 \[Displayed in the editor\]\s*$/;
    const hasBadge = editorBadge.test(displayContent);
    if (hasBadge) {
      const text = displayContent.replace(editorBadge, '').trim();
      return (
        <div className="flex flex-col">
          {text && <span>{text}</span>}
          <span className="inline-flex items-center gap-1 mt-2 px-2 py-1 rounded-md bg-blue-500/15 text-blue-400 text-[11px] font-medium border border-blue-500/20 w-fit">
            📄 Displayed in the editor
          </span>
        </div>
      );
    }
    return displayContent;
  };

  return (
    <div className="flex flex-col h-full bg-background text-gray-200">
      <div className="p-4 border-b border-border bg-panel">
        <div className="h-10 flex items-center justify-between">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <Bot size={20} className="text-blue-400" />
            {t('aiChat.title')}
          </h2>
          {(
            <button
              onClick={handleNewChatClick}
              disabled={isCreatingNewChat}
              className={`p-2 rounded-lg transition-colors ${
                  isCreatingNewChat
                  ? "text-gray-600 cursor-not-allowed"
                  : "hover:bg-gray-700 text-gray-400 hover:text-white"
              }`}
              title={t('aiChat.newChat')}
            >
              <Plus size={20} className={isCreatingNewChat ? "animate-pulse" : ""} />
            </button>
          )}
        </div>
      </div>

      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-background"
      >
        {chatHistory.map((msg, index) => (
          <div
            key={index}
            className={`flex gap-3 ${
              msg.role === "user" ? "flex-row-reverse" : "flex-row"
            }`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                msg.role === "user" ? "bg-blue-600" : "bg-gray-700"
              }`}
            >
              {msg.role === "user" ? <User size={16} /> : <Bot size={16} />}
            </div>
            <div
              className={`p-3 rounded-2xl max-w-[85%] text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-blue-600 text-white rounded-tr-none"
                  : "bg-panel text-gray-200 rounded-tl-none border border-border"
              }`}
            >
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {msg.attachments.map((att, i) => (
                    att.mimeType.startsWith('image/') ? (
                      <img key={i} src={att.dataUrl} alt={att.name} className="max-w-[120px] max-h-[80px] rounded-lg object-cover border border-white/20" />
                    ) : (
                      <div key={i} className="flex items-center gap-1 px-2 py-1 bg-white/10 rounded text-xs">
                        <FileText size={12} />
                        <span className="truncate max-w-[100px]">{att.name}</span>
                      </div>
                    )
                  ))}
                </div>
              )}
              {renderMessageContent(msg.content)}
              {msg.usage && msg.usage.inputTokens > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-700/50 text-[10px] text-gray-500 flex gap-2">
                  <span>In: {(msg.usage.inputTokens || 0).toLocaleString()}</span>
                  {msg.usage.cachedTokens > 0 && <span className="text-green-500">(cached: {msg.usage.cachedTokens.toLocaleString()})</span>}
                  <span>Out: {(msg.usage.outputTokens || 0).toLocaleString()}</span>
                  {msg.usage.thinkingTokens > 0 && <span className="text-purple-400">(thinking: {msg.usage.thinkingTokens.toLocaleString()})</span>}
                  {msg.usage.estimatedPrice && <span className="text-yellow-500">${msg.usage.estimatedPrice}</span>}
                </div>
              )}
            </div>
          </div>
        ))}
        {(isGenerating || isCreatingNewChat) && (
          <div className="flex gap-3 flex-row">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-gray-700">
              <Bot size={16} />
            </div>
            <div className="p-3 rounded-2xl max-w-[85%] text-sm leading-relaxed bg-panel text-gray-200 rounded-tl-none border border-border flex items-center">
              <div className="flex space-x-1 h-4 items-center">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
              </div>
              {isCreatingNewChat && <span className="ml-2 text-xs text-gray-400">Saving & Creating...</span>}
              {!isCreatingNewChat && searchStatus === 'planning' && <span className="ml-2 text-xs text-gray-400">Planning search...</span>}
              {!isCreatingNewChat && searchStatus === 'searching' && <span className="ml-2 text-xs text-emerald-400">Searching the web...</span>}
              {!isCreatingNewChat && searchStatus === 'generating' && <span className="ml-2 text-xs text-gray-400">Generating slides...</span>}
            </div>
          </div>
        )}
      </div>

      <form
        ref={dropZoneRef}
        onSubmit={handleSend}
        className={`p-4 border-t border-border bg-panel relative transition-colors ${isDragOver ? 'bg-blue-500/10 border-blue-500/30' : ''}`}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) setIsDragOver(false); }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragOver(false);
          if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
        }}
      >
        {isDragOver && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-blue-500/10 border-2 border-dashed border-blue-500/40 rounded-xl pointer-events-none">
            <div className="flex items-center gap-2 text-blue-400 text-sm font-medium">
              <ImageIcon size={20} />
              <span>Drop image or file here</span>
            </div>
          </div>
        )}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {attachments.map((att, i) => (
              <div key={i} className="relative group">
                {att.mimeType.startsWith('image/') ? (
                  <div className="relative">
                    <img src={att.dataUrl} alt={att.name} className="h-16 w-auto rounded-lg border border-gray-700 object-cover" />
                    <button
                      type="button"
                      onClick={() => removeAttachment(i)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-800 border border-gray-600 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-red-600 hover:border-red-600 transition-colors"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ) : (
                  <div className="relative flex items-center gap-1.5 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-300">
                    <FileText size={14} />
                    <span className="truncate max-w-[100px]">{att.name}</span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(i)}
                      className="ml-1 text-gray-500 hover:text-white transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <textarea
          placeholder={t('aiChat.placeholder')}
          className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-4 pr-12 py-3 text-sm focus:ring-1 focus:ring-blue-500 outline-none text-white placeholder-gray-500 transition-all resize-none custom-scrollbar"
          value={message}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setMessage(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === 'Enter' && !e.shiftKey && !isGenerating) {
              e.preventDefault();
              handleSend(e);
            }
          }}
          onPaste={(e: React.ClipboardEvent<HTMLTextAreaElement>) => {
            const items = e.clipboardData.items;
            const files: File[] = [];
            for (let i = 0; i < items.length; i++) {
              const item = items[i];
              if (item.kind === 'file') {
                const file = item.getAsFile();
                if (file && ALLOWED_TYPES.includes(file.type)) {
                  files.push(file);
                }
              }
            }
            if (files.length > 0) {
              e.preventDefault();
              addFiles(files);
            }
          }}
          rows={3}
        />
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-2">
            {/* Provider selector */}
            <div ref={providerDropdownRef} className="relative">
              <button
                type="button"
                onClick={() => setShowProviderDropdown(!showProviderDropdown)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors border border-transparent hover:border-gray-700"
              >
                <span className="truncate max-w-[72px]">{selectedProvider ? PROVIDER_LABELS[selectedProvider] : 'Select'}</span>
                <ChevronDown size={12} />
              </button>
              {showProviderDropdown && (
                <div className="absolute bottom-full left-0 mb-1 w-36 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 py-1 max-h-60 overflow-y-auto custom-scrollbar">
                  {configuredProviders.map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => { setSelectedProvider(p); localStorage.setItem('openslides_selected_provider', p); setShowProviderDropdown(false); }}
                      className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                        selectedProvider === p
                          ? 'bg-blue-600/20 text-blue-400'
                          : 'text-gray-300 hover:bg-white/5'
                      }`}
                    >
                      {PROVIDER_LABELS[p]}
                    </button>
                  ))}
                  {configuredProviders.length === 0 && (
                    <p className="px-3 py-2 text-xs text-gray-500">No providers configured</p>
                  )}
                </div>
              )}
            </div>

            <div className="w-px h-4 bg-gray-700" />

            {/* Include slides toggle */}
            <button
              type="button"
              onClick={() => setIncludeSlides(!includeSlides)}
              className={`relative w-7 h-4 rounded-full transition-colors shrink-0 ${includeSlides ? 'bg-blue-600' : 'bg-gray-600'}`}
            >
              <div className={`absolute top-[2px] w-3 h-3 rounded-full bg-white transition-all ${includeSlides ? 'left-[14px]' : 'left-[2px]'}`} />
            </button>
            <span className="text-xs text-gray-400 select-none">{t('aiChat.includeSlides')}</span>
            <div className="relative group">
              <Info size={14} className="text-gray-500 cursor-help" />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-300 leading-relaxed opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-10">
                <p><span className="text-green-400 font-medium">ON:</span> {t('aiChat.includeSlidesOn')}</p>
                <p className="mt-1"><span className="text-rose-400 font-medium">OFF:</span> {t('aiChat.includeSlidesOff')}</p>
              </div>
            </div>
          </div>
          <button
            type="submit"
            className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={(!message.trim() && attachments.length === 0) || isGenerating}
          >
            <Send size={16} />
          </button>
        </div>
      </form>
    </div>
  );
}
