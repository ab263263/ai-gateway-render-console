const APP_HOST = process.env.HOST || '127.0.0.1';
const APP_PORT = process.env.PORT || '1994';
const BASE_URL = process.env.AI_GATEWAY_BASE_URL || `http://${APP_HOST}:${APP_PORT}`;

function buildAuthHeader() {
  if (process.env.AI_GATEWAY_BASIC_AUTH) {
    return process.env.AI_GATEWAY_BASIC_AUTH;
  }

  const username = process.env.ADMIN_USERNAME || '';
  const password = process.env.ADMIN_PASSWORD || '';
  if (username && password) {
    return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }

  return '';
}

const AUTH_HEADER = buildAuthHeader();

function logStep(message, extra) {
  if (typeof extra === 'undefined') {
    console.log(`[seed] ${message}`);
    return;
  }
  console.log(`[seed] ${message}`, extra);
}

const MODELS_CONFIG = [
  // ═══════════════════════════════════════════════════
  // api.zaixianshauti.top (CC Switch / zaixianshauti)
  // ═══════════════════════════════════════════════════
  { id: 'MiniMax-M2.7-highspeed', name: 'MiniMax-M2.7-highspeed', url: 'https://api.zaixianshauti.top/v1', apiKey: 'sk-YOy99Mw8fmEM585PriPd6VNkP5Vp5ybUeS4mdKA4Xe7jYZF9', maxInputTokens: 262144, maxOutputTokens: 65536 },
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

  // ═══════════════════════════════════════════════════
  // hiapi.work
  // ═══════════════════════════════════════════════════
  { id: 'K2.6', name: 'K2.6 (hiapi)', url: 'https://hiapi.work/v1', apiKey: 'sk-JevCamIEljvYJdV5mDuWOP4K3VKPx8FY2aSz5ER6PH24g4pE', maxInputTokens: 262144, maxOutputTokens: 65536 },
  { id: 'gpt-5.4', name: 'GPT-5.4 (WorkBuddy)', url: 'https://hiapi.work/v1', apiKey: 'sk-JevCamIEljvYJdV5mDuWOP4K3VKPx8FY2aSz5ER6PH24g4pE', maxInputTokens: 400000, maxOutputTokens: 65536 },
  { id: 'minimax-2.7-preview', name: 'MiniMax 2.7 极速版 (WorkBuddy)', url: 'https://hiapi.work/v1', apiKey: 'sk-JevCamIEljvYJdV5mDuWOP4K3VKPx8FY2aSz5ER6PH24g4pE', maxInputTokens: 262144, maxOutputTokens: 65536 },

  // ═══════════════════════════════════════════════════
  // ai.hhhl.cc
  // ═══════════════════════════════════════════════════
  { id: 'claude-haiku-4-5-hhhl', name: 'Claude Haiku 4.5 (hhhl-free)', url: 'https://ai.hhhl.cc/v1', apiKey: 'sk-GCh25QYiVZbn2rCIVQadueLHGZnkFnU4', maxInputTokens: 200000, maxOutputTokens: 65536 },
  { id: 'claude-sonnet-4-5-hhhl', name: 'Claude Sonnet 4.5 (hhhl-free)', url: 'https://ai.hhhl.cc/v1', apiKey: 'sk-GCh25QYiVZbn2rCIVQadueLHGZnkFnU4', modelId: 'claude-sonnet-4-5-20250929', maxInputTokens: 200000, maxOutputTokens: 65536 },
  { id: 'claude-opus-4-6-hhhl', name: 'Claude Opus 4.6 (hhhl-free)', url: 'https://ai.hhhl.cc/v1', apiKey: 'sk-GCh25QYiVZbn2rCIVQadueLHGZnkFnU4', maxInputTokens: 200000, maxOutputTokens: 65536 },
  { id: 'gpt-5.4-hhhl', name: 'GPT-5.4 (hhhl-free)', url: 'https://ai.hhhl.cc/v1', apiKey: 'sk-GCh25QYiVZbn2rCIVQadueLHGZnkFnU4', maxInputTokens: 400000, maxOutputTokens: 65536 },
  { id: 'gpt-5.3-codex-hhhl', name: 'GPT-5.3 Codex (hhhl-free)', url: 'https://ai.hhhl.cc/v1', apiKey: 'sk-GCh25QYiVZbn2rCIVQadueLHGZnkFnU4', maxInputTokens: 400000, maxOutputTokens: 65536 },

  // ═══════════════════════════════════════════════════
  // otokapi.com
  // ═══════════════════════════════════════════════════
  { id: 'claude-haiku-4-5-otokapi', name: 'Claude Haiku 4.5 (otokapi)', url: 'https://otokapi.com/v1', apiKey: 'sk-41c3366ce2d38d745ab4417319ddc36d70cec5d8e25f9d8e5b8416e6b0aec5ee', modelId: 'claude-haiku-4-5-20251001', maxInputTokens: 200000, maxOutputTokens: 65536 },
  { id: 'claude-opus-4-6-otokapi', name: 'Claude Opus 4.6 (otokapi)', url: 'https://otokapi.com/v1', apiKey: 'sk-41c3366ce2d38d745ab4417319ddc36d70cec5d8e25f9d8e5b8416e6b0aec5ee', maxInputTokens: 200000, maxOutputTokens: 65536 },
  { id: 'claude-opus-4-7-otokapi', name: 'Claude Opus 4.7 (otokapi)', url: 'https://otokapi.com/v1', apiKey: 'sk-41c3366ce2d38d745ab4417319ddc36d70cec5d8e25f9d8e5b8416e6b0aec5ee', maxInputTokens: 200000, maxOutputTokens: 65536 },
  { id: 'claude-sonnet-4-5-otokapi', name: 'Claude Sonnet 4.5 (otokapi)', url: 'https://otokapi.com/v1', apiKey: 'sk-41c3366ce2d38d745ab4417319ddc36d70cec5d8e25f9d8e5b8416e6b0aec5ee', modelId: 'claude-sonnet-4-5-20250929', maxInputTokens: 200000, maxOutputTokens: 65536 },
  { id: 'claude-sonnet-4-6-otokapi', name: 'Claude Sonnet 4.6 (otokapi)', url: 'https://otokapi.com/v1', apiKey: 'sk-41c3366ce2d38d745ab4417319ddc36d70cec5d8e25f9d8e5b8416e6b0aec5ee', maxInputTokens: 200000, maxOutputTokens: 65536 },
  { id: 'gpt-5.2-otokapi', name: 'GPT-5.2 (otokapi)', url: 'https://otokapi.com/v1', apiKey: 'sk-41c3366ce2d38d745ab4417319ddc36d70cec5d8e25f9d8e5b8416e6b0aec5ee', modelId: 'gpt-5.2-otokapi', maxInputTokens: 400000, maxOutputTokens: 65536 },
  { id: 'gpt-5.3-codex-otokapi', name: 'GPT-5.3 Codex (otokapi)', url: 'https://otokapi.com/v1', apiKey: 'sk-41c3366ce2d38d745ab4417319ddc36d70cec5d8e25f9d8e5b8416e6b0aec5ee', modelId: 'gpt-5.3-codex-otokapi', maxInputTokens: 400000, maxOutputTokens: 65536 },
  { id: 'gpt-5.4-mini-otokapi', name: 'GPT-5.4 Mini (otokapi)', url: 'https://otokapi.com/v1', apiKey: 'sk-41c3366ce2d38d745ab4417319ddc36d70cec5d8e25f9d8e5b8416e6b0aec5ee', modelId: 'gpt-5.4-mini-otokapi', maxInputTokens: 400000, maxOutputTokens: 65536 },

  // ═══════════════════════════════════════════════════
  // chatfire (api.chatfire.cn)
  // ═══════════════════════════════════════════════════
  { id: 'deepseek-v4-pro-chatfire', name: 'DeepSeek V4 Pro (chatfire)', url: 'https://api.chatfire.cn/v1', apiKey: 'sk-bdnTaGV5ADS385WpDApRNmQpNs8hhVRbIj1FRZM5IG8ckH7e', modelId: 'deepseek-v4-pro', maxInputTokens: 262144, maxOutputTokens: 65536 },
  { id: 'glm-5.1-chatfire', name: 'GLM-5.1 (chatfire)', url: 'https://api.chatfire.cn/v1', apiKey: 'sk-bdnTaGV5ADS385WpDApRNmQpNs8hhVRbIj1FRZM5IG8ckH7e', modelId: 'glm-5.1', maxInputTokens: 262144, maxOutputTokens: 65536 },
  { id: 'gpt-5.4-chatfire', name: 'GPT-5.4 (chatfire)', url: 'https://api.chatfire.cn/v1', apiKey: 'sk-bdnTaGV5ADS385WpDApRNmQpNs8hhVRbIj1FRZM5IG8ckH7e', modelId: 'gpt-5.4', maxInputTokens: 262144, maxOutputTokens: 65536 },
  { id: 'gpt-5.5-chatfire', name: 'GPT-5.5 (chatfire)', url: 'https://api.chatfire.cn/v1', apiKey: 'sk-bdnTaGV5ADS385WpDApRNmQpNs8hhVRbIj1FRZM5IG8ckH7e', modelId: 'gpt-5.5', maxInputTokens: 262144, maxOutputTokens: 65536 },

  // ═══════════════════════════════════════════════════
  // maynor (apipro.maynor1024.live)
  // ═══════════════════════════════════════════════════
  { id: 'claude-opus-4-7-maynor', name: 'Claude Opus 4.7 (maynor)', url: 'https://apipro.maynor1024.live/v1', apiKey: 'sk-HHy0tayaxe4XjiD0exeMORsNG1g3xiGBigcCkHGFLrOK2ZpE', modelId: 'claude-opus-4-7', maxInputTokens: 200000, maxOutputTokens: 65536 },
  { id: 'glm-5.1-maynor', name: 'GLM-5.1 (maynor)', url: 'https://apipro.maynor1024.live/v1', apiKey: 'sk-HHy0tayaxe4XjiD0exeMORsNG1g3xiGBigcCkHGFLrOK2ZpE', modelId: 'glm-5.1', maxInputTokens: 262144, maxOutputTokens: 65536 },
  { id: 'gpt-5.4-maynor', name: 'GPT-5.4 (maynor)', url: 'https://apipro.maynor1024.live/v1', apiKey: 'sk-HHy0tayaxe4XjiD0exeMORsNG1g3xiGBigcCkHGFLrOK2ZpE', modelId: 'gpt-5.4', maxInputTokens: 262144, maxOutputTokens: 65536 },
  { id: 'gpt-5.5-maynor', name: 'GPT-5.5 (maynor)', url: 'https://apipro.maynor1024.live/v1', apiKey: 'sk-HHy0tayaxe4XjiD0exeMORsNG1g3xiGBigcCkHGFLrOK2ZpE', modelId: 'gpt-5.5-2026-04-24', maxInputTokens: 262144, maxOutputTokens: 65536 },

  // ═══════════════════════════════════════════════════
  // yunwu (yunwu.ai)
  // ═══════════════════════════════════════════════════
  { id: 'claude-opus-4-7-yunwu', name: 'Claude Opus 4.7 (yunwu)', url: 'https://yunwu.ai/v1', apiKey: 'sk-Xq5czUpkNRTmSvjKhQKDqOeE5b6DPTDOvjBtFVCjuC5HupOL', modelId: 'claude-opus-4-7', maxInputTokens: 200000, maxOutputTokens: 65536 },
  { id: 'deepseek-v4-pro-yunwu', name: 'DeepSeek V4 Pro (yunwu)', url: 'https://yunwu.ai/v1', apiKey: 'sk-Xq5czUpkNRTmSvjKhQKDqOeE5b6DPTDOvjBtFVCjuC5HupOL', modelId: 'deepseek-v4-pro', maxInputTokens: 262144, maxOutputTokens: 65536 },
  { id: 'glm-5.1-yunwu', name: 'GLM-5.1 (yunwu)', url: 'https://yunwu.ai/v1', apiKey: 'sk-Xq5czUpkNRTmSvjKhQKDqOeE5b6DPTDOvjBtFVCjuC5HupOL', modelId: 'glm-5.1', maxInputTokens: 262144, maxOutputTokens: 65536 },
  { id: 'gpt-5.4-yunwu', name: 'GPT-5.4 (yunwu)', url: 'https://yunwu.ai/v1', apiKey: 'sk-Xq5czUpkNRTmSvjKhQKDqOeE5b6DPTDOvjBtFVCjuC5HupOL', modelId: 'gpt-5.4', maxInputTokens: 262144, maxOutputTokens: 65536 },
  { id: 'gpt-5.5-yunwu', name: 'GPT-5.5 (yunwu)', url: 'https://yunwu.ai/v1', apiKey: 'sk-Xq5czUpkNRTmSvjKhQKDqOeE5b6DPTDOvjBtFVCjuC5HupOL', modelId: 'gpt-5.5-2026-04-24', maxInputTokens: 262144, maxOutputTokens: 65536 },
  { id: 'kimi-k2.5-yunwu', name: 'Kimi K2.5 (yunwu)', url: 'https://yunwu.ai/v1', apiKey: 'sk-Xq5czUpkNRTmSvjKhQKDqOeE5b6DPTDOvjBtFVCjuC5HupOL', modelId: 'kimi-k2.5', maxInputTokens: 262144, maxOutputTokens: 65536 },

  // ═══════════════════════════════════════════════════
  // kaola-grok16 (kaola.kaolawudi.fun:8443)
  // ═══════════════════════════════════════════════════
  // (platform created but no models mapped in recovery template)

  // ═══════════════════════════════════════════════════
  // new.xem8k5.top (limited capabilities)
  // ═══════════════════════════════════════════════════
  { id: 'gpt-5-xem8k5', name: 'gpt-5', url: 'http://new.xem8k5.top:3000/v1', apiKey: 'sk-LQnuh6GNzQab05ynSWzypmZU9NI4CjjXEehWRVxcni7y0vI8', modelId: 'gpt-5', maxInputTokens: 8192, maxOutputTokens: 4096, capabilities: [] },
  { id: 'gpt-5-codex-xem8k5', name: 'gpt-5-codex', url: 'http://new.xem8k5.top:3000/v1', apiKey: 'sk-LQnuh6GNzQab05ynSWzypmZU9NI4CjjXEehWRVxcni7y0vI8', modelId: 'gpt-5-codex', maxInputTokens: 8192, maxOutputTokens: 4096, capabilities: [] },
  { id: 'gpt-5-codex-mini-xem8k5', name: 'gpt-5-codex-mini', url: 'http://new.xem8k5.top:3000/v1', apiKey: 'sk-LQnuh6GNzQab05ynSWzypmZU9NI4CjjXEehWRVxcni7y0vI8', modelId: 'gpt-5-codex-mini', maxInputTokens: 8192, maxOutputTokens: 4096, capabilities: [] },
  { id: 'gpt-5.1-xem8k5', name: 'gpt-5.1', url: 'http://new.xem8k5.top:3000/v1', apiKey: 'sk-LQnuh6GNzQab05ynSWzypmZU9NI4CjjXEehWRVxcni7y0vI8', modelId: 'gpt-5.1', maxInputTokens: 8192, maxOutputTokens: 4096, capabilities: [] },
  { id: 'gpt-5.1-codex-xem8k5', name: 'gpt-5.1-codex', url: 'http://new.xem8k5.top:3000/v1', apiKey: 'sk-LQnuh6GNzQab05ynSWzypmZU9NI4CjjXEehWRVxcni7y0vI8', modelId: 'gpt-5.1-codex', maxInputTokens: 8192, maxOutputTokens: 4096, capabilities: [] },
  { id: 'gpt-5.1-codex-max-xem8k5', name: 'gpt-5.1-codex-max', url: 'http://new.xem8k5.top:3000/v1', apiKey: 'sk-LQnuh6GNzQab05ynSWzypmZU9NI4CjjXEehWRVxcni7y0vI8', modelId: 'gpt-5.1-codex-max', maxInputTokens: 8192, maxOutputTokens: 4096, capabilities: [] },
  { id: 'gpt-5.1-codex-mini-xem8k5', name: 'gpt-5.1-codex-mini', url: 'http://new.xem8k5.top:3000/v1', apiKey: 'sk-LQnuh6GNzQab05ynSWzypmZU9NI4CjjXEehWRVxcni7y0vI8', modelId: 'gpt-5.1-codex-mini', maxInputTokens: 8192, maxOutputTokens: 4096, capabilities: [] },
  { id: 'gpt-5.2-xem8k5', name: 'gpt-5.2', url: 'http://new.xem8k5.top:3000/v1', apiKey: 'sk-LQnuh6GNzQab05ynSWzypmZU9NI4CjjXEehWRVxcni7y0vI8', modelId: 'gpt-5.2', maxInputTokens: 8192, maxOutputTokens: 4096, capabilities: [] },
  { id: 'gpt-5.2-codex-xem8k5', name: 'gpt-5.2-codex', url: 'http://new.xem8k5.top:3000/v1', apiKey: 'sk-LQnuh6GNzQab05ynSWzypmZU9NI4CjjXEehWRVxcni7y0vI8', modelId: 'gpt-5.2-codex', maxInputTokens: 8192, maxOutputTokens: 4096, capabilities: [] },
  { id: 'gpt-5.3-codex-xem8k5', name: 'gpt-5.3-codex', url: 'http://new.xem8k5.top:3000/v1', apiKey: 'sk-LQnuh6GNzQab05ynSWzypmZU9NI4CjjXEehWRVxcni7y0vI8', modelId: 'gpt-5.3-codex', maxInputTokens: 8192, maxOutputTokens: 4096, capabilities: [] },
  { id: 'gpt-5.3-codex-spark-xem8k5', name: 'gpt-5.3-codex-spark', url: 'http://new.xem8k5.top:3000/v1', apiKey: 'sk-LQnuh6GNzQab05ynSWzypmZU9NI4CjjXEehWRVxcni7y0vI8', modelId: 'gpt-5.3-codex-spark', maxInputTokens: 8192, maxOutputTokens: 4096, capabilities: [] },
  { id: 'gpt-5.4-xem8k5', name: 'gpt-5.4', url: 'http://new.xem8k5.top:3000/v1', apiKey: 'sk-LQnuh6GNzQab05ynSWzypmZU9NI4CjjXEehWRVxcni7y0vI8', modelId: 'gpt-5.4', maxInputTokens: 8192, maxOutputTokens: 4096, capabilities: [] },
  { id: 'gpt-5.4-mini-xem8k5', name: 'gpt-5.4-mini', url: 'http://new.xem8k5.top:3000/v1', apiKey: 'sk-LQnuh6GNzQab05ynSWzypmZU9NI4CjjXEehWRVxcni7y0vI8', modelId: 'gpt-5.4-mini', maxInputTokens: 8192, maxOutputTokens: 4096, capabilities: [] },
  { id: 'gpt-5.5-xem8k5', name: 'gpt-5.5', url: 'http://new.xem8k5.top:3000/v1', apiKey: 'sk-LQnuh6GNzQab05ynSWzypmZU9NI4CjjXEehWRVxcni7y0vI8', modelId: 'gpt-5.5', maxInputTokens: 258000, maxOutputTokens: 65536 },
  { id: 'gpt-5.5-openai-compact-xem8k5', name: 'gpt-5.5-openai-compact', url: 'http://new.xem8k5.top:3000/v1', apiKey: 'sk-LQnuh6GNzQab05ynSWzypmZU9NI4CjjXEehWRVxcni7y0vI8', modelId: 'gpt-5.5-openai-compact', maxInputTokens: 8192, maxOutputTokens: 4096, capabilities: [] },
  { id: 'gpt-image-2-xem8k5', name: 'gpt-image-2', url: 'http://new.xem8k5.top:3000/v1', apiKey: 'sk-LQnuh6GNzQab05ynSWzypmZU9NI4CjjXEehWRVxcni7y0vI8', modelId: 'gpt-image-2', maxInputTokens: 8192, maxOutputTokens: 4096, capabilities: [] },
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
  const modelIdForApi = model.modelId || model.id;
  const existing = await apiRequest('/api/models');
  if (existing.ok && Array.isArray(existing.data)) {
    const found = existing.data.find(m => m.platform_id === platformId && m.model_id === modelIdForApi);
    if (found) return found.id;
  }
  const caps = model.capabilities || ['Tool', 'Vision', 'Reasoning'];
  const res = await apiRequest('/api/models', {
    method: 'POST',
    body: JSON.stringify({
      platform_id: platformId,
      model_id: modelIdForApi,
      display_name: model.name,
      max_tokens: model.maxOutputTokens || 65536,
      context_window: model.maxInputTokens || 200000,
      capabilities: caps,
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
  const modelIdForBackend = model.modelId || model.id;
  const caps = model.capabilities || ['Tool', 'Vision', 'Reasoning'];
  const existing = await apiRequest(`/api/proxies/${proxyId}/routes`);
  if (existing.ok && Array.isArray(existing.data) && existing.data.length > 0) {
    const route = existing.data[0];
    const backends = await apiRequest(`/api/routes/${route.id}/backends`);
    if (backends.ok && Array.isArray(backends.data)) {
      const matched = backends.data.find(b => b.platform_id === platformId && b.model_id === modelIdForBackend);
      if (matched) return true;
      for (const backend of backends.data) {
        await apiRequest(`/api/backends/${backend.id}`, { method: 'DELETE' });
      }
      const addBackendRes = await apiRequest(`/api/routes/${route.id}/backends`, {
        method: 'POST',
        body: JSON.stringify({
          platform_id: platformId,
          model_id: modelIdForBackend,
          weight: 1,
          priority: 0,
          capabilities: caps,
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
      backends: [{ platform_id: platformId, model_id: modelIdForBackend, weight: 1, priority: 0, capabilities: caps }],
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

