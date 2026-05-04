import { useEffect, useState } from 'react'
import {
  Button,
  Table,
  Modal,
  Form,
  Input,
  Select,
  Tag,
  Space,
  message,
  Card,
  Drawer,
  Descriptions,
  Divider,
  Row,
  Col,
  Popconfirm,
  Typography,
  InputNumber,
  Tabs,
  Grid,
  Empty,
  Alert,
  theme,
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  LoadingOutlined,
  SettingOutlined,
  CodeOutlined,
  CopyOutlined,
} from '@ant-design/icons'
import {
  listProxies,
  createProxy,
  updateProxy,
  deleteProxy,
  listRoutes,
  createRoute,
  deleteRoute,
  listBackends,
  addBackend,
  deleteBackend,
  listPlatforms,
  fetchRemoteModels,
  probePlatformModel,
  getSettings,
  listApiKeys as fetchApiKeys,
} from '../api'

import { useAppContext } from '../ThemeContext'
import { t } from '../i18n'
import { getPresetName, platformPresets, getCapabilityLabel, getCapabilityColor, CAPABILITY_OPTIONS, getModelsForPlatform } from '../presets'

const { Text, Title } = Typography

type QuickPoolCandidate = {
  key: string
  platform_id: string
  platform_name: string
  platform_type: string
  model_id: string
  source: 'remote' | 'preset'
  capabilities: string[]
  selected: boolean
  probe_status: 'untested' | 'available' | 'mapped_model_mismatch' | 'cooldown' | 'unavailable'
  probe_category?: string
  probe_detail?: string
  actual_model?: string
}

export default function Proxies() {
  const [proxies, setProxies] = useState<any[]>([])
  const [proxyRoutes, setProxyRoutes] = useState<Record<string, any>>({})
  const [platforms, setPlatforms] = useState<any[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const { locale } = useAppContext()

  const [detailProxy, setDetailProxy] = useState<any>(null)
  const [detailRoute, setDetailRoute] = useState<any>(null)
  const [addBackendOpen, setAddBackendOpen] = useState(false)
  const [backendForm] = Form.useForm()
  const [selectedBackendPlatformId, setSelectedBackendPlatformId] = useState<string>('')
  const [remoteModels, setRemoteModels] = useState<{ id: string; owned_by?: string }[]>([])
  const [fetchingRemote, setFetchingRemote] = useState(false)

  const [editProxyOpen, setEditProxyOpen] = useState(false)
  const [editProxyForm] = Form.useForm()

  const [usageOpen, setUsageOpen] = useState(false)
  const [usageProxy, setUsageProxy] = useState<any>(null)
  const [adminPort, setAdminPort] = useState<number>(1994)
  const [apiKeysList, setApiKeysList] = useState<any[]>([])

  const [createRemoteModels, setCreateRemoteModels] = useState<Record<number, { id: string; owned_by?: string }[]>>({})
  const [createFetching, setCreateFetching] = useState<Record<number, boolean>>({})
  const [quickPoolModelId, setQuickPoolModelId] = useState('')
  const [quickPoolCandidates, setQuickPoolCandidates] = useState<QuickPoolCandidate[]>([])
  const [quickPoolLoading, setQuickPoolLoading] = useState(false)
  const [quickPoolProbing, setQuickPoolProbing] = useState(false)
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const { token } = theme.useToken()

  const LB_OPTIONS = [
    { value: 'RoundRobin', label: t(locale, 'roundRobin') },
    { value: 'WeightedRandom', label: t(locale, 'weightedRandom') },
    { value: 'LeastConnections', label: t(locale, 'leastConnections') },
    { value: 'Priority', label: t(locale, 'priorityMode') },
    { value: 'LatencyBased', label: t(locale, 'latencyBased') },
  ]

  useEffect(() => {
    loadAll()
    loadAdminPort()
  }, [])

  const loadAdminPort = async () => {
    try {
      const settings = await getSettings()
      setAdminPort(settings.admin_port)
    } catch {}
  }

  const loadAll = async () => {
    setLoading(true)
    try {
      const [proxyList, platformList, apiKeys] = await Promise.all([
        listProxies(),
        listPlatforms(),
        fetchApiKeys().catch(() => []),
      ])
      setProxies(proxyList)
      setPlatforms(platformList)
      setApiKeysList(apiKeys)

      const routeMap: Record<string, any> = {}
      await Promise.all(
        proxyList.map(async (proxy: any) => {
          try {
            const routes = await listRoutes(proxy.id)
            if (routes.length > 0) routeMap[proxy.id] = routes[0]
          } catch {}
        }),
      )
      setProxyRoutes(routeMap)
    } catch {}
    setLoading(false)
  }

  const resetCreateState = () => {
    setCreateOpen(false)
    form.resetFields()
    setCreateRemoteModels({})
    setCreateFetching({})
    resetQuickPool()
  }

  const handleCreate = async (values: any) => {
    try {
      const backends = values.backends || []
      const proxy = await createProxy({ name: values.name })
      if (backends.length > 0) {
        await createRoute(proxy.id, {
          lb_strategy: values.lb_strategy || 'RoundRobin',
          backends: backends.filter((item: any) => item.platform_id && item.model_id),
        })
      }
      message.success(t(locale, 'createSuccess'))
      resetCreateState()
      loadAll()
    } catch {
      message.error(t(locale, 'createFailed'))
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteProxy(id)
      message.success(t(locale, 'deleteSuccess'))
      loadAll()
    } catch {}
  }

  const openDetail = async (proxy: any) => {
    setDetailProxy(proxy)
    try {
      const routes = await listRoutes(proxy.id)
      setDetailRoute(routes.length > 0 ? routes[0] : null)
    } catch {
      setDetailRoute(null)
    }
  }

  const fetchRemote = async (platformId: string): Promise<{ id: string; owned_by?: string }[]> => {
    if (!platformId) return []
    try {
      const data = await fetchRemoteModels(platformId)
      return data.models || []
    } catch {
      message.error(t(locale, 'fetchRemoteModelsFailed'))
      return []
    }
  }

  const handleAddBackend = async (values: any) => {
    try {
      let routeId = detailRoute?.id
      if (!routeId) {
        const route = await createRoute(detailProxy.id, { lb_strategy: 'RoundRobin', backends: [values] })
        routeId = route.id
        setDetailRoute(route)
      } else {
        await addBackend(routeId, values)
      }
      message.success(t(locale, 'createSuccess'))
      setAddBackendOpen(false)
      backendForm.resetFields()
      setSelectedBackendPlatformId('')
      setRemoteModels([])
      openDetail(detailProxy)
    } catch {
      message.error(t(locale, 'createFailed'))
    }
  }

  const handleDeleteBackend = async (id: string) => {
    try {
      await deleteBackend(id)
      message.success(t(locale, 'deleteSuccess'))
      openDetail(detailProxy)
    } catch {}
  }

  const handleEditProxy = async (values: any) => {
    try {
      await updateProxy(detailProxy.id, values)
      message.success(t(locale, 'updateSuccess'))
      setEditProxyOpen(false)
      loadAll()
      openDetail({ ...detailProxy, ...values })
    } catch {
      message.error(t(locale, 'updateFailed'))
    }
  }

  const openEditProxy = () => {
    editProxyForm.setFieldsValue({ name: detailProxy.name })
    setEditProxyOpen(true)
  }

  const openUsageModal = (proxy: any) => {
    setUsageProxy(proxy)
    setUsageOpen(true)
  }

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).then(() => message.success(t(locale, 'copiedSuccess'))).catch(() => {})
  }

  const getPlatformDisplayName = (id: string) => {
    const platform = platforms.find((item: any) => item.id === id)
    if (!platform) return id
    const preset = platformPresets.find((item) => item.name === platform.name)
    return preset ? getPresetName(preset, locale) : platform.name
  }

  const getPlatformName = (id: string) => {
    const platform = platforms.find((item: any) => item.id === id)
    return platform?.name || ''
  }

  const getPresetCapabilities = (platformName: string, modelId: string): string[] => {
    const presetModels = getModelsForPlatform(platformName)
    const preset = presetModels.find((item) => item.model_id === modelId)
    return preset?.capabilities || []
  }

  const resetQuickPool = () => {
    setQuickPoolModelId('')
    setQuickPoolCandidates([])
    setQuickPoolLoading(false)
    setQuickPoolProbing(false)
  }

  const applyQuickPoolCandidates = (candidates: QuickPoolCandidate[]) => {
    const backends = candidates
      .filter((item) => item.selected)
      .map((item) => ({
        platform_id: item.platform_id,
        model_id: item.model_id,
        weight: 1,
        priority: 0,
        capabilities: item.capabilities,
      }))

    if (backends.length === 0) {
      message.warning(t(locale, 'quickPoolNoCandidates'))
      return
    }

    form.setFieldsValue({ backends })
    setCreateRemoteModels({})
    message.success(t(locale, 'quickPoolFillSuccess', String(backends.length)))
  }

  const handleScanQuickPoolCandidates = async () => {
    const targetModelId = quickPoolModelId.trim()
    if (!targetModelId) {
      message.warning(t(locale, 'quickPoolNeedModelId'))
      return
    }

    setQuickPoolLoading(true)
    try {
      const rows = await Promise.all(
        platforms.map(async (platform: any) => {
          const presetModels = getModelsForPlatform(platform.name)
          const presetMatch = presetModels.find((item) => item.model_id.toLowerCase() === targetModelId.toLowerCase())
          const remoteResult = await fetchRemoteModels(platform.id).catch(() => ({ models: [] }))
          const remoteModelsFromPlatform = Array.isArray(remoteResult?.models) ? remoteResult.models : []
          const remoteMatch = remoteModelsFromPlatform.find((item: any) => String(item.id).toLowerCase() === targetModelId.toLowerCase())
          const matchedModelId = remoteMatch?.id || presetMatch?.model_id
          if (!matchedModelId) return null

          return {
            key: `${platform.id}:${matchedModelId}`,
            platform_id: platform.id,
            platform_name: platform.name,
            platform_type: platform.type || platform.platform_type || 'OpenAI',
            model_id: matchedModelId,
            source: remoteMatch ? 'remote' : 'preset',
            capabilities: presetMatch?.capabilities || [],
            selected: true,
            probe_status: 'untested',
          } satisfies QuickPoolCandidate
        }),
      )

      const candidates = rows.filter(Boolean) as QuickPoolCandidate[]
      setQuickPoolCandidates(candidates)
      message.success(t(locale, 'quickPoolScanSuccess', String(candidates.length)))
    } catch {
      message.error(t(locale, 'loadFailed'))
    }
    setQuickPoolLoading(false)
  }

  const handleProbeQuickPoolCandidates = async () => {
    if (quickPoolCandidates.length === 0) {
      message.warning(t(locale, 'quickPoolNeedCandidates'))
      return
    }

    setQuickPoolProbing(true)
    try {
      const nextCandidates = [...quickPoolCandidates]
      for (let index = 0; index < nextCandidates.length; index += 1) {
        const item = nextCandidates[index]
        try {
          const result = await probePlatformModel(item.platform_id, {
            model_id: item.model_id,
            message: '回复一句 OK，并带上你实际命中的模型名',
            max_tokens: 64,
          })
          const category = result?.chat_probe?.category || ''
          const probeStatus = category === 'mapped_model_mismatch'
            ? 'mapped_model_mismatch'
            : category === 'cooldown'
              ? 'cooldown'
              : result?.chat_probe?.success
                ? 'available'
                : 'unavailable'

          nextCandidates[index] = {
            ...item,
            probe_status: probeStatus,
            probe_category: category,
            probe_detail: result?.chat_probe?.message || result?.models_probe?.error || '',
            actual_model: result?.actual_model || '',
            selected: probeStatus === 'available' || probeStatus === 'mapped_model_mismatch',
          }
        } catch (error: any) {
          nextCandidates[index] = {
            ...item,
            probe_status: 'unavailable',
            probe_category: 'platform_compat_issue',
            probe_detail: error?.response?.data?.error?.message || error?.message || t(locale, 'testConnectionFailed'),
            selected: false,
          }
        }
        setQuickPoolCandidates([...nextCandidates])
      }

      const healthyCandidates = nextCandidates.filter((item) => item.selected)
      applyQuickPoolCandidates(healthyCandidates)
      message.success(t(locale, 'quickPoolProbeSuccess', String(healthyCandidates.length)))
    } finally {
      setQuickPoolProbing(false)
    }
  }

  const getUsageSnippets = (proxy: any) => {
    const isRemote = window.location.hostname !== '127.0.0.1' && window.location.hostname !== 'localhost'
    const originBase = isRemote ? window.location.origin : `http://localhost:${adminPort}`
    const apiBaseUrl = `${originBase}/v1`
    const relevantKey = apiKeysList.find((item: any) => !item.proxy_id) || apiKeysList.find((item: any) => item.proxy_id === proxy.id)
    const tokenValue = relevantKey?.key || ''
    const modelName = proxy.name

    const curlOpenai = `curl ${apiBaseUrl}/chat/completions \\
  -H "Content-Type: application/json" \\
${tokenValue ? `  -H "Authorization: Bearer ${tokenValue}" \\
  ` : '  '}--data '{
    "model": "${modelName}",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 100
  }'`

    const curlAnthropic = `curl ${apiBaseUrl}/messages \\
  -H "Content-Type: application/json" \\
  -H "anthropic-version: 2023-06-01" \\
${tokenValue ? `  -H "x-api-key: ${tokenValue}" \\
  ` : '  '}--data '{
    "model": "${modelName}",
    "max_tokens": 100,
    "messages": [{"role": "user", "content": "Hello"}]
  }'`

    const pythonOpenai = `import openai

client = openai.OpenAI(
    base_url="${apiBaseUrl}",${tokenValue ? `
    api_key="${tokenValue}",` : ''}
)

response = client.chat.completions.create(
    model="${modelName}",
    messages=[{"role": "user", "content": "Hello"}],
    max_tokens=100
)
print(response.choices[0].message.content)`

    const pythonAnthropic = `import anthropic

client = anthropic.Anthropic(
    base_url="${apiBaseUrl}/messages",${tokenValue ? `
    api_key="${tokenValue}",` : ''}
)

message = client.messages.create(
    model="${modelName}",
    max_tokens=100,
    messages=[{"role": "user", "content": "Hello"}]
)
print(message.content[0].text)`

    const nodeOpenai = `import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: '${apiBaseUrl}',${tokenValue ? `
  apiKey: '${tokenValue}',` : ''}
});

const response = await client.chat.completions.create({
  model: '${modelName}',
  messages: [{ role: 'user', content: 'Hello' }],
  max_tokens: 100,
});
console.log(response.choices[0].message.content);`

    const nodeAnthropic = `import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  baseURL: '${apiBaseUrl}/messages',${tokenValue ? `
  apiKey: '${tokenValue}',` : ''}
});

const message = await client.messages.create({
  model: '${modelName}',
  max_tokens: 100,
  messages: [{ role: 'user', content: 'Hello' }],
});
console.log(message.content[0].text);`

    const ccSwitchConfig = `Base URL: ${apiBaseUrl}
API Key: ${tokenValue || '请先在 API Key 页面生成 sk-xxx'}
Model: ${modelName}`

    return [
      {
        key: 'curl',
        label: 'cURL',
        children: [
          { key: 'openai', label: 'OpenAI', code: curlOpenai },
          { key: 'anthropic', label: 'Anthropic', code: curlAnthropic },
        ],
      },
      {
        key: 'python',
        label: 'Python',
        children: [
          { key: 'openai', label: 'OpenAI', code: pythonOpenai },
          { key: 'anthropic', label: 'Anthropic', code: pythonAnthropic },
        ],
      },
      {
        key: 'node',
        label: 'Node.js',
        children: [
          { key: 'openai', label: 'OpenAI', code: nodeOpenai },
          { key: 'anthropic', label: 'Anthropic', code: nodeAnthropic },
        ],
      },
      {
        key: 'ccswitch',
        label: 'CC Switch',
        children: [{ key: 'config', label: '一键配置', code: ccSwitchConfig }],
      },
    ]
  }

  const columns = [
    {
      title: t(locale, 'name'),
      dataIndex: 'name',
      key: 'name',
      width: 180,
      render: (value: string, record: any) => {
        const route = proxyRoutes[record.id]
        const backendCount = route?.backends?.length || 0
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0' }}>
            <Tag color="purple" style={{ width: 'fit-content', fontSize: 13, padding: '2px 10px', borderRadius: 999, fontFamily: 'monospace' }}>
              {value}
            </Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {backendCount > 0 ? t(locale, 'backendAttachedCount', String(backendCount)) : t(locale, 'noBackendAttached')}
            </Text>
          </div>
        )
      },
    },
    {
      title: t(locale, 'lbStrategy'),
      key: 'strategy',
      width: 140,
      render: (_: any, record: any) => {
        const route = proxyRoutes[record.id]
        return route?.lb_strategy ? <Tag color="blue">{route.lb_strategy}</Tag> : <Text type="secondary">{t(locale, 'notConfigured')}</Text>
      },
    },
    {
      title: t(locale, 'backends'),
      key: 'backends',
      render: (_: any, record: any) => {
        const route = proxyRoutes[record.id]
        const backends = route?.backends || []
        if (backends.length === 0) return <Text type="secondary">-</Text>
        return (
          <Space size={6} wrap>
            {backends.map((backend: any) => (
              <Tag key={backend.id} style={{ borderRadius: 999, fontFamily: 'monospace', fontSize: 12 }}>
                {getPlatformDisplayName(backend.platform_id)} · {backend.model_id}
              </Tag>
            ))}
          </Space>
        )
      },
    },
    {
      title: t(locale, 'action'),
      key: 'action',
      width: 140,
      render: (_: any, record: any) => (
        <Space>
          <Button type="text" size="small" icon={<CodeOutlined />} onClick={() => openUsageModal(record)} />
          <Button type="text" size="small" icon={<SettingOutlined />} onClick={() => openDetail(record)} />
          <Popconfirm title={t(locale, 'deleteConfirm')} onConfirm={() => handleDelete(record.id)}>
            <Button type="text" danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const renderQuickPoolCandidates = () => {
    if (quickPoolCandidates.length === 0) {
      return <Text type="secondary">{t(locale, 'quickPoolNoCandidates')}</Text>
    }

    if (isMobile) {
      return (
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          {quickPoolCandidates.map((item) => (
            <Card key={item.key} size="small" style={{ borderRadius: 16 }}>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                  <div>
                    <Text strong>{getPlatformDisplayName(item.platform_id)}</Text>
                    <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Tag>{item.model_id}</Tag>
                      <Tag color={item.source === 'remote' ? 'blue' : 'default'}>{item.source === 'remote' ? t(locale, 'sourceLabel') + ': remote' : t(locale, 'sourceLabel') + ': preset'}</Tag>
                    </div>
                  </div>
                  <Tag color={item.selected ? 'success' : 'default'}>{item.selected ? t(locale, 'addedCandidate') : t(locale, 'removedCandidate')}</Tag>
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <Tag color={item.probe_status === 'available' ? 'success' : item.probe_status === 'mapped_model_mismatch' ? 'warning' : item.probe_status === 'cooldown' ? 'processing' : item.probe_status === 'untested' ? 'default' : 'error'}>
                    {item.probe_status}
                  </Tag>
                  {item.actual_model ? <Tag>{item.actual_model}</Tag> : null}
                </div>

                {item.probe_detail ? <Text type="secondary" style={{ fontSize: 12 }}>{item.probe_detail}</Text> : null}

                <Button
                  block
                  onClick={() => {
                    setQuickPoolCandidates((prev) => prev.map((candidate) => (
                      candidate.key === item.key ? { ...candidate, selected: !candidate.selected } : candidate
                    )))
                  }}
                >
                  {item.selected ? t(locale, 'removeCandidate') : t(locale, 'addCandidate')}
                </Button>
              </Space>
            </Card>
          ))}
        </Space>
      )
    }

    return (
      <Table
        size="small"
        rowKey="key"
        pagination={false}
        dataSource={quickPoolCandidates}
        rowSelection={{
          selectedRowKeys: quickPoolCandidates.filter((item) => item.selected).map((item) => item.key),
          onChange: (selectedRowKeys) => {
            const selectedKeySet = new Set(selectedRowKeys.map(String))
            setQuickPoolCandidates((prev) => prev.map((item) => ({
              ...item,
              selected: selectedKeySet.has(item.key),
            })))
          },
        }}
        columns={[
          { title: t(locale, 'platforms'), dataIndex: 'platform_name', key: 'platform_name', render: (_: string, record: QuickPoolCandidate) => <Tag>{getPlatformDisplayName(record.platform_id)}</Tag> },
          { title: t(locale, 'modelId'), dataIndex: 'model_id', key: 'model_id', render: (value: string) => <Text code>{value}</Text> },
          { title: t(locale, 'sourceLabel'), dataIndex: 'source', key: 'source', width: 90, render: (value: string) => <Tag color={value === 'remote' ? 'blue' : 'default'}>{value}</Tag> },
          { title: t(locale, 'quickPoolProbeStatus'), dataIndex: 'probe_status', key: 'probe_status', width: 130, render: (value: string) => <Tag color={value === 'available' ? 'success' : value === 'mapped_model_mismatch' ? 'warning' : value === 'cooldown' ? 'processing' : value === 'untested' ? 'default' : 'error'}>{value}</Tag> },
          { title: t(locale, 'actualModel'), dataIndex: 'actual_model', key: 'actual_model', render: (value: string) => value ? <Text code>{value}</Text> : '-' },
          { title: t(locale, 'errorCategory'), dataIndex: 'probe_category', key: 'probe_category', render: (value: string) => value || '-' },
          { title: t(locale, 'detail'), dataIndex: 'probe_detail', key: 'probe_detail', render: (value: string) => value ? <Text type="secondary">{value}</Text> : '-' },
        ]}
      />
    )
  }

  const renderBackendCards = () => {
    if (!detailRoute || !detailRoute.backends || detailRoute.backends.length === 0) {
      return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t(locale, 'noBackendModels')} />
    }

    if (isMobile) {
      return (
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          {detailRoute.backends.map((backend: any) => (
            <Card key={backend.id} size="small" style={{ borderRadius: 16 }}>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                  <div>
                    <Text strong>{getPlatformDisplayName(backend.platform_id)}</Text>
                    <div style={{ marginTop: 6 }}>
                      <Tag style={{ borderRadius: 999, fontFamily: 'monospace' }}>{backend.model_id}</Tag>
                    </div>
                  </div>
                  <Popconfirm title={t(locale, 'deleteBackend')} onConfirm={() => handleDeleteBackend(backend.id)}>
                    <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                  </Popconfirm>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                  <div>
                    <Text type="secondary">{t(locale, 'weight')}</Text>
                    <div><Text>{backend.weight}</Text></div>
                  </div>
                  <div>
                    <Text type="secondary">{t(locale, 'priority')}</Text>
                    <div><Text>{backend.priority}</Text></div>
                  </div>
                </div>
                {backend.capabilities?.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {backend.capabilities.map((capability: string) => (
                      <Tag key={capability} color={getCapabilityColor(capability)}>
                        {getCapabilityLabel(capability, locale)}
                      </Tag>
                    ))}
                  </div>
                ) : null}
              </Space>
            </Card>
          ))}
        </Space>
      )
    }

    return (
      <Table
        size="small"
        pagination={false}
        dataSource={detailRoute.backends || []}
        rowKey="id"
        columns={[
          {
            title: t(locale, 'platforms'),
            render: (_: any, record: any) => getPlatformDisplayName(record.platform_id),
          },
          {
            title: t(locale, 'models'),
            render: (_: any, record: any) => (
              <Tag style={{ borderRadius: 999, fontFamily: 'monospace' }}>
                {record.model_id}
              </Tag>
            ),
          },
          { title: t(locale, 'weight'), dataIndex: 'weight', width: 80 },
          { title: t(locale, 'priority'), dataIndex: 'priority', width: 80 },
          {
            title: '',
            width: 50,
            render: (_: any, record: any) => (
              <Popconfirm title={t(locale, 'deleteBackend')} onConfirm={() => handleDeleteBackend(record.id)}>
                <Button danger type="text" size="small" icon={<DeleteOutlined />} />
              </Popconfirm>
            ),
          },
        ]}
      />
    )
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'stretch' : 'center',
          marginBottom: 16,
          gap: 12,
          flexDirection: isMobile ? 'column' : 'row',
        }}
      >
        <div>
          <Title level={5} style={{ margin: 0 }}>{t(locale, 'proxies')}</Title>
          <div style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              统一管理虚拟模型、负载策略和后端路由
            </Text>
          </div>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)} block={isMobile}>
          {t(locale, 'newProxy')}
        </Button>
      </div>

      {proxies.length === 0 && !loading ? (
        <Card style={{ borderRadius: 24 }}>
          <Empty description={t(locale, 'noProxies')} />
        </Card>
      ) : isMobile ? (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {proxies.map((proxy: any) => {
            const route = proxyRoutes[proxy.id]
            const backends = route?.backends || []
            return (
              <Card key={proxy.id} style={{ borderRadius: 20 }}>
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                    <div>
                      <Tag color="purple" style={{ fontSize: 13, padding: '2px 10px', borderRadius: 999, fontFamily: 'monospace' }}>
                        {proxy.name}
                      </Tag>
                      <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <Tag color="blue">{route?.lb_strategy || '未配置路由'}</Tag>
                        <Tag>{backends.length} 个后端</Tag>
                      </div>
                    </div>
                    <Space>
                      <Button type="text" size="small" icon={<CodeOutlined />} onClick={() => openUsageModal(proxy)} />
                      <Button type="text" size="small" icon={<SettingOutlined />} onClick={() => openDetail(proxy)} />
                      <Popconfirm title={t(locale, 'deleteConfirm')} onConfirm={() => handleDelete(proxy.id)}>
                        <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  </div>

                  {backends.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {backends.map((backend: any) => (
                        <Tag key={backend.id} style={{ borderRadius: 999, fontFamily: 'monospace' }}>
                          {getPlatformDisplayName(backend.platform_id)} · {backend.model_id}
                        </Tag>
                      ))}
                    </div>
                  ) : (
                    <Alert type="warning" showIcon message="还没有后端模型，请进入详情配置" />
                  )}
                </Space>
              </Card>
            )
          })}
        </Space>
      ) : (
        <Card styles={{ body: { padding: 0 } }} style={{ borderRadius: 24 }}>
          <Table columns={columns} dataSource={proxies} rowKey="id" loading={loading} pagination={{ pageSize: 20, showSizeChanger: false }} />
        </Card>
      )}

      <Drawer
        title={t(locale, 'newProxy')}
        open={createOpen}
        onClose={resetCreateState}
        width={isMobile ? '100%' : 920}
        extra={<Button type="primary" onClick={() => form.submit()}>{t(locale, 'create')}</Button>}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} initialValues={{ lb_strategy: 'RoundRobin', backends: [{}] }}>
          <Card size="small" title="基础信息" style={{ marginBottom: 16, borderRadius: 20 }}>
            <Form.Item
              name="name"
              label={t(locale, 'proxyName')}
              rules={[{ required: true }]}
              extra={<Text type="secondary" style={{ fontSize: 12 }}>{t(locale, 'virtualModelPlaceholder')}</Text>}
            >
              <Input placeholder="qc480" />
            </Form.Item>
          </Card>

          <Card size="small" title={t(locale, 'quickPool')} style={{ marginBottom: 16, borderRadius: 20 }}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Text type="secondary">{t(locale, 'quickPoolDesc')}</Text>
              <Row gutter={[8, 8]}>
                <Col xs={24} md={12}>
                  <Input
                    value={quickPoolModelId}
                    onChange={(event) => setQuickPoolModelId(event.target.value)}
                    placeholder={t(locale, 'quickPoolModelIdPlaceholder')}
                  />
                </Col>
                <Col xs={24} md={12}>
                  <Space direction={isMobile ? 'vertical' : 'horizontal'} wrap style={isMobile ? { width: '100%' } : undefined}>
                    <Button onClick={handleScanQuickPoolCandidates} loading={quickPoolLoading} block={isMobile}>
                      {t(locale, 'quickPoolLoadCandidates')}
                    </Button>
                    <Button type="primary" onClick={handleProbeQuickPoolCandidates} loading={quickPoolProbing} disabled={quickPoolCandidates.length === 0} block={isMobile}>
                      {t(locale, 'quickPoolProbeCandidates')}
                    </Button>
                    <Button onClick={() => applyQuickPoolCandidates(quickPoolCandidates)} disabled={quickPoolCandidates.length === 0} block={isMobile}>
                      {t(locale, 'quickPoolOnlyHealthy')}
                    </Button>
                  </Space>
                </Col>
              </Row>
              {renderQuickPoolCandidates()}
            </Space>
          </Card>

          <Card size="small" title="路由策略" style={{ marginBottom: 16, borderRadius: 20 }}>
            <Form.Item name="lb_strategy" label={t(locale, 'lbStrategy')} style={{ marginBottom: 0 }}>
              <Select options={LB_OPTIONS} />
            </Form.Item>
          </Card>

          <Card size="small" title={t(locale, 'backendModels')} style={{ borderRadius: 20 }}>
            <Form.List name="backends">
              {(fields, { add, remove }) => (
                <>
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    {fields.map(({ key, name, ...rest }) => (
                      <Card key={key} size="small" style={{ borderRadius: 16, background: token.colorFillAlter }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <Text strong>{t(locale, 'backendModel')} #{name + 1}</Text>
                          {name > 0 ? (
                            <Button danger type="text" size="small" onClick={() => remove(name)}>
                              {t(locale, 'delete')}
                            </Button>
                          ) : null}
                        </div>

                        <Row gutter={[8, 8]}>
                          <Col xs={24} md={12}>
                            <Form.Item {...rest} name={[name, 'platform_id']} label={t(locale, 'platforms')} rules={[{ required: true }]}>
                              <Select
                                placeholder={t(locale, 'selectPlatform')}
                                options={platforms.map((platform: any) => {
                                  const preset = platformPresets.find((item) => item.name === platform.name)
                                  return { value: platform.id, label: preset ? getPresetName(preset, locale) : platform.name }
                                })}
                                onChange={async (value: string) => {
                                  form.setFieldsValue({
                                    backends: form.getFieldValue('backends')?.map((item: any, index: number) => (
                                      index === name ? { ...item, model_id: undefined, capabilities: undefined } : item
                                    )),
                                  })
                                  setCreateRemoteModels((prev) => ({ ...prev, [name]: [] }))
                                  setCreateFetching((prev) => ({ ...prev, [name]: true }))
                                  const models = await fetchRemote(value)
                                  setCreateRemoteModels((prev) => ({ ...prev, [name]: models }))
                                  setCreateFetching((prev) => ({ ...prev, [name]: false }))
                                }}
                              />
                            </Form.Item>
                          </Col>
                          <Col xs={24} md={12}>
                            <Form.Item {...rest} name={[name, 'model_id']} label={t(locale, 'models')} rules={[{ required: true }]}>
                              <Select
                                placeholder={createFetching[name] ? t(locale, 'loading') : t(locale, 'selectModel')}
                                showSearch
                                optionFilterProp="label"
                                notFoundContent={createFetching[name] ? <LoadingOutlined /> : undefined}
                                options={(() => {
                                  const backends = form.getFieldValue('backends') || []
                                  const platformId = backends[name]?.platform_id
                                  const platformName = getPlatformName(platformId)
                                  const remoteItems = createRemoteModels[name] || []
                                  const presetModels = getModelsForPlatform(platformName)
                                  const remoteIds = new Set(remoteItems.map((item) => item.id))
                                  const presetOnly = presetModels.filter((item) => !remoteIds.has(item.model_id))
                                  const remoteOptions = remoteItems.map((item) => {
                                    const preset = presetModels.find((model) => model.model_id === item.id)
                                    const display = preset ? `${locale === 'zh' ? preset.display_name_zh : preset.display_name} (${item.id})` : item.id
                                    return { value: item.id, label: display }
                                  })
                                  const presetOptions = presetOnly.map((item) => ({
                                    value: item.model_id,
                                    label: `${locale === 'zh' ? item.display_name_zh : item.display_name} (${item.model_id})`,
                                  }))
                                  return [...remoteOptions, ...presetOptions]
                                })()}
                                onChange={(value: string) => {
                                  const backends = form.getFieldValue('backends') || []
                                  const platformId = backends[name]?.platform_id
                                  const platformName = getPlatformName(platformId)
                                  const capabilities = getPresetCapabilities(platformName, value)
                                  if (capabilities.length > 0) {
                                    form.setFieldsValue({
                                      backends: form.getFieldValue('backends')?.map((item: any, index: number) => (
                                        index === name ? { ...item, capabilities } : item
                                      )),
                                    })
                                  }
                                }}
                              />
                            </Form.Item>
                          </Col>
                        </Row>

                        <Row gutter={[8, 8]}>
                          <Col xs={24} md={8}>
                            <Form.Item {...rest} name={[name, 'weight']} label={t(locale, 'weight')} initialValue={1}>
                              <InputNumber min={1} style={{ width: '100%' }} />
                            </Form.Item>
                          </Col>
                          <Col xs={24} md={8}>
                            <Form.Item {...rest} name={[name, 'priority']} label={t(locale, 'priority')} initialValue={0}>
                              <InputNumber min={0} style={{ width: '100%' }} />
                            </Form.Item>
                          </Col>
                          <Col xs={24} md={8}>
                            <Form.Item {...rest} name={[name, 'capabilities']} label={t(locale, 'capabilities')}>
                              <Select
                                mode="multiple"
                                placeholder={t(locale, 'selectCapabilities')}
                                options={CAPABILITY_OPTIONS.map((item) => ({ value: item.value, label: locale === 'zh' ? item.labelZh : item.labelEn }))}
                              />
                            </Form.Item>
                          </Col>
                        </Row>
                      </Card>
                    ))}
                  </Space>
                  <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />} style={{ marginTop: 12 }}>
                    {t(locale, 'addBackendModel')}
                  </Button>
                </>
              )}
            </Form.List>
          </Card>
        </Form>
      </Drawer>

      <Modal
        title={`${t(locale, 'usageCode')} - ${usageProxy?.name || ''}`}
        open={usageOpen}
        onCancel={() => setUsageOpen(false)}
        footer={null}
        width={isMobile ? 'calc(100vw - 24px)' : 720}
      >
        {usageProxy ? (
          <Tabs
            items={getUsageSnippets(usageProxy).map((language) => ({
              key: language.key,
              label: language.label,
              children: (
                <Tabs
                  type="card"
                  size="small"
                  items={language.children.map((protocol) => ({
                    key: protocol.key,
                    label: protocol.label,
                    children: (
                      <div style={{ position: 'relative' }}>
                        <pre
                          style={{
                            background: 'var(--ant-color-bg-container)',
                            border: '1px solid var(--ant-color-border)',
                            borderRadius: 8,
                            padding: 16,
                            fontSize: 13,
                            lineHeight: 1.6,
                            overflow: 'auto',
                            maxHeight: 400,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                          }}
                        >
                          {protocol.code}
                        </pre>
                        <Button
                          size="small"
                          icon={<CopyOutlined />}
                          style={{ position: 'absolute', top: 8, right: 8 }}
                          onClick={() => copyText(protocol.code)}
                        />
                      </div>
                    ),
                  }))}
                />
              ),
            }))}
          />
        ) : null}
      </Modal>

      <Drawer
        title={`${t(locale, 'proxyConfig')} - ${detailProxy?.name || ''}`}
        open={!!detailProxy}
        onClose={() => {
          setDetailProxy(null)
          setDetailRoute(null)
        }}
        width={isMobile ? '100%' : 760}
      >
        {detailProxy ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card size="small" style={{ borderRadius: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <Text strong style={{ fontSize: 14 }}>{t(locale, 'editProxyInfo')}</Text>
                <Button size="small" onClick={openEditProxy}>{t(locale, 'edit')}</Button>
              </div>
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label={t(locale, 'name')}>
                  <Tag color="purple" style={{ fontSize: 13, padding: '2px 10px', borderRadius: 999, fontFamily: 'monospace' }}>
                    {detailProxy.name}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label={t(locale, 'lbStrategy')}>
                  {detailRoute?.lb_strategy ? <Tag color="blue">{detailRoute.lb_strategy}</Tag> : <Text type="secondary">未配置</Text>}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Card
              size="small"
              style={{ borderRadius: 20 }}
              title={t(locale, 'backendModels')}
              extra={<Button type="link" size="small" icon={<PlusOutlined />} onClick={() => setAddBackendOpen(true)}>{t(locale, 'add')}</Button>}
            >
              {renderBackendCards()}
            </Card>
          </Space>
        ) : null}
      </Drawer>

      <Drawer
        title={t(locale, 'editProxyInfo')}
        open={editProxyOpen}
        onClose={() => setEditProxyOpen(false)}
        width={isMobile ? '100%' : 420}
        extra={<Button type="primary" onClick={() => editProxyForm.submit()}>{t(locale, 'save')}</Button>}
      >
        <Form form={editProxyForm} layout="vertical" onFinish={handleEditProxy}>
          <Form.Item name="name" label={t(locale, 'proxyName')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </Form>
      </Drawer>

      <Modal
        title={t(locale, 'addBackendModel')}
        open={addBackendOpen}
        onCancel={() => {
          setAddBackendOpen(false)
          setSelectedBackendPlatformId('')
          setRemoteModels([])
        }}
        onOk={() => backendForm.submit()}
        width={isMobile ? 'calc(100vw - 24px)' : 560}
      >
        <Form form={backendForm} layout="vertical" onFinish={handleAddBackend}>
          <Form.Item name="platform_id" label={t(locale, 'platforms')} rules={[{ required: true }]}> 
            <Select
              options={platforms.map((platform: any) => {
                const preset = platformPresets.find((item) => item.name === platform.name)
                return { value: platform.id, label: preset ? getPresetName(preset, locale) : platform.name }
              })}
              onChange={async (value: string) => {
                setSelectedBackendPlatformId(value)
                backendForm.setFieldsValue({ model_id: undefined, capabilities: undefined })
                setRemoteModels([])
                setFetchingRemote(true)
                const models = await fetchRemote(value)
                setRemoteModels(models)
                setFetchingRemote(false)
              }}
            />
          </Form.Item>
          <Form.Item name="model_id" label={t(locale, 'models')} rules={[{ required: true }]}> 
            <Select
              showSearch
              optionFilterProp="label"
              notFoundContent={fetchingRemote ? <LoadingOutlined /> : undefined}
              placeholder={fetchingRemote ? t(locale, 'loading') : t(locale, 'selectModel')}
              options={(() => {
                const platformName = getPlatformName(selectedBackendPlatformId)
                const presetModels = getModelsForPlatform(platformName)
                const remoteIds = new Set(remoteModels.map((item) => item.id))
                const presetOnly = presetModels.filter((item) => !remoteIds.has(item.model_id))
                const remoteOptions = remoteModels.map((item) => {
                  const preset = presetModels.find((model) => model.model_id === item.id)
                  const display = preset ? `${locale === 'zh' ? preset.display_name_zh : preset.display_name} (${item.id})` : item.id
                  return { value: item.id, label: display }
                })
                const presetOptions = presetOnly.map((item) => ({
                  value: item.model_id,
                  label: `${locale === 'zh' ? item.display_name_zh : item.display_name} (${item.model_id})`,
                }))
                return [...remoteOptions, ...presetOptions]
              })()}
              onChange={(value: string) => {
                const platformName = getPlatformName(selectedBackendPlatformId)
                const capabilities = getPresetCapabilities(platformName, value)
                if (capabilities.length > 0) {
                  backendForm.setFieldsValue({ capabilities })
                }
              }}
            />
          </Form.Item>
          <Form.Item name="capabilities" label={t(locale, 'capabilities')}>
            <Select
              mode="multiple"
              placeholder={t(locale, 'selectCapabilities')}
              options={CAPABILITY_OPTIONS.map((item) => ({ value: item.value, label: locale === 'zh' ? item.labelZh : item.labelEn }))}
            />
          </Form.Item>
          <Form.Item name="weight" label={t(locale, 'weight')} initialValue={1}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="priority" label={t(locale, 'priority')} initialValue={0}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
