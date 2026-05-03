const APP_HOST = process.env.HOST || '127.0.0.1';
const APP_PORT = process.env.PORT || '1994';
const BASE_URL = process.env.AI_GATEWAY_BASE_URL || `http://${APP_HOST}:${APP_PORT}`;

const AUTH_HEADER = process.env.AI_GATEWAY_BASIC_AUTH || '';

function logStep(message, extra) {
  if (typeof extra === 'undefined') {
    console.log(`[seed] ${message}`);
    return;
  }
  console.log(`[seed] ${message}`, extra);
}

const MODELS_CONFIG = [

  { id: 'MiniMax-M2.7-highspeed', name: 'MiniMax-M2.7-highspeed', url: 'https://api.zaixianshauti.top/v1', apiKey: 'sk-YOy99Mw8fmEM585PriPd6VNkP5Vp5ybUeS4mdKA4Xe7jYZF9', maxInputTokens: 262144, maxOutputTokens: 65536 },
  { id: 'K2.6', name: 'K2.6 (hiapi)', url: 'https://hiapi.work/v1', apiKey: 'sk-JevCamIEljvYJdV5mDuWOP4K3VKPx8FY2aSz5ER6PH24g4pE', maxInputTokens: 262144, maxOutputTokens: 65536 },
  { id: 'gpt-5.5', name: 'gpt-5.5', url: 'http://new.xem8k5.top:3000/v1', apiKey: 'sk-LQnuh6GNzQab05ynSWzypmZU9NI4CjjXEehWRVxcni7y0vI8', maxInputTokens: 258000, maxOutputTokens: 65536 },
  { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5 (hhhl-free)', url: 'https://ai.hhhl.cc/v1', apiKey: 'sk-1H9Z8EGLCRWHszyHa3bo5jJj5oxNNVKQ', maxInputTokens: 200000, maxOutputTokens: 65536 },
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6 (hhhl-free)', url: 'https://ai.hhhl.cc/v1', apiKey: 'sk-1H9Z8EGLCRWHszyHa3bo5jJj5oxNNVKQ', maxInputTokens: 200000, maxOutputTokens: 65536 },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5 (hhhl-free)', url: 'https://ai.hhhl.cc/v1', apiKey: 'sk-1H9Z8EGLCRWHszyHa3bo5jJj5oxNNVKQ', maxInputTokens: 200000, maxOutputTokens: 65536 },
  { id: 'gpt-5.4-hhhl', name: 'GPT-5.4 (hhhl-free)', url: 'https://ai.hhhl.cc/v1', apiKey: 'sk-1H9Z8EGLCRWHszyHa3bo5jJj5oxNNVKQ', maxInputTokens: 400000, maxOutputTokens: 65536 },
  { id: 'gpt-5.3-codex-hhhl', name: 'GPT-5.3 Codex (hhhl-free)', url: 'https://ai.hhhl.cc/v1', apiKey: 'sk-1H9Z8EGLCRWHszyHa3bo5jJj5oxNNVKQ', maxInputTokens: 400000, maxOutputTokens: 65536 },
  { id: 'gpt-5.4-mini-otokapi', name: 'GPT-5.4 Mini (otokapi)', url: 'https://otokapi.com/v1', apiKey: 'sk-41c3366ce2d38d745ab4417319ddc36d70cec5d8e25f9d8e5b8416e6b0aec5ee', maxInputTokens: 400000, maxOutputTokens: 65536 },
  { id: 'gpt-5.3-codex-otokapi', name: 'GPT-5.3 Codex (otokapi)', url: 'https://otokapi.com/v1', apiKey: 'sk-41c3366ce2d38d745ab4417319ddc36d70cec5d8e25f9d8e5b8416e6b0aec5ee', maxInputTokens: 400000, maxOutputTokens: 65536 },
  { id: 'gpt-5.2-otokapi', name: 'GPT-5.2 (otokapi)', url: 'https://otokapi.com/v1', apiKey: 'sk-41c3366ce2d38d745ab4417319ddc36d70cec5d8e25f9d8e5b8416e6b0aec5ee', maxInputTokens: 400000, maxOutputTokens: 65536 },

  // WorkBuddy 自定义模型
  { id: 'gpt-5.4', name: 'GPT-5.4 (WorkBuddy)', url: 'https://hiapi.work/v1', apiKey: 'sk-JevCamIEljvYJdV5mDuWOP4K3VKPx8FY2aSz5ER6PH24g4pE', maxInputTokens: 400000, maxOutputTokens: 65536 },
  { id: 'minimax-2.7-preview', name: 'MiniMax 2.7 极速版 (WorkBuddy)', url: 'https://hiapi.work/v1', apiKey: 'sk-JevCamIEljvYJdV5mDuWOP4K3VKPx8FY2aSz5ER6PH24g4pE', maxInputTokens: 262144, maxOutputTokens: 65536 },

  // CC Switch 常用全量模型地址
  { id: 'gpt-5.4-ccswitch', name: 'GPT-5.4 (CC Switch)', url: 'https://api.zaixianshauti.top/v1', apiKey: 'sk-YOy99Mw8fmEM585PriPd6VNkP5Vp5ybUeS4mdKA4Xe7jYZF9', maxInputTokens: 400000, maxOutputTokens: 65536 },
  { id: 'gpt-5.3-codex-ccswitch', name: 'GPT-5.3 Codex (CC Switch)', url: 'https://api.zaixianshauti.top/v1', apiKey: 'sk-YOy99Mw8fmEM585PriPd6VNkP5Vp5ybUeS4mdKA4Xe7jYZF9', maxInputTokens: 400000, maxOutputTokens: 65536 },
  { id: 'claude-sonnet-4-5-ccswitch', name: 'Claude Sonnet 4.5 (CC Switch)', url: 'https://api.zaixianshauti.top/v1', apiKey: 'sk-YOy99Mw8fmEM585PriPd6VNkP5Vp5ybUeS4mdKA4Xe7jYZF9', maxInputTokens: 200000, maxOutputTokens: 65536 },
  { id: 'claude-opus-4-6-ccswitch', name: 'Claude Opus 4.6 (CC Switch)', url: 'https://api.zaixianshauti.top/v1', apiKey: 'sk-YOy99Mw8fmEM585PriPd6VNkP5Vp5ybUeS4mdKA4Xe7jYZF9', maxInputTokens: 200000, maxOutputTokens: 65536 },
  { id: 'gemini-2.5-pro-ccswitch', name: 'Gemini 2.5 Pro (CC Switch)', url: 'https://api.zaixianshauti.top/v1', apiKey: 'sk-YOy99Mw8fmEM585PriPd6VNkP5Vp5ybUeS4mdKA4Xe7jYZF9', maxInputTokens: 1048576, maxOutputTokens: 65536 },
  { id: 'gemini-2.5-flash-ccswitch', name: 'Gemini 2.5 Flash (CC Switch)', url: 'https://api.zaixianshauti.top/v1', apiKey: 'sk-YOy99Mw8fmEM585PriPd6VNkP5Vp5ybUeS4mdKA4Xe7jYZF9', maxInputTokens: 1048576, maxOutputTokens: 65536 },
  { id: 'deepseek-r1-ccswitch', name: 'DeepSeek R1 (CC Switch)', url: 'https://api.zaixianshauti.top/v1', apiKey: 'sk-YOy99Mw8fmEM585PriPd6VNkP5Vp5ybUeS4mdKA4Xe7jYZF9', maxInputTokens: 131072, maxOutputTokens: 65536 },
  { id: 'deepseek-v3-ccswitch', name: 'DeepSeek V3 (CC Switch)', url: 'https://api.zaixianshauti.top/v1', apiKey: 'sk-YOy99Mw8fmEM585PriPd6VNkP5Vp5ybUeS4mdKA4Xe7jYZF9', maxInputTokens: 131072, maxOutputTokens: 65536 },
  { id: 'qwen-max-ccswitch', name: 'Qwen Max (CC Switch)', url: 'https://api.zaixianshauti.top/v1', apiKey: 'sk-YOy99Mw8fmEM585PriPd6VNkP5Vp5ybUeS4mdKA4Xe7jYZF9', maxInputTokens: 131072, maxOutputTokens: 65536 },
  { id: 'kimi-k2-ccswitch', name: 'Kimi K2 (CC Switch)', url: 'https://api.zaixianshauti.top/v1', apiKey: 'sk-YOy99Mw8fmEM585PriPd6VNkP5Vp5ybUeS4mdKA4Xe7jYZF9', maxInputTokens: 131072, maxOutputTokens: 65536 },
];

async function apiRequest(path, options = {}) {
  const method = options.method || 'GET';
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (AUTH_HEADER) headers.Authorization = AUTH_HEADER;
  logStep(`${method} ${path}`, AUTH_HEADER ? 'with auth header' : 'without auth header');
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    logStep(`${method} ${path} failed`, { status: res.status, data });
  }
  return { ok: res.ok, status: res.status, data };
}


function groupByUrl(models) {
  const groups = {};
  for (const m of models) {
    if (!groups[m.url]) groups[m.url] = { url: m.url, apiKey: m.apiKey, models: [] };
    groups[m.url].models.push(m);
  }
  return Object.values(groups);
}

async function ensurePlatform(group) {
  const name = new URL(group.url).hostname;
  const existing = await apiRequest('/api/platforms');
  if (existing.ok && Array.isArray(existing.data)) {
    const found = existing.data.find(p => p.base_url === group.url);
    if (found) return found.id;
  }
  const res = await apiRequest('/api/platforms', {
    method: 'POST',
    body: JSON.stringify({ name, type: 'OpenAI', base_url: group.url, api_key: group.apiKey, status: 'Active' }),
  });
  if (res.ok && res.data?.id) return res.data.id;
  throw new Error(`ensurePlatform failed for ${name}: ${JSON.stringify(res.data)}`);
}

async function ensureModel(platformId, model) {
  const existing = await apiRequest('/api/models');
  if (existing.ok && Array.isArray(existing.data)) {
    const found = existing.data.find(m => m.platform_id === platformId && m.model_id === model.id);
    if (found) return found.id;
  }
  const res = await apiRequest('/api/models', {
    method: 'POST',
    body: JSON.stringify({
      platform_id: platformId,
      model_id: model.id,
      display_name: model.name,
      max_tokens: model.maxOutputTokens || 65536,
      context_window: model.maxInputTokens || 200000,
      capabilities: ['Tool', 'Vision', 'Reasoning'],
      status: 'Active',
    }),
  });
  if (res.ok && res.data?.id) return res.data.id;
  throw new Error(`ensureModel failed for ${model.id}: ${JSON.stringify(res.data)}`);
}

async function ensureProxy(model) {
  const existing = await apiRequest('/api/proxies');
  if (existing.ok && Array.isArray(existing.data)) {
    const found = existing.data.find(p => p.name === model.id);
    if (found) return found.id;
  }
  const res = await apiRequest('/api/proxies', {
    method: 'POST',
    body: JSON.stringify({ name: model.id, display_name: model.name, description: `Proxy for ${model.name}`, status: 'Active' }),
  });
  if (res.ok && res.data?.id) return res.data.id;
  throw new Error(`ensureProxy failed for ${model.id}: ${JSON.stringify(res.data)}`);
}

async function ensureRoute(proxyId, platformId, model) {
  const existing = await apiRequest(`/api/proxies/${proxyId}/routes`);
  if (existing.ok && Array.isArray(existing.data) && existing.data.length > 0) {
    const route = existing.data[0];
    const backends = await apiRequest(`/api/routes/${route.id}/backends`);
    if (backends.ok && Array.isArray(backends.data)) {
      const matched = backends.data.find(b => b.platform_id === platformId && b.model_id === model.id);
      if (matched) return true;
      for (const backend of backends.data) {
        await apiRequest(`/api/backends/${backend.id}`, { method: 'DELETE' });
      }
      const addBackendRes = await apiRequest(`/api/routes/${route.id}/backends`, {
        method: 'POST',
        body: JSON.stringify({
          platform_id: platformId,
          model_id: model.id,
          weight: 1,
          priority: 0,
          capabilities: ['Tool', 'Vision', 'Reasoning'],
        }),
      });
      if (addBackendRes.ok) return true;
      throw new Error(`ensureRoute backend repair failed for ${model.id}: ${JSON.stringify(addBackendRes.data)}`);
    }
  }
  const res = await apiRequest(`/api/proxies/${proxyId}/routes`, {
    method: 'POST',
    body: JSON.stringify({
      lb_strategy: 'RoundRobin',
      retry_policy: { max_retries: 2, retry_on_error: ['RateLimit', 'ServerError', 'Timeout'], backoff_ms: 500 },
      backends: [{ platform_id: platformId, model_id: model.id, weight: 1, priority: 0, capabilities: ['Tool', 'Vision', 'Reasoning'] }],
    }),
  });
  if (res.ok) return true;
  throw new Error(`ensureRoute failed for ${model.id}: ${JSON.stringify(res.data)}`);
}



async function main() {
  logStep('seed starting', { baseUrl: BASE_URL, authConfigured: Boolean(AUTH_HEADER), groups: groupByUrl(MODELS_CONFIG).length, models: MODELS_CONFIG.length });
  const groups = groupByUrl(MODELS_CONFIG);
  for (const group of groups) {
    logStep('processing platform group', { url: group.url, modelCount: group.models.length });
    const platformId = await ensurePlatform(group);
    for (const model of group.models) {
      logStep('processing model', { modelId: model.id, platformId });
      await ensureModel(platformId, model);
      const proxyId = await ensureProxy(model);
      await ensureRoute(proxyId, platformId, model);
    }
  }

  const stats = await apiRequest('/api/stats/overview');
  if (stats.ok) {
    logStep('seed complete with stats', stats.data);
  } else {
    logStep('seed complete but stats fetch failed', { status: stats.status, data: stats.data });
  }
}

main().catch(err => {
  console.error('[seed] fatal error', err && err.stack ? err.stack : (err.message || err));
  process.exit(1);
});

