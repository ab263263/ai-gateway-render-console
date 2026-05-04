import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
  Grid,
  Segmented,
  Switch,
  Divider,
  Modal,
} from 'antd'
import {
  ApiOutlined,
  SendOutlined,
  PlayCircleOutlined,
  CopyOutlined,
  ThunderboltOutlined,
  BugOutlined,
  SaveOutlined,
  ClearOutlined,
} from '@ant-design/icons'
import { listPlatforms, fetchRemoteModels, probePlatformModel, runProxyChatCompletion, listProxies } from '../api'
import { useAppContext, getSurfaceTheme } from '../ThemeContext'
import { t } from '../i18n'
import MarkdownMessage from '../components/chat/MarkdownMessage'

const { Text, Title, Paragraph } = Typography

const PRESETS_KEY = 'ai-gateway-playground-presets'
const HISTORY_KEY = 'ai-gateway-playground-history'

type RemoteModelResult = {
  success?: boolean
  models?: { id: string; owned_by?: string }[]
  count?: number
  message?: string
  platform_name?: string
}

type ProbeStatus = 'available' | 'mapped_model_mismatch' | 'cooldown' | 'unavailable' | 'untested'

type ProbeRow = {
  key: string
  platform: string
  requested_model: string
  actual_model: string
  models_ok: boolean
  models_count: number
  chat_ok: boolean
  status: number
  latency_ms: number
  category: string
  detail: string
  probe_status: ProbeStatus
}

type PlaygroundMode = 'playground' | 'diagnostics'
type ChatRole = 'system' | 'user' | 'assistant'

type ChatMessage = {
  id: string
  role: ChatRole
  content: string
  createdAt: number
  model?: string
}

type PlaygroundPreset = {
  id: string
  name: string
  systemPrompt: string
  userPrompt: string
  model: string
  temperature: number
  maxTokens: number
  stream: boolean
  updatedAt: number
}

type CompareResult = {
  model: string
  output: string
  error?: string
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default function ChatTest() {
  const { locale, isDark } = useAppContext()
  const surface = getSurfaceTheme(isDark)
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md

  const [mode, setMode] = useState<PlaygroundMode>('playground')
  const [platforms, setPlatforms] = useState<any[]>([])
  const [proxies, setProxies] = useState<any[]>([])
  const [loadingPlatforms, setLoadingPlatforms] = useState(false)
  const [selectedPlatformId, setSelectedPlatformId] = useState<string>()
  const [selectedModelId, setSelectedModelId] = useState<string>()
  const [manualModelId, setManualModelId] = useState('')
  const [messageText, setMessageText] = useState('回复一句 OK，并带上你实际命中的模型名')
  const [maxTokens, setMaxTokens] = useState(128)
  const [loadingModels, setLoadingModels] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testingAll, setTestingAll] = useState(false)
  const [modelMap, setModelMap] = useState<Record<string, RemoteModelResult>>({})
  const [probeResult, setProbeResult] = useState<any>(null)
  const [batchResults, setBatchResults] = useState<ProbeRow[]>([])

  const [playgroundModel, setPlaygroundModel] = useState<string>()
  const [systemPrompt, setSystemPrompt] = useState('你是一个用于模型测试的助手。回答简洁、准确。')
  const [userPrompt, setUserPrompt] = useState('请简单介绍一下你当前的能力范围，并说明你是否支持工具调用。')
  const [temperature, setTemperature] = useState(0.7)
  const [streamMode, setStreamMode] = useState(false)
  const [playgroundLoading, setPlaygroundLoading] = useState(false)
  const [playgroundOutput, setPlaygroundOutput] = useState('')
  const [requestPreview, setRequestPreview] = useState('')
  const [conversationHistory, setConversationHistory] = useState<ChatMessage[]>([])
  const [presets, setPresets] = useState<PlaygroundPreset[]>([])
  const [presetName, setPresetName] = useState('')
  const [presetModalOpen, setPresetModalOpen] = useState(false)
  const [compareModels, setCompareModels] = useState<string[]>([])
  const [compareResults, setCompareResults] = useState<CompareResult[]>([])
  const [compareLoading, setCompareLoading] = useState(false)

  useEffect(() => {
    void loadPlatforms()
    void loadProxies()
    loadLocalState()
  }, [])

  const loadLocalState = () => {
    try {
      const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
      const savedPresets = JSON.parse(localStorage.getItem(PRESETS_KEY) || '[]')
      setConversationHistory(Array.isArray(history) ? history : [])
      setPresets(Array.isArray(savedPresets) ? savedPresets : [])
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(conversationHistory.slice(-30)))
  }, [conversationHistory])

  useEffect(() => {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets))
  }, [presets])

  const loadPlatforms = async () => {
    setLoadingPlatforms(true)
    try {
      const data = await listPlatforms()
      setPlatforms(data)
    } catch {
      message.error(t(locale, 'loadFailed'))
    }
    setLoadingPlatforms(false)
  }

  const loadProxies = async () => {
    try {
      const data = await listProxies()
      setProxies(data)
      if (data?.length && !playgroundModel) {
        setPlaygroundModel(data[0].name)
        setCompareModels([data[0].name].concat(data[1]?.name ? [data[1].name] : []))
      }
    } catch {
      // ignore
    }
  }

  const selectedPlatform = useMemo(
    () => platforms.find((item: any) => item.id === selectedPlatformId),
    [platforms, selectedPlatformId],
  )

  const currentModels = modelMap[selectedPlatformId || '']?.models || []
  const effectiveModelId = manualModelId.trim() || selectedModelId || ''

  const buildPlaygroundMessages = () => {
    const base: { role: string; content: string }[] = []
    if (systemPrompt.trim()) base.push({ role: 'system', content: systemPrompt.trim() })

    const persistedTurns = conversationHistory
      .filter(item => item.role === 'user' || item.role === 'assistant')
      .map(item => ({ role: item.role, content: item.content }))

    if (persistedTurns.length > 0) {
      return [...base, ...persistedTurns]
    }

    return [...base, { role: 'user', content: userPrompt.trim() }]
  }

  const buildPlaygroundPayload = () => ({
    model: playgroundModel || '',
    messages: buildPlaygroundMessages(),
    max_tokens: maxTokens,
    temperature,
    stream: streamMode,
  })

  useEffect(() => {
    setRequestPreview(JSON.stringify(buildPlaygroundPayload(), null, 2))
  }, [playgroundModel, systemPrompt, userPrompt, maxTokens, temperature, streamMode, conversationHistory])

  const handleFetchModels = async (platformId?: string) => {
    const targetId = platformId || selectedPlatformId
    if (!targetId) {
      message.warning(t(locale, 'selectPlatform'))
      return
    }
    setLoadingModels(true)
    try {
      const result = await fetchRemoteModels(targetId)
      setModelMap(prev => ({ ...prev, [targetId]: result }))
      const count = result?.count || result?.models?.length || 0
      if (result?.success === false) {
        message.error(result?.message || t(locale, 'fetchRemoteModelsFailed'))
      } else {
        message.success(`${t(locale, 'fetchFromPlatform')}${count > 0 ? `：${count}` : ''}`)
      }
    } catch (e: any) {
      message.error(e?.response?.data?.error?.message || t(locale, 'fetchRemoteModelsFailed'))
    }
    setLoadingModels(false)
  }

  const handlePlatformChange = async (value: string) => {
    setSelectedPlatformId(value)
    setSelectedModelId(undefined)
    setManualModelId('')
    setProbeResult(null)
    setBatchResults([])
    if (!modelMap[value]) {
      await handleFetchModels(value)
    }
  }

  const normalizeProbe = (platformName: string, requestedModel: string, result: any): ProbeRow => {
    const category = result?.chat_probe?.category || ''
    const probeStatus: ProbeStatus =
      category === 'mapped_model_mismatch'
        ? 'mapped_model_mismatch'
        : category === 'cooldown'
          ? 'cooldown'
          : result?.chat_probe?.success
            ? 'available'
            : result
              ? 'unavailable'
              : 'untested'

    return {
      key: `${platformName}-${requestedModel}`,
      platform: platformName,
      requested_model: requestedModel,
      actual_model: result?.actual_model || '',
      models_ok: !!result?.models_probe?.success,
      models_count: Number(result?.models_probe?.count || 0),
      chat_ok: !!result?.chat_probe?.success,
      status: Number(result?.chat_probe?.status || 0),
      latency_ms: Number(result?.chat_probe?.latency_ms || 0),
      category,
      detail: result?.chat_probe?.message || result?.models_probe?.error || '',
      probe_status: probeStatus,
    }
  }

  const runSingleProbe = async (modelId: string) => {
    if (!selectedPlatformId || !selectedPlatform) return null
    const result = await probePlatformModel(selectedPlatformId, {
      model_id: modelId,
      message: messageText,
      max_tokens: maxTokens,
    })
    return { raw: result, row: normalizeProbe(selectedPlatform.name, modelId, result) }
  }

  const handleTest = async () => {
    if (!selectedPlatformId) {
      message.warning(t(locale, 'selectPlatform'))
      return
    }
    if (!effectiveModelId) {
      message.warning(t(locale, 'selectModel'))
      return
    }
    setTesting(true)
    try {
      const result = await runSingleProbe(effectiveModelId)
      setProbeResult(result?.raw || null)
      if (result?.row) {
        setBatchResults(prev => [result.row, ...prev.filter(item => item.requested_model !== result.row.requested_model)])
      }
      if (result?.raw?.chat_probe?.success) {
        message.success(`${t(locale, 'testConnectionSuccess')} (${result.raw.chat_probe.latency_ms}ms)`)
      } else {
        message.error(result?.raw?.chat_probe?.message || t(locale, 'testConnectionFailed'))
      }
    } catch (e: any) {
      message.error(e?.response?.data?.error?.message || e?.message || t(locale, 'testConnectionFailed'))
    }
    setTesting(false)
  }

  const handleSingleRowTest = async (modelId: string) => {
    setSelectedModelId(modelId)
    setManualModelId('')
    await handleTest()
  }

  const handleTestAll = async () => {
    if (!selectedPlatformId) {
      message.warning(t(locale, 'selectPlatform'))
      return
    }
    if (currentModels.length === 0) {
      message.warning(t(locale, 'noRemoteModels'))
      return
    }
    setTestingAll(true)
    const results: ProbeRow[] = []
    for (const model of currentModels) {
      try {
        const result = await runSingleProbe(model.id)
        if (result?.row) results.push(result.row)
      } catch (e: any) {
        if (!selectedPlatform) continue
        results.push({
          key: `${selectedPlatform.name}-${model.id}`,
          platform: selectedPlatform.name,
          requested_model: model.id,
          actual_model: '',
          models_ok: false,
          models_count: 0,
          chat_ok: false,
          status: 0,
          latency_ms: 0,
          category: 'platform_compat_issue',
          detail: e?.response?.data?.error?.message || e?.message || t(locale, 'testConnectionFailed'),
          probe_status: 'unavailable',
        })
      }
    }
    setBatchResults(results)
    setTestingAll(false)
    message.success(`完成 ${results.length} 个模型巡检`)
  }

  const appendMessage = (role: ChatRole, content: string, model?: string) => {
    setConversationHistory(prev => [...prev, { id: uid(), role, content, model, createdAt: Date.now() }])
  }

  const handleRunPlayground = async () => {
    if (!playgroundModel) {
      message.warning(t(locale, 'selectModel'))
      return
    }

    const promptToSend = userPrompt.trim()
    if (!promptToSend && conversationHistory.filter(item => item.role === 'user').length === 0) {
      message.warning(t(locale, 'userPrompt'))
      return
    }

    if (promptToSend) {
      appendMessage('user', promptToSend)
    }

    const payload = {
      model: playgroundModel,
      messages: [
        ...(systemPrompt.trim() ? [{ role: 'system', content: systemPrompt.trim() }] : []),
        ...conversationHistory.filter(item => item.role === 'user' || item.role === 'assistant').map(item => ({ role: item.role, content: item.content })),
        ...(promptToSend ? [{ role: 'user', content: promptToSend }] : []),
      ],
      max_tokens: maxTokens,
      temperature,
      stream: streamMode,
    }

    setRequestPreview(JSON.stringify(payload, null, 2))
    setPlaygroundOutput('')
    setPlaygroundLoading(true)
    setUserPrompt('')

    try {
      const result = await runProxyChatCompletion(payload)
      let finalText = ''
      if (result.stream) {
        const reader = result.response.body?.getReader()
        const decoder = new TextDecoder('utf-8')
        let buffer = ''
        while (reader) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const chunks = buffer.split('\n\n')
          buffer = chunks.pop() || ''
          for (const chunk of chunks) {
            const lines = chunk.split('\n')
            for (const line of lines) {
              if (!line.startsWith('data:')) continue
              const raw = line.replace(/^data:\s*/, '').trim()
              if (!raw || raw === '[DONE]') continue
              try {
                const json = JSON.parse(raw)
                const delta = json?.choices?.[0]?.delta?.content || json?.choices?.[0]?.message?.content || ''
                if (delta) {
                  finalText += delta
                  setPlaygroundOutput(finalText)
                }
              } catch {
                finalText += raw
                setPlaygroundOutput(finalText)
              }
            }
          }
        }
      } else {
        finalText = result.data?.choices?.[0]?.message?.content || JSON.stringify(result.data, null, 2)
        setPlaygroundOutput(finalText)
      }
      appendMessage('assistant', finalText || t(locale, 'noResponseYet'), playgroundModel)
      message.success(t(locale, 'playgroundSuccess'))
    } catch (e: any) {
      const err = e?.message || t(locale, 'playgroundFailed')
      setPlaygroundOutput(err)
      appendMessage('assistant', err, playgroundModel)
      message.error(err)
    }

    setPlaygroundLoading(false)
  }

  const handleSavePreset = () => {
    if (!presetName.trim() || !playgroundModel) {
      message.warning(t(locale, 'presetName'))
      return
    }
    const preset: PlaygroundPreset = {
      id: uid(),
      name: presetName.trim(),
      systemPrompt,
      userPrompt,
      model: playgroundModel,
      temperature,
      maxTokens,
      stream: streamMode,
      updatedAt: Date.now(),
    }
    setPresets(prev => [preset, ...prev])
    setPresetName('')
    setPresetModalOpen(false)
    message.success(t(locale, 'savePreset'))
  }

  const loadPreset = (presetId: string) => {
    const preset = presets.find(item => item.id === presetId)
    if (!preset) return
    setPlaygroundModel(preset.model)
    setSystemPrompt(preset.systemPrompt)
    setUserPrompt(preset.userPrompt)
    setTemperature(preset.temperature)
    setMaxTokens(preset.maxTokens)
    setStreamMode(preset.stream)
    message.success(t(locale, 'loadPreset'))
  }

  const handleCompareModels = async () => {
    const validModels = compareModels.filter(Boolean)
    const prompt = userPrompt.trim() || conversationHistory.filter(item => item.role === 'user').slice(-1)[0]?.content || ''
    if (validModels.length < 2 || !prompt) {
      message.warning(t(locale, 'compareModels'))
      return
    }
    setCompareLoading(true)
    const results: CompareResult[] = []
    for (const model of validModels) {
      try {
        const payload = {
          model,
          messages: [
            ...(systemPrompt.trim() ? [{ role: 'system', content: systemPrompt.trim() }] : []),
            { role: 'user', content: prompt },
          ],
          max_tokens: maxTokens,
          temperature,
          stream: false,
        }
        const result = await runProxyChatCompletion(payload)
        if (!result.stream) {
          results.push({
            model,
            output: result.data?.choices?.[0]?.message?.content || JSON.stringify(result.data, null, 2),
          })
        }
      } catch (e: any) {
        results.push({ model, output: '', error: e?.message || 'error' })
      }
    }
    setCompareResults(results)
    setCompareLoading(false)
  }

  const handleCopyRequest = async () => {
    await navigator.clipboard.writeText(requestPreview)
    message.success(t(locale, 'copyRequest'))
  }

  const handleCopyCurl = async () => {
    const payload = buildPlaygroundPayload()
    const curl = `curl -X POST http://localhost:1994/v1/chat/completions -H "Content-Type: application/json" -d '${JSON.stringify(payload)}'`
    await navigator.clipboard.writeText(curl)
    message.success(t(locale, 'copyCurl'))
  }

  const clearHistory = () => {
    setConversationHistory([])
    setPlaygroundOutput('')
    localStorage.removeItem(HISTORY_KEY)
  }

  const batchColumns = [
    { title: t(locale, 'platforms'), dataIndex: 'platform', key: 'platform', width: 140 },
    { title: t(locale, 'modelId'), dataIndex: 'requested_model', key: 'requested_model', width: 220 },
    {
      title: t(locale, 'status'), dataIndex: 'probe_status', key: 'probe_status', width: 120,
      render: (v: ProbeStatus) => {
        const color = v === 'available' ? 'success' : v === 'mapped_model_mismatch' ? 'warning' : v === 'cooldown' ? 'processing' : v === 'unavailable' ? 'error' : 'default'
        const label = v === 'available' ? '可用' : v === 'mapped_model_mismatch' ? '映射异常' : v === 'cooldown' ? '冷却中' : v === 'unavailable' ? '不可用' : '未测试'
        return <Tag color={color}>{label}</Tag>
      },
    },
    { title: t(locale, 'actualModel'), dataIndex: 'actual_model', key: 'actual_model', width: 220, render: (v: string) => v || '-' },
    {
      title: '/models', dataIndex: 'models_ok', key: 'models_ok', width: 90,
      render: (v: boolean, row: ProbeRow) => <Tag color={v ? 'success' : 'default'}>{v ? `OK(${row.models_count})` : 'FAIL'}</Tag>,
    },
    {
      title: 'chat', dataIndex: 'chat_ok', key: 'chat_ok', width: 90,
      render: (v: boolean) => <Tag color={v ? 'success' : 'error'}>{v ? 'OK' : 'FAIL'}</Tag>,
    },
    { title: 'HTTP', dataIndex: 'status', key: 'status', width: 80 },
    { title: t(locale, 'latency'), dataIndex: 'latency_ms', key: 'latency_ms', width: 90, render: (v: number) => `${v}ms` },
    { title: t(locale, 'errorCategory'), dataIndex: 'category', key: 'category', width: 180 },
    { title: t(locale, 'responseText'), dataIndex: 'detail', key: 'detail', ellipsis: true },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', marginBottom: 16, gap: 12, flexDirection: isMobile ? 'column' : 'row' }}>
        <div>
          <Title level={5} style={{ margin: 0 }}>{t(locale, 'chatTest')}</Title>
          <Text type="secondary">{mode === 'playground' ? t(locale, 'playgroundDesc') : t(locale, 'diagnosticsDesc')}</Text>
        </div>
        <Segmented
          value={mode}
          onChange={(value) => setMode(value as PlaygroundMode)}
          options={[
            { value: 'playground', label: <Space size={6}><ThunderboltOutlined />{t(locale, 'playground')}</Space> },
            { value: 'diagnostics', label: <Space size={6}><BugOutlined />{t(locale, 'diagnostics')}</Space> },
          ]}
          block={isMobile}
        />
      </div>

      {mode === 'playground' ? (
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={9}>
            <Card style={{ borderRadius: 20 }}>
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <div>
                  <Text strong>{t(locale, 'selectModel')}</Text>
                  <Select
                    showSearch
                    mode="multiple"
                    maxTagCount={2}
                    style={{ width: '100%', marginTop: 8 }}
                    placeholder={t(locale, 'selectModel')}
                    value={compareModels.length ? compareModels : playgroundModel ? [playgroundModel] : []}
                    options={proxies.map((proxy: any) => ({ value: proxy.name, label: proxy.name }))}
                    onChange={(value) => {
                      const values = value as string[]
                      setCompareModels(values)
                      if (values[0]) setPlaygroundModel(values[0])
                    }}
                    filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase())}
                  />
                </div>

                <div>
                  <Text strong>{t(locale, 'systemPrompt')}</Text>
                  <Input.TextArea rows={4} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} style={{ marginTop: 8 }} />
                </div>

                <div>
                  <Text strong>{t(locale, 'userPrompt')}</Text>
                  <Input.TextArea rows={6} value={userPrompt} onChange={(e) => setUserPrompt(e.target.value)} style={{ marginTop: 8 }} />
                </div>

                <Row gutter={12}>
                  <Col span={12}>
                    <Text strong>{t(locale, 'maxTokens')}</Text>
                    <InputNumber min={1} value={maxTokens} onChange={(v) => setMaxTokens(Number(v || 128))} style={{ width: '100%', marginTop: 8 }} />
                  </Col>
                  <Col span={12}>
                    <Text strong>{t(locale, 'temperature')}</Text>
                    <InputNumber min={0} max={2} step={0.1} value={temperature} onChange={(v) => setTemperature(Number(v ?? 0.7))} style={{ width: '100%', marginTop: 8 }} />
                  </Col>
                </Row>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 14, background: surface.brandSoft }}>
                  <div>
                    <Text strong>{t(locale, 'streamMode')}</Text>
                    <div><Text type="secondary">{t(locale, 'liveOutput')}</Text></div>
                  </div>
                  <Switch checked={streamMode} onChange={setStreamMode} />
                </div>

                <Space wrap style={{ width: '100%' }}>
                  <Button type="primary" icon={<SendOutlined />} onClick={handleRunPlayground} loading={playgroundLoading}>
                    {t(locale, 'runPlayground')}
                  </Button>
                  <Button icon={<SaveOutlined />} onClick={() => setPresetModalOpen(true)}>{t(locale, 'savePreset')}</Button>
                  <Button icon={<PlayCircleOutlined />} onClick={handleCompareModels} loading={compareLoading}>{t(locale, 'compareModels')}</Button>
                  <Button icon={<ClearOutlined />} onClick={clearHistory}>{t(locale, 'clearHistory')}</Button>
                  <Button icon={<CopyOutlined />} onClick={handleCopyRequest}>{t(locale, 'copyRequest')}</Button>
                  <Button icon={<CopyOutlined />} onClick={handleCopyCurl}>{t(locale, 'copyCurl')}</Button>
                </Space>

                {presets.length > 0 && (
                  <div>
                    <Text strong>{t(locale, 'presets')}</Text>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                      {presets.map((preset) => (
                        <Tag key={preset.id} style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: 999 }} onClick={() => loadPreset(preset.id)}>
                          {preset.name}
                        </Tag>
                      ))}
                    </div>
                  </div>
                )}
              </Space>
            </Card>
          </Col>

          <Col xs={24} xl={15}>
            <Card title={t(locale, 'requestPreview')} style={{ borderRadius: 20, marginBottom: 16 }}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, color: surface.textSecondary }}>{requestPreview}</pre>
            </Card>

            <Card title={t(locale, 'conversationHistory')} style={{ borderRadius: 20, marginBottom: 16 }}>
              {conversationHistory.length === 0 ? (
                <Text type="secondary">{t(locale, 'noResponseYet')}</Text>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
                  {conversationHistory.map((item) => (
                    <div key={item.id} style={{ padding: 14, borderRadius: 16, background: item.role === 'assistant' ? surface.panelBgElevated : surface.brandSoft, overflow: 'hidden' }}>
                      <div style={{ marginBottom: 8 }}>
                        <Text strong>{item.role === 'assistant' ? t(locale, 'assistantReply') : item.role === 'user' ? t(locale, 'userPrompt') : t(locale, 'systemPrompt')}</Text>
                        {item.model && <Text type="secondary"> · {item.model}</Text>}
                      </div>
                      {item.role === 'assistant' ? <MarkdownMessage content={item.content} /> : <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{item.content}</div>}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title={t(locale, 'responsePreview')} style={{ borderRadius: 20, marginBottom: compareResults.length > 0 ? 16 : 0 }}>
              {playgroundOutput ? <MarkdownMessage content={playgroundOutput} /> : <Text type="secondary">{t(locale, 'noResponseYet')}</Text>}
            </Card>

            {compareResults.length > 0 && (
              <Card title={t(locale, 'compareResult')} style={{ borderRadius: 20 }}>
                <Row gutter={[16, 16]}>
                  {compareResults.map((item) => (
                    <Col xs={24} md={12} key={item.model}>
                      <Card size="small" style={{ borderRadius: 16 }} title={<Text strong>{item.model}</Text>}>
                        {item.error ? <Alert type="error" showIcon message={item.error} /> : <MarkdownMessage content={item.output} />}
                      </Card>
                    </Col>
                  ))}
                </Row>
              </Card>
            )}
          </Col>
        </Row>
      ) : (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card style={{ borderRadius: 20 }}>
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <div>
                  <Text strong>{t(locale, 'selectPlatform')}</Text>
                  <Select
                    style={{ width: '100%', marginTop: 8 }}
                    placeholder={t(locale, 'selectPlatform')}
                    loading={loadingPlatforms}
                    value={selectedPlatformId}
                    options={platforms.map((p: any) => ({ value: p.id, label: p.name }))}
                    onChange={handlePlatformChange}
                  />
                </div>

                <div>
                  <Text strong>{t(locale, 'selectModel')}</Text>
                  <Select
                    showSearch
                    style={{ width: '100%', marginTop: 8 }}
                    placeholder={t(locale, 'selectRemoteModel')}
                    value={selectedModelId}
                    options={currentModels.map(m => ({ value: m.id, label: m.id }))}
                    onChange={setSelectedModelId}
                    filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase())}
                    allowClear
                  />
                </div>

                <div>
                  <Text strong>{t(locale, 'manualModelId')}</Text>
                  <Input value={manualModelId} onChange={e => setManualModelId(e.target.value)} placeholder="例如：gpt-5.5 / K2.6 / MiniMax-M2.7" style={{ marginTop: 8 }} />
                </div>

                <div>
                  <Text strong>{t(locale, 'testMessage')}</Text>
                  <Input.TextArea rows={5} value={messageText} onChange={e => setMessageText(e.target.value)} style={{ marginTop: 8 }} />
                </div>

                <div>
                  <Text strong>{t(locale, 'maxTokens')}</Text>
                  <InputNumber min={1} value={maxTokens} onChange={v => setMaxTokens(Number(v || 128))} style={{ width: '100%', marginTop: 8 }} />
                </div>

                <Space direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: '100%' }}>
                  <Button icon={<ApiOutlined />} onClick={() => handleFetchModels()} loading={loadingModels} disabled={!selectedPlatformId} block={isMobile}>
                    {t(locale, 'fetchFromPlatform')}
                  </Button>
                  <Button icon={<PlayCircleOutlined />} onClick={handleTestAll} loading={testingAll} disabled={!selectedPlatformId || currentModels.length === 0} block={isMobile}>
                    {t(locale, 'testAllModels')}
                  </Button>
                  <Button type="primary" icon={<SendOutlined />} onClick={handleTest} loading={testing} block={isMobile}>
                    {t(locale, 'runChatTest')}
                  </Button>
                </Space>
              </Space>
            </Card>
          </Col>

          <Col xs={24} lg={12}>
            <Card title={t(locale, 'platformModels')} style={{ borderRadius: 20 }}>
              {!selectedPlatform && <Text type="secondary">{t(locale, 'selectPlatform')}</Text>}
              {selectedPlatform && (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <div>
                    <Text strong>{selectedPlatform.name}</Text>
                    <Paragraph type="secondary" style={{ marginBottom: 0 }}>{selectedPlatform.base_url}</Paragraph>
                  </div>
                  {modelMap[selectedPlatform.id]?.message && modelMap[selectedPlatform.id]?.success === false && (
                    <Alert type="error" showIcon message={modelMap[selectedPlatform.id]?.message} />
                  )}
                  <div>
                    <Text type="secondary">
                      {t(locale, 'remoteModelsCount', String(modelMap[selectedPlatform.id]?.count || currentModels.length || 0))}
                    </Text>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {currentModels.length > 0 ? currentModels.map(m => (
                      <Tag key={m.id} color={selectedModelId === m.id ? 'processing' : 'default'} style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: 999 }} onClick={() => { setSelectedModelId(m.id); setManualModelId('') }}>
                        <Space size={4}>
                          <span>{m.id}</span>
                          <PlayCircleOutlined onClick={(e) => { e.stopPropagation(); void handleSingleRowTest(m.id) }} />
                        </Space>
                      </Tag>
                    )) : <Text type="secondary">{t(locale, 'noRemoteModels')}</Text>}
                  </div>
                </Space>
              )}
            </Card>

            <Card title={t(locale, 'chatTestResult')} style={{ borderRadius: 20, marginTop: 16 }}>
              {!probeResult && <Text type="secondary">{t(locale, 'noRequests')}</Text>}
              {probeResult && (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Alert
                    type={probeResult?.chat_probe?.success ? 'success' : 'error'}
                    showIcon
                    message={probeResult?.chat_probe?.success ? t(locale, 'testConnectionSuccess') : t(locale, 'testConnectionFailed')}
                    description={probeResult?.chat_probe?.message}
                  />
                  <div><Text strong>{t(locale, 'modelId')}</Text> <Text code>{probeResult.requested_model}</Text></div>
                  <div><Text strong>{t(locale, 'actualModel')}</Text> <Text code>{probeResult.actual_model || '-'}</Text></div>
                  <div><Text strong>/models:</Text> <Text code>{probeResult?.models_probe?.success ? `OK (${probeResult?.models_probe?.count || 0})` : `FAIL: ${probeResult?.models_probe?.error || '-'}`}</Text></div>
                  <div>
                    <Text strong>HTTP:</Text> <Text code>{String(probeResult?.chat_probe?.status ?? '-')}</Text>
                    <Text strong style={{ marginLeft: 12 }}>{t(locale, 'latency')}:</Text> <Text code>{String(probeResult?.chat_probe?.latency_ms ?? 0)}ms</Text>
                  </div>
                  <div><Text strong>{t(locale, 'errorCategory')}</Text> <Text code>{probeResult?.chat_probe?.category || '-'}</Text></div>
                  <div>
                    <Text strong>{t(locale, 'responseText')}</Text>
                    <Card size="small" styles={{ body: { whiteSpace: 'pre-wrap', wordBreak: 'break-word' } }} style={{ marginTop: 8, borderRadius: 14 }}>
                      {probeResult?.chat_probe?.output || JSON.stringify(probeResult?.raw || {}, null, 2)}
                    </Card>
                  </div>
                </Space>
              )}
            </Card>
          </Col>

          <Col xs={24}>
            <Card title={t(locale, 'batchTestResult')} style={{ borderRadius: 20 }}>
              <Table columns={batchColumns as any} dataSource={batchResults} pagination={false} rowKey="key" locale={{ emptyText: t(locale, 'noRequests') }} scroll={{ x: 1200 }} />
            </Card>
          </Col>
        </Row>
      )}

      <Modal title={t(locale, 'savePreset')} open={presetModalOpen} onOk={handleSavePreset} onCancel={() => setPresetModalOpen(false)}>
        <Input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder={t(locale, 'presetName')} />
      </Modal>
    </div>
  )
}
