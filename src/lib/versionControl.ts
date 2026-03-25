import { SlideInfo, VersionState, LoadedContent, ChatMessage, ConversationContext } from '@/types';
import { fetchJson, fetchOk } from '@/lib/http';

export const getSlideInfo = async (projectId: string): Promise<SlideInfo | null> => {
  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/info`);
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.error("Error fetching slide info:", error);
    return null;
  }
};

export const saveSlideInfo = async (projectId: string, info: SlideInfo): Promise<void> => {
  await fetchOk(`/api/projects/${encodeURIComponent(projectId)}/info`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(info),
  }, 'Failed to save project info');
};

export const saveState = async (
  projectId: string,
  stateIndex: number,
  htmlContent: string,
  chatHistory: ChatMessage[] | null,
  context: ConversationContext | null,
  isAuto: boolean = false
): Promise<VersionState> => {
  const stateId = `${isAuto ? 'auto' : 'state'}_${stateIndex}`;

  await fetchOk(`/api/projects/${encodeURIComponent(projectId)}/states`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      stateId,
      html: htmlContent,
      chat: chatHistory || [],
      context: context || null,
    }),
  }, 'Failed to save state');

  return {
    id: stateId,
    name: isAuto ? `Auto Save ${stateIndex}` : `State ${stateIndex}`,
    path: stateId,
    chat_path: stateId,
    save_time: new Date().toISOString(),
    is_auto: isAuto,
  };
};

export const deleteState = async (projectId: string, stateId: string): Promise<void> => {
  await fetchOk(`/api/projects/${encodeURIComponent(projectId)}/states/${encodeURIComponent(stateId)}`, { method: 'DELETE' }, 'Failed to delete state');
};

export const loadStateContent = async (projectId: string, stateId: string): Promise<LoadedContent> => {
  const data = await fetchJson<any>(
    `/api/projects/${encodeURIComponent(projectId)}/states/${encodeURIComponent(stateId)}`,
    undefined,
    `State not found: ${stateId}`
  );
  return {
    html: data.html || '',
    chat: data.chat || [],
    context: data.context || null,
  };
};

export const deleteProjectData = async (projectId: string): Promise<void> => {
  await fetchOk(`/api/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' }, 'Failed to delete project');
};
