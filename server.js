import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
const PROJECTS_DIR = path.join(__dirname, 'projects');

// Ensure projects directory exists
if (!fs.existsSync(PROJECTS_DIR)) {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

app.use(express.json({ limit: '50mb' }));

// ============================================================
// AI Generation Proxy
// ============================================================

const DEFAULT_BASE_URLS = {
  gemini: 'https://generativelanguage.googleapis.com',
  claude: 'https://api.anthropic.com',
  openai: 'https://api.openai.com/v1',
};

const FILE_INTRO_TEXT = 'Here are the uploaded reference files. Use their content to create the presentation:';
const FILE_ACK_TEXT = 'I have received and reviewed all uploaded files. I will use their content for the presentation. Please provide your instructions.';
const GEMINI_CACHE_TTL_SECONDS = 14400; // 4 hours
const GEMINI_FILE_POLL_INTERVAL_MS = 1500;
const GEMINI_FILE_POLL_TIMEOUT_MS = 60000;
const GEMINI_GENERATE_TIMEOUT_MS = 180000;
const GEMINI_RETRY_DELAY_MS = 1200;
const GEMINI_MAX_RETRIES = 3;


function isNativeOpenAIBaseUrl(baseUrl) {
  try {
    const url = new URL(baseUrl || DEFAULT_BASE_URLS.openai);
    return url.hostname === 'api.openai.com';
  } catch {
    return false;
  }
}

app.post('/api/generate', async (req, res) => {
  const { provider, model, projectId, apiKey, baseUrl, system, messages, temperature = 0.7, files } = req.body;

  if (!apiKey) {
    return res.status(400).json({ error: 'No API key provided' });
  }

  const base = (baseUrl || DEFAULT_BASE_URLS[provider] || '').replace(/\/$/, '');

  try {
    let result;
    if (provider === 'claude') {
      result = await callClaude(base, apiKey, model, system, messages, temperature, files);
    } else if (provider === 'gemini') {
      result = await callGemini(base, apiKey, model, projectId, system, messages, temperature, files);
    } else if (provider === 'openai' && isNativeOpenAIBaseUrl(base)) {
      result = await callOpenAINative(base, apiKey, model, projectId, system, messages, temperature, files);
    } else {
      result = await callOpenAICompatible(base, apiKey, model, system, messages, temperature, files);
    }
    res.json(result);
  } catch (error) {
    console.error('AI generation error:', error);
    res.status(500).json({ error: error.message || 'AI generation failed' });
  }
});

async function callClaude(baseUrl, apiKey, model, systemText, messages, temperature, files) {
  // Claude native Anthropic format with cache_control
  const systemBlocks = [];

  if (systemText) {
    systemBlocks.push({
      type: 'text',
      text: systemText,
      // cache_control goes here only if there are no file messages to cache
    });
  }

  // Convert messages to Claude format
  const claudeMessages = [];
  let hasFiles = false;

  for (const msg of messages) {
    if (msg.role === 'system') continue;

    const content = [];

    // Handle file attachments (images + PDFs)
    if (msg.files && msg.files.length > 0) {
      hasFiles = true;
      for (const f of msg.files) {
        if (f.mimeType.startsWith('image/')) {
          content.push({
            type: 'image',
            source: { type: 'base64', media_type: f.mimeType, data: f.data },
          });
        } else if (f.mimeType === 'application/pdf') {
          content.push({
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: f.data },
          });
        }
      }
    }

    content.push({ type: 'text', text: msg.content });

    claudeMessages.push({
      role: msg.role === 'model' ? 'assistant' : msg.role,
      content,
    });
  }

  // Place cache_control on the last stable block:
  // - If files exist: on the first user message (file attachments) so files are cached
  // - If no files: on the system prompt
  if (hasFiles && claudeMessages.length > 0) {
    // Put cache breakpoint on the last content block of the first message (the file message)
    const firstMsg = claudeMessages[0];
    const lastBlock = firstMsg.content[firstMsg.content.length - 1];
    lastBlock.cache_control = { type: 'ephemeral' };
    // System prompt is before files, so it's cached too (prefix caching)
  }
  if (systemBlocks.length > 0) {
    // Always mark system for caching (acts as first breakpoint)
    systemBlocks[systemBlocks.length - 1].cache_control = { type: 'ephemeral' };
  }

  // Ensure messages alternate user/assistant and start with user
  const sanitized = sanitizeMessages(claudeMessages);

  const body = {
    model: model || 'claude-sonnet-4-20250514',
    max_tokens: 16384,
    temperature,
    cache_control: { type: 'ephemeral' },
    system: systemBlocks,
    messages: sanitized,
  };

  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errText}`);
  }

  const data = await response.json();

  // Extract text from response
  const text = data.content
    ?.filter(b => b.type === 'text')
    .map(b => b.text)
    .join('') || '';

  // Extract usage
  const usage = data.usage || {};
  return {
    text,
    usage: {
      inputTokens: usage.input_tokens || 0,
      outputTokens: usage.output_tokens || 0,
      cachedTokens: usage.cache_read_input_tokens || 0,
      thinkingTokens: 0,
      cacheCreationTokens: usage.cache_creation_input_tokens || 0,
    },
  };
}

function getGeminiArtifactsPath(projectId) {
  const safeProjectId = projectId || '__default__';
  return path.join(ensureProjectDir(safeProjectId), 'gemini-artifacts.json');
}

function loadGeminiArtifacts(projectId) {
  const artifactsPath = getGeminiArtifactsPath(projectId);
  if (!fs.existsSync(artifactsPath)) {
    return { files: {}, caches: {} };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(artifactsPath, 'utf-8'));
    return {
      files: parsed.files || {},
      caches: parsed.caches || {},
    };
  } catch {
    return { files: {}, caches: {} };
  }
}

function saveGeminiArtifacts(projectId, artifacts) {
  const artifactsPath = getGeminiArtifactsPath(projectId);
  fs.writeFileSync(artifactsPath, JSON.stringify(artifacts, null, 2));
}

function getFileBase64(file) {
  const dataUrl = typeof file?.dataUrl === 'string' ? file.dataUrl : '';
  return dataUrl.includes(',') ? dataUrl.split(',')[1] : '';
}

function hashString(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function getGeminiFileKey(file) {
  return hashString(`${normalizeGeminiMimeType(file)}:${getFileBase64(file)}`);
}

function getGeminiCacheKey(model, systemText, files) {
  const orderedFileKeys = (files || []).map(getGeminiFileKey);
  return hashString(JSON.stringify({
    model,
    systemText,
    orderedFileKeys,
  }));
}

function normalizeGeminiMimeType(file) {
  const currentMime = file?.mimeType || '';
  if (currentMime && currentMime !== 'application/octet-stream') return currentMime;

  const extension = (file?.name || '').split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'txt':
    case 'text':
    case 'md':
    case 'py':
    case 'sh':
      return 'text/plain';
    case 'csv':
      return 'text/csv';
    case 'json':
      return 'application/json';
    case 'pdf':
      return 'application/pdf';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'svg':
      return 'image/svg+xml';
    default:
      return currentMime || 'application/octet-stream';
  }
}

function isFutureTimestamp(value) {
  return Boolean(value) && Date.parse(value) > Date.now();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isGeminiSocketCloseError(error) {
  return error?.cause?.code === 'UND_ERR_SOCKET' || error?.code === 'UND_ERR_SOCKET';
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }
  return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

function getGeminiRequestStats(messages, files, bodyString) {
  const uploadedFiles = Array.isArray(files) ? files : [];
  return {
    messageCount: Array.isArray(messages) ? messages.length : 0,
    fileCount: uploadedFiles.length,
    bodyBytes: Buffer.byteLength(bodyString, 'utf8'),
    fileNames: uploadedFiles.map((file) => file.name),
  };
}

async function fetchGeminiJson(url, options, label) {
  const response = await fetch(url, options);
  const raw = await response.text();

  if (!response.ok) {
    throw new Error(`${label} ${response.status}: ${raw}`);
  }

  return raw ? JSON.parse(raw) : {};
}

async function fetchGeminiJsonWithTimeout(url, options, label, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`${label} timed out after ${timeoutMs} ms`)), timeoutMs);

  try {
    return await fetchGeminiJson(
      url,
      {
        ...options,
        signal: controller.signal,
      },
      label
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function uploadGeminiFile(baseUrl, apiKey, file) {
  const mimeType = normalizeGeminiMimeType(file);
  const bytes = Buffer.from(getFileBase64(file), 'base64');
  const startResponse = await fetch(`${baseUrl}/upload/v1beta/files`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes.length),
      'X-Goog-Upload-Header-Content-Type': mimeType,
    },
    body: JSON.stringify({
      file: {
        displayName: file.name || 'upload',
      },
    }),
  });

  const uploadUrl = startResponse.headers.get('x-goog-upload-url');
  const startError = await startResponse.text();
  if (!startResponse.ok || !uploadUrl) {
    throw new Error(`Gemini file upload start failed ${startResponse.status}: ${startError}`);
  }

  const finalizeResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(bytes.length),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: bytes,
  });

  const finalizeRaw = await finalizeResponse.text();
  if (!finalizeResponse.ok) {
    throw new Error(`Gemini file upload finalize failed ${finalizeResponse.status}: ${finalizeRaw}`);
  }

  const parsed = finalizeRaw ? JSON.parse(finalizeRaw) : {};
  return parsed.file || parsed;
}

async function getGeminiFile(baseUrl, apiKey, fileName) {
  return fetchGeminiJson(
    `${baseUrl}/v1beta/${fileName}`,
    { method: 'GET', headers: { 'x-goog-api-key': apiKey } },
    'Gemini file get failed'
  );
}

async function waitForGeminiFileReady(baseUrl, apiKey, uploadedFile) {
  const startedAt = Date.now();
  let current = uploadedFile;

  while (current?.state === 'PROCESSING') {
    if (Date.now() - startedAt > GEMINI_FILE_POLL_TIMEOUT_MS) {
      throw new Error(`Gemini file processing timed out for ${uploadedFile?.name || uploadedFile?.displayName || 'uploaded file'}`);
    }
    await sleep(GEMINI_FILE_POLL_INTERVAL_MS);
    current = await getGeminiFile(baseUrl, apiKey, uploadedFile.name);
  }

  if (current?.state === 'FAILED') {
    throw new Error(`Gemini file processing failed: ${JSON.stringify(current.error || {})}`);
  }

  return current;
}

async function ensureGeminiUploadedFile(baseUrl, apiKey, projectId, file, artifacts) {
  const fileKey = getGeminiFileKey(file);
  const cached = artifacts.files[fileKey];

  if (cached && cached.name && cached.uri && isFutureTimestamp(cached.expirationTime) && cached.apiKeyPrefix === apiKey.slice(0, 8)) {
    return cached;
  }

  const uploaded = await uploadGeminiFile(baseUrl, apiKey, file);
  console.log(`[gemini] file uploaded: name=${uploaded.name} uri=${uploaded.uri} state=${uploaded.state}`);
  const ready = await waitForGeminiFileReady(baseUrl, apiKey, uploaded);
  console.log(`[gemini] file ready: name=${ready.name} uri=${ready.uri} state=${ready.state}`);
  const stored = {
    key: fileKey,
    name: ready.name,
    uri: ready.uri,
    mimeType: ready.mimeType || normalizeGeminiMimeType(file),
    displayName: ready.displayName || file.name,
    expirationTime: ready.expirationTime || null,
    apiKeyPrefix: apiKey.slice(0, 8),
    sizeBytes: ready.sizeBytes || String(file.size || 0),
  };

  artifacts.files[fileKey] = stored;
  saveGeminiArtifacts(projectId, artifacts);
  return stored;
}

async function createGeminiExplicitCache(baseUrl, apiKey, model, systemText, uploadedFiles) {
  const body = {
    model: `models/${model}`,
    contents: [
      {
        role: 'user',
        parts: [
          { text: 'Project source files for this presentation task.' },
          ...uploadedFiles.map((file) => ({
            file_data: {
              mime_type: file.mimeType,
              file_uri: file.uri,
            },
          })),
        ],
      },
    ],
    systemInstruction: {
      parts: [{ text: systemText }],
    },
    ttl: `${GEMINI_CACHE_TTL_SECONDS}s`,
  };

  return fetchGeminiJson(
    `${baseUrl}/v1beta/cachedContents`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    },
    'Gemini cache create failed'
  );
}

async function ensureGeminiFilesAndCache(baseUrl, apiKey, projectId, model, systemText, files) {
  if (!Array.isArray(files) || files.length === 0) return { cache: null, uploadedFiles: [] };

  const artifacts = loadGeminiArtifacts(projectId);
  const cacheKey = getGeminiCacheKey(model, systemText, files);
  const existingCache = artifacts.caches[cacheKey];

  if (existingCache?.name && isFutureTimestamp(existingCache.expireTime) && existingCache.apiKeyPrefix === apiKey.slice(0, 8)) {
    return { cache: existingCache, uploadedFiles: [] };
  }

  // Upload files via File API (works on both native Google and proxies like aihubmix)
  const uploadedFiles = [];
  for (const file of files) {
    uploadedFiles.push(await ensureGeminiUploadedFile(baseUrl, apiKey, projectId, file, artifacts));
  }

  // Try explicit cachedContents (only on native Google — skip on proxies to avoid wasted 404)
  const isNativeGoogle = new URL(baseUrl).hostname === 'generativelanguage.googleapis.com';
  if (isNativeGoogle) {
    try {
      const cache = await createGeminiExplicitCache(baseUrl, apiKey, model, systemText, uploadedFiles);
      const stored = {
        key: cacheKey,
        name: cache.name,
        expireTime: cache.expireTime || new Date(Date.now() + GEMINI_CACHE_TTL_SECONDS * 1000).toISOString(),
        model,
        apiKeyPrefix: apiKey.slice(0, 8),
        fileKeys: files.map(getGeminiFileKey),
      };
      artifacts.caches[cacheKey] = stored;
      saveGeminiArtifacts(projectId, artifacts);
      return { cache: stored, uploadedFiles: [] };
    } catch (err) {
      console.warn(`[gemini] explicit cache creation failed, using fileData references: ${err.message}`);
    }
  }
  return { cache: null, uploadedFiles };
}

async function callGemini(baseUrl, apiKey, model, projectId, systemText, messages, temperature, files) {
  // Native Gemini using the Files API plus explicit cachedContents for stable project files.
  const geminiModel = model || 'gemini-2.5-flash';
  const requestStartedAt = Date.now();
  const { cache: explicitCache, uploadedFiles: fallbackFiles } = await ensureGeminiFilesAndCache(baseUrl, apiKey, projectId, geminiModel, systemText, files || []);

  const contents = [];
  for (const msg of messages) {
    if (msg.role === 'system') continue;
    const parts = [];

    if (msg.files && msg.files.length > 0) {
      for (const f of msg.files) {
        if (f.mimeType.startsWith('image/') || f.mimeType === 'application/pdf') {
          parts.push({
            inline_data: { mime_type: f.mimeType, data: f.data },
          });
        }
      }
    }

    if (msg.content) {
      parts.push({ text: msg.content });
    }

    if (parts.length === 0) continue;
    contents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts,
    });
  }

  const sanitized = [];
  let lastRole = null;
  for (const content of contents) {
    if (content.role === lastRole) {
      sanitized[sanitized.length - 1].parts.push(...content.parts);
      continue;
    }
    sanitized.push(content);
    lastRole = content.role;
  }
  while (sanitized.length > 0 && sanitized[0].role !== 'user') {
    sanitized.shift();
  }

  const body = {
    contents: sanitized,
    generationConfig: {
      temperature,
      maxOutputTokens: 16384,
    },
  };

  if (explicitCache?.name) {
    body.cachedContent = explicitCache.name;
  } else {
    if (systemText) {
      body.system_instruction = { parts: [{ text: systemText }] };
    }
    // Fallback: reference uploaded files via fileData URIs (camelCase for proxy compatibility)
    if (fallbackFiles.length > 0 && sanitized.length > 0) {
      const fileParts = fallbackFiles.map((f) => ({
        fileData: { fileUri: f.uri, mimeType: f.mimeType },
      }));
      sanitized[0].parts = [
        ...fileParts,
        { text: 'Project source files for this presentation task.' },
        ...sanitized[0].parts,
      ];
    }
  }
  const requestBody = JSON.stringify(body);
  const stats = getGeminiRequestStats(messages, files, requestBody);
  console.log(
    `[gemini] request start model=${geminiModel} project=${projectId || 'default'} messages=${stats.messageCount} files=${stats.fileCount} body=${formatBytes(stats.bodyBytes)} cache=${explicitCache?.name || 'none'}`
  );
  if (stats.fileNames.length > 0) {
    console.log(`[gemini] files: ${stats.fileNames.join(', ')}`);
  }

  let data;
  const requestUrl = `${baseUrl}/v1beta/models/${geminiModel}:generateContent`;
  const requestOptions = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: requestBody,
  };

  // Retry loop for socket close errors (common with large inline payloads on proxies)
  let lastError;
  for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = GEMINI_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(`[gemini] retry ${attempt}/${GEMINI_MAX_RETRIES} after ${delay} ms`);
        await sleep(delay);
      }
      data = await fetchGeminiJsonWithTimeout(
        requestUrl,
        requestOptions,
        'Gemini API error',
        GEMINI_GENERATE_TIMEOUT_MS
      );
      if (attempt > 0) {
        console.log(`[gemini] retry ${attempt} succeeded after ${Date.now() - requestStartedAt} ms total`);
      }
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      const elapsed = Date.now() - requestStartedAt;
      console.warn(
        `[gemini] attempt ${attempt + 1} failed after ${elapsed} ms (body=${formatBytes(stats.bodyBytes)} cache=${explicitCache?.name || 'none'})`,
        error.message || error
      );

      const errMsg = String(error?.message || '');
      if (attempt === 0 && explicitCache?.name && (errMsg.includes('CachedContent not found') || errMsg.includes('403'))) {
        // Cache is stale — invalidate and rebuild request body
        console.warn(`[gemini] stale cache detected, invalidating ${explicitCache.name} and re-creating`);
        const artifacts = loadGeminiArtifacts(projectId);
        const cacheKey = getGeminiCacheKey(geminiModel, systemText, files || []);
        delete artifacts.caches[cacheKey];
        artifacts.files = {};
        saveGeminiArtifacts(projectId, artifacts);

        const { cache: newCache, uploadedFiles: retryFiles } = await ensureGeminiFilesAndCache(baseUrl, apiKey, projectId, geminiModel, systemText, files || []);
        delete body.cachedContent;
        delete body.system_instruction;
        if (newCache?.name) {
          body.cachedContent = newCache.name;
        } else {
          if (systemText) {
            body.system_instruction = { parts: [{ text: systemText }] };
          }
          if (retryFiles.length > 0 && sanitized.length > 0) {
            const fileParts = retryFiles.map((f) => ({
              fileData: { fileUri: f.uri, mimeType: f.mimeType },
            }));
            sanitized[0].parts = [
              ...fileParts,
              { text: 'Project source files for this presentation task.' },
              ...sanitized[0].parts,
            ];
            body.contents = sanitized;
          }
        }
        requestOptions.body = JSON.stringify(body);
        // Continue to next retry iteration
      } else if (isGeminiSocketCloseError(error)) {
        // Socket close — continue to next retry iteration
      } else {
        // Non-retryable error — bail out
        throw error;
      }
    }
  }
  if (lastError) {
    throw lastError;
  }

  const text = data.candidates?.[0]?.content?.parts
    ?.filter((part) => part.text)
    .map((part) => part.text)
    .join('') || '';
  const totalElapsed = Date.now() - requestStartedAt;
  console.log(
    `[gemini] request success in ${totalElapsed} ms prompt=${data.usageMetadata?.promptTokenCount || 0} output=${data.usageMetadata?.candidatesTokenCount || 0} cached=${data.usageMetadata?.cachedContentTokenCount || 0}`
  );

  const usageMeta = data.usageMetadata || {};
  return {
    text,
    usage: {
      inputTokens: usageMeta.promptTokenCount || 0,
      outputTokens: usageMeta.candidatesTokenCount || 0,
      cachedTokens: usageMeta.cachedContentTokenCount || 0,
      thinkingTokens: usageMeta.thoughtsTokenCount || 0,
      cacheCreationTokens: 0,
    },
  };
}

function stripSyntheticFilePrelude(messages) {
  const remaining = [...(messages || [])];

  if (remaining[0]?.role === 'user' && Array.isArray(remaining[0].files) && remaining[0].files.length > 0) {
    remaining.shift();
  }
  if (remaining[0]?.role === 'model' && remaining[0].content === FILE_ACK_TEXT) {
    remaining.shift();
  }

  return remaining;
}

function buildOpenAINativeFileMessage(files) {
  if (!Array.isArray(files) || files.length === 0) return null;

  const content = [];

  for (const file of files) {
    const dataUrl = typeof file.dataUrl === 'string' ? file.dataUrl : '';
    const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : '';
    if (!base64Data || !file.mimeType) continue;

    if (file.mimeType.startsWith('image/')) {
      content.push({
        type: 'image_url',
        image_url: { url: `data:${file.mimeType};base64,${base64Data}` },
      });
      continue;
    }

    content.push({
      type: 'file',
      file: {
        filename: file.name || 'upload',
        file_data: `data:${file.mimeType};base64,${base64Data}`,
      },
    });
  }

  if (content.length === 0) return null;

  content.push({ type: 'text', text: FILE_INTRO_TEXT });
  return { role: 'user', content };
}

function buildOpenAIPromptCacheKey(projectId, model) {
  const safeProjectId = projectId || 'default-project';
  const safeModel = model || 'default-model';
  return `openslides:${safeProjectId}:${safeModel}`;
}

async function callOpenAINative(baseUrl, apiKey, model, projectId, systemText, messages, temperature, files) {
  // Native OpenAI Chat Completions with file-aware content items.
  const oaiMessages = [];

  if (systemText) {
    oaiMessages.push({ role: 'system', content: systemText });
  }

  const nativeFileMessage = buildOpenAINativeFileMessage(files);
  if (nativeFileMessage) {
    oaiMessages.push(nativeFileMessage);
  }

  for (const msg of stripSyntheticFilePrelude(messages)) {
    if (msg.role === 'system') continue;
    oaiMessages.push({
      role: msg.role === 'model' ? 'assistant' : msg.role,
      content: msg.content,
    });
  }

  const body = {
    model: model || 'gpt-4o',
    messages: oaiMessages,
    temperature,
    max_tokens: 16384,
    prompt_cache_key: buildOpenAIPromptCacheKey(projectId, model || 'gpt-4o'),
  };

  const url = baseUrl.replace(/\/+$/, '');
  const response = await fetch(`${url}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  const usage = data.usage || {};

  return {
    text,
    usage: {
      inputTokens: usage.prompt_tokens || 0,
      outputTokens: usage.completion_tokens || 0,
      cachedTokens: usage.prompt_tokens_details?.cached_tokens || usage.cached_tokens || 0,
      thinkingTokens: usage.completion_tokens_details?.reasoning_tokens || 0,
      cacheCreationTokens: 0,
    },
  };
}

async function callOpenAICompatible(baseUrl, apiKey, model, systemText, messages, temperature, files) {
  // OpenAI-compatible format (GPT, proxies like aihubmix, etc.)
  const oaiMessages = [];

  if (systemText) {
    oaiMessages.push({ role: 'system', content: systemText });
  }

  for (const msg of messages) {
    if (msg.role === 'system') continue;

    const role = msg.role === 'model' ? 'assistant' : msg.role;

    // Handle file attachments (images as vision content)
    if (msg.files && msg.files.length > 0) {
      const content = [];
      for (const f of msg.files) {
        if (f.mimeType.startsWith('image/')) {
          content.push({
            type: 'image_url',
            image_url: { url: `data:${f.mimeType};base64,${f.data}` },
          });
        }
      }
      content.push({ type: 'text', text: msg.content });
      oaiMessages.push({ role, content });
    } else {
      oaiMessages.push({ role, content: msg.content });
    }
  }

  const body = {
    model: model || 'gpt-4o',
    messages: oaiMessages,
    temperature,
    max_tokens: 16384,
  };

  // Base URL should include any path prefix (e.g. /v1 for OpenAI, /v1beta/openai for Gemini)
  const url = baseUrl.replace(/\/+$/, '');
  const response = await fetch(`${url}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  const usageCompat = data.usage || {};

  return {
    text,
    usage: {
      inputTokens: usageCompat.prompt_tokens || 0,
      outputTokens: usageCompat.completion_tokens || 0,
      cachedTokens: usageCompat.prompt_tokens_details?.cached_tokens || usageCompat.cached_tokens || 0,
      thinkingTokens: usageCompat.completion_tokens_details?.reasoning_tokens || 0,
      cacheCreationTokens: 0,
    },
  };
}

function sanitizeMessages(messages) {
  // Ensure messages alternate roles and start with user
  const result = [];
  let lastRole = null;
  for (const msg of messages) {
    if (msg.role === lastRole) {
      const previous = result[result.length - 1];
      if (Array.isArray(previous.content) && Array.isArray(msg.content)) {
        previous.content.push(...msg.content);
      } else if (typeof previous.content === 'string' && typeof msg.content === 'string') {
        previous.content += `\n\n${msg.content}`;
      } else if (Array.isArray(previous.content) && typeof msg.content === 'string') {
        previous.content.push({ type: 'text', text: msg.content });
      } else if (typeof previous.content === 'string' && Array.isArray(msg.content)) {
        previous.content = [{ type: 'text', text: previous.content }, ...msg.content];
      }
      continue;
    }
    result.push(msg);
    lastRole = msg.role;
  }
  // Ensure starts with user
  while (result.length > 0 && result[0].role !== 'user') {
    result.shift();
  }
  return result;
}

// ============================================================
// Project Storage API
// ============================================================

function getProjectDir(projectId) {
  return path.join(PROJECTS_DIR, projectId);
}

function ensureProjectDir(projectId) {
  const dir = getProjectDir(projectId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const statesDir = path.join(dir, 'states');
  if (!fs.existsSync(statesDir)) fs.mkdirSync(statesDir, { recursive: true });
  return dir;
}

// List all projects
app.get('/api/projects', (req, res) => {
  const metaPath = path.join(PROJECTS_DIR, '_projects.json');
  if (!fs.existsSync(metaPath)) return res.json([]);
  const projects = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  projects.sort((a, b) => new Date(b.last_accessed_at || b.created_at) - new Date(a.last_accessed_at || a.created_at));
  res.json(projects);
});

// Create project
app.post('/api/projects', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Project name is required' });
  }
  const trimmedName = name.trim();
  const metaPath = path.join(PROJECTS_DIR, '_projects.json');
  const projects = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf-8')) : [];

  if (projects.some(p => p.name === trimmedName)) {
    return res.status(409).json({ error: 'A project with this name already exists' });
  }

  const project = {
    id: trimmedName,
    name: trimmedName,
    created_at: new Date().toISOString(),
    last_accessed_at: new Date().toISOString(),
  };
  projects.push(project);
  fs.writeFileSync(metaPath, JSON.stringify(projects, null, 2));
  ensureProjectDir(trimmedName);
  res.json(project);
});

// Update project access time
app.patch('/api/projects/:id', (req, res) => {
  const metaPath = path.join(PROJECTS_DIR, '_projects.json');
  if (!fs.existsSync(metaPath)) return res.status(404).json({ error: 'Not found' });
  const projects = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  const idx = projects.findIndex(p => p.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Not found' });
  projects[idx] = { ...projects[idx], ...req.body, id: req.params.id };
  fs.writeFileSync(metaPath, JSON.stringify(projects, null, 2));
  res.json(projects[idx]);
});

// Delete project
app.delete('/api/projects/:id', (req, res) => {
  const metaPath = path.join(PROJECTS_DIR, '_projects.json');
  if (fs.existsSync(metaPath)) {
    const projects = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const remaining = projects.filter(p => p.id !== req.params.id);
    fs.writeFileSync(metaPath, JSON.stringify(remaining, null, 2));
  }
  const dir = getProjectDir(req.params.id);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  res.json({ success: true });
});

// Slide info
app.get('/api/projects/:id/info', (req, res) => {
  const infoPath = path.join(getProjectDir(req.params.id), 'info.json');
  if (!fs.existsSync(infoPath)) return res.json(null);
  res.json(JSON.parse(fs.readFileSync(infoPath, 'utf-8')));
});

app.put('/api/projects/:id/info', (req, res) => {
  ensureProjectDir(req.params.id);
  const infoPath = path.join(getProjectDir(req.params.id), 'info.json');
  fs.writeFileSync(infoPath, JSON.stringify(req.body, null, 2));
  res.json({ success: true });
});

// States
app.post('/api/projects/:id/states', (req, res) => {
  const { stateId, html, chat, context } = req.body;
  ensureProjectDir(req.params.id);
  const statePath = path.join(getProjectDir(req.params.id), 'states', `${stateId}.json`);
  fs.writeFileSync(statePath, JSON.stringify({ html, chat, context: context || null }, null, 2));
  res.json({ path: statePath });
});

app.get('/api/projects/:id/states/:stateId', (req, res) => {
  const statePath = path.join(getProjectDir(req.params.id), 'states', `${req.params.stateId}.json`);
  if (!fs.existsSync(statePath)) return res.status(404).json({ error: 'State not found' });
  res.json(JSON.parse(fs.readFileSync(statePath, 'utf-8')));
});

app.delete('/api/projects/:id/states/:stateId', (req, res) => {
  const statePath = path.join(getProjectDir(req.params.id), 'states', `${req.params.stateId}.json`);
  if (fs.existsSync(statePath)) fs.unlinkSync(statePath);
  res.json({ success: true });
});

// Files
app.get('/api/projects/:id/files', (req, res) => {
  const filesPath = path.join(getProjectDir(req.params.id), 'files.json');
  if (!fs.existsSync(filesPath)) return res.json([]);
  res.json(JSON.parse(fs.readFileSync(filesPath, 'utf-8')));
});

app.put('/api/projects/:id/files', (req, res) => {
  ensureProjectDir(req.params.id);
  const filesPath = path.join(getProjectDir(req.params.id), 'files.json');
  fs.writeFileSync(filesPath, JSON.stringify(req.body, null, 2));
  res.json({ success: true });
});

// Serve individual file by name (images/PDFs for use in slides)
app.get('/api/projects/:id/file/:filename', (req, res) => {
  const filesPath = path.join(getProjectDir(req.params.id), 'files.json');
  if (!fs.existsSync(filesPath)) return res.status(404).json({ error: 'Not found' });

  const files = JSON.parse(fs.readFileSync(filesPath, 'utf-8'));
  const file = files.find(f => f.name === req.params.filename);
  if (!file) return res.status(404).json({ error: 'File not found' });

  // dataUrl format: "data:<mimeType>;base64,<data>"
  const match = file.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return res.status(500).json({ error: 'Invalid file data' });

  const mimeType = match[1];
  const buffer = Buffer.from(match[2], 'base64');

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(buffer);
});

// ============================================================
// Settings (persisted to settings.json)
// ============================================================

const SETTINGS_PATH = path.join(__dirname, 'settings.json');
const PRICING_PATH = path.join(__dirname, 'pricing.json');

app.get('/api/settings', (req, res) => {
  if (!fs.existsSync(SETTINGS_PATH)) return res.json({});
  res.json(JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')));
});

app.put('/api/settings', (req, res) => {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(req.body, null, 2));
  res.json({ success: true });
});

// Pricing
app.get('/api/pricing', (req, res) => {
  if (!fs.existsSync(PRICING_PATH)) return res.json({ models: {}, custom: {} });
  res.json(JSON.parse(fs.readFileSync(PRICING_PATH, 'utf-8')));
});

app.put('/api/pricing/custom', (req, res) => {
  const { model, input, cached, output } = req.body;
  if (!model) return res.status(400).json({ error: 'Model name is required' });
  const pricing = fs.existsSync(PRICING_PATH)
    ? JSON.parse(fs.readFileSync(PRICING_PATH, 'utf-8'))
    : { models: {}, custom: {} };
  if (!pricing.custom) pricing.custom = {};
  pricing.custom[model] = { input: Number(input), cached: Number(cached), output: Number(output) };
  fs.writeFileSync(PRICING_PATH, JSON.stringify(pricing, null, 2));
  res.json({ success: true });
});

// ============================================================
// Static file serving (production)
// ============================================================

const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('/{*path}', (req, res) => {
    if (!req.path.startsWith('/api/')) {
      res.sendFile(path.join(distPath, 'index.html'));
    }
  });
}

app.listen(PORT, () => {
  console.log(`OpenSlides server running on http://localhost:${PORT}`);
});
