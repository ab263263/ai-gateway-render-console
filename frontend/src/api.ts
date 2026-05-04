import axios from 'axios'

// Detect Tauri desktop mode
const isTauri = !!(window as any).__TAURI_INTERNALS__

// In Tauri mode, the WebView navigates to http://127.0.0.1:{port}
// so the frontend and API share the same origin — use relative paths.
// For standalone browser dev, Vite proxy handles /api -> localhost:1994.
let configuredPort = 1994

function buildBaseURL(): string {
  if (isTauri && window.location.protocol !== 'http:') {
    // Still on tauri:// protocol (shouldn't happen with new approach, but fallback)
    return `http://127.0.0.1:${configuredPort}/api`
  }
  // Same origin — use relative path
  return '/api'
}

function buildProxyBaseURL(): string {
  if (isTauri && window.location.protocol !== 'http:') {
    return `http://127.0.0.1:${configuredPort}`
  }
  // Same origin
  return ''
}

const api = axios.create({ baseURL: buildBaseURL() })

// Fetch settings to get the actual configured port on startup
export async function initConfig(): Promise<void> {
  if (!isTauri) return

  // If already on http://127.0.0.1, just use relative paths — no port discovery needed
  if (window.location.protocol === 'http:' && window.location.hostname === '127.0.0.1') {
    api.defaults.baseURL = '/api'
    return
  }

  // Fallback: still on tauri:// protocol, need to find the backend
  try {
    const resp = await fetch(`http://127.0.0.1:${configuredPort}/api/settings`)
    const data = await resp.json()
    if (data.admin_port && data.admin_port !== configuredPort) {
      configuredPort = data.admin_port
      api.defaults.baseURL = buildBaseURL()
    }
  } catch {
    const ports = [18080, 8080, 3000]
    for (const p of ports) {
      try {
        const resp = await fetch(`http://127.0.0.1:${p}/api/settings`)
        const data = await resp.json()
        if (data.admin_port) {
          configuredPort = data.admin_port
          api.defaults.baseURL = buildBaseURL()
          return
        }
      } catch { continue }
    }
  }
}

// Dynamic proxy base URL getter
export function proxyBaseURL(): string {
  return buildProxyBaseURL()
}

// Platforms
export const listPlatforms = () => api.get('/platforms').then(r => r.data)
export const getPlatform = (id: string) => api.get(`/platforms/${id}`).then(r => r.data)
export const createPlatform = (data: any) => api.post('/platforms', data).then(r => r.data)
export const updatePlatform = (id: string, data: any) => api.put(`/platforms/${id}`, data).then(r => r.data)
export const deletePlatform = (id: string) => api.delete(`/platforms/${id}`)
export const listPresets = () => api.get('/platforms/presets').then(r => r.data)
export const fetchRemoteModels = (id: string) => api.get(`/platforms/${id}/remote-models`).then(r => r.data)
export const importRemoteModels = (id: string, data?: { model_ids?: string[]; max_tokens?: number; context_window?: number }) => api.post(`/platforms/${id}/remote-models/import`, data || {}).then(r => r.data)
export const testPlatformChat = (id: string, data: { model_id: string; message: string; max_tokens?: number }) => api.post(`/platforms/${id}/chat-test`, data).then(r => r.data)
export const probePlatformModel = (id: string, data: { model_id: string; message?: string; max_tokens?: number }) => api.post(`/platforms/${id}/probe-model`, data).then(r => r.data)

export async function runProxyChatCompletion(data: {
  model: string
  messages: { role: string; content: string }[]
  max_tokens?: number
  temperature?: number
  stream?: boolean
}) {
  const response = await fetch(`${proxyBaseURL()}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `HTTP ${response.status}`)
  }

  if (data.stream) {
    return { stream: true as const, response }
  }

  return { stream: false as const, data: await response.json() }
}

// Models
export const listModels = () => api.get('/models').then(r => r.data)
export const createModel = (data: any) => api.post('/models', data).then(r => r.data)
export const updateModel = (id: string, data: any) => api.put(`/models/${id}`, data).then(r => r.data)
export const deleteModel = (id: string) => api.delete(`/models/${id}`)
export const testModelConnection = (id: string) => api.post(`/models/${id}/test`).then(r => r.data)

// Proxies
export const listProxies = () => api.get('/proxies').then(r => r.data)
export const getProxy = (id: string) => api.get(`/proxies/${id}`).then(r => r.data)
export const createProxy = (data: any) => api.post('/proxies', data).then(r => r.data)
export const updateProxy = (id: string, data: any) => api.put(`/proxies/${id}`, data).then(r => r.data)
export const deleteProxy = (id: string) => api.delete(`/proxies/${id}`)

// Routes
export const listRoutes = (proxyId: string) => api.get(`/proxies/${proxyId}/routes`).then(r => r.data)
export const createRoute = (proxyId: string, data: any) => api.post(`/proxies/${proxyId}/routes`, data).then(r => r.data)
export const updateRoute = (id: string, data: any) => api.put(`/routes/${id}`, data).then(r => r.data)
export const deleteRoute = (id: string) => api.delete(`/routes/${id}`)
export const listBackends = (routeId: string) => api.get(`/routes/${routeId}/backends`).then(r => r.data)
export const addBackend = (routeId: string, data: any) => api.post(`/routes/${routeId}/backends`, data).then(r => r.data)
export const updateBackend = (id: string, data: any) => api.put(`/backends/${id}`, data).then(r => r.data)
export const deleteBackend = (id: string) => api.delete(`/backends/${id}`)

// API Keys
export const listApiKeys = () => api.get('/api-keys').then(r => r.data)
export const createApiKey = (data: any) => api.post('/api-keys', data).then(r => r.data)
export const deleteApiKey = (id: string) => api.delete(`/api-keys/${id}`)

// Platform Keys (multi-key support)
export const listPlatformKeys = (platformId: string) => api.get(`/platforms/${platformId}/keys`).then(r => r.data)
export const addPlatformKey = (platformId: string, data: { api_key: string; weight?: number }) => api.post(`/platforms/${platformId}/keys`, data).then(r => r.data)
export const deletePlatformKey = (keyId: string) => api.delete(`/platform-keys/${keyId}`)

// Model Aliases
export const listModelAliases = () => api.get('/model-aliases').then(r => r.data)
export const createModelAlias = (data: { alias: string; actual_model_id: string }) => api.post('/model-aliases', data).then(r => r.data)
export const deleteModelAlias = (id: string) => api.delete(`/model-aliases/${id}`)

// Request Logs
export const listLogs = (params?: { page?: number; page_size?: number; platform_id?: string; model_id?: string; status_code?: number; start_time?: string; end_time?: string }) => api.get('/logs', { params }).then(r => r.data)

// Stats
export const getOverview = () => api.get('/stats/overview').then(r => r.data)
export const getProxyStats = (proxyId: string) => api.get(`/stats/proxy/${proxyId}`).then(r => r.data)
export const getPlatformStats = (platformId: string) => api.get(`/stats/platform/${platformId}`).then(r => r.data)

// Settings
export const getSettings = () => api.get('/settings').then(r => r.data)
export const updateSettings = (data: any) => api.put('/settings', data).then(r => r.data)

// Backup
export const exportBackup = () => api.get('/backup').then(r => r.data)

// Checkin & Balance
export const doCheckin = () => api.post('/checkin').then(r => r.data)
export const doCheckinSingle = (platformId: string) => api.post(`/checkin/${platformId}`).then(r => r.data)
export const listBalances = () => api.get('/balances').then(r => r.data)
export const refreshBalances = () => api.post('/balances/refresh').then(r => r.data)
export const listCheckinLogs = (params?: { platform_id?: string; limit?: number }) => api.get('/checkin-logs', { params }).then(r => r.data)

// Health Check
export const triggerHealthCheck = () => api.post('/platforms/health-check').then(r => r.data)
export const getPlatformHealth = (platformId: string) => api.get(`/platforms/${platformId}/health`).then(r => r.data)
