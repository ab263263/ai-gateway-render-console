import { useEffect, useState } from 'react'
import {
  Button, Table, Modal, Form, Input, Select, Tag, Space,
  message, Card, Drawer, Descriptions, Divider, Row, Col, Popconfirm, Typography, InputNumber, Tabs, Grid,
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, LoadingOutlined,
  SettingOutlined, CodeOutlined, CopyOutlined,
} from '@ant-design/icons'
import {
  listProxies, createProxy, updateProxy, deleteProxy,
  listRoutes, createRoute, deleteRoute,
  listBackends, addBackend, deleteBackend,
  listPlatforms, fetchRemoteModels, probePlatformModel, getSettings, listApiKeys as fetchApiKeys,
} from '../api'

import { useAppContext } from '../ThemeContext'
import { t } from '../i18n'
import { getPresetName, platformPresets, getCapabilityLabel, getCapabilityColor, CAPABILITY_OPTIONS, getModelsForPlatform } from '../presets'

const { Text, Title } = Typography

const LB_OPTIONS = [
  { value: 'RoundRobin', label: t('zh', 'roundRobin') },
  { value: 'WeightedRandom', label: t('zh', 'weightedRandom') },
  { value: 'LeastConnections', label: t('zh', 'leastConnections') },
  { value: 'Priority', label: t('zh', 'priorityMode') },
  { value: 'LatencyBased', label: t('zh', 'latencyBased') },
]

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
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const { locale } = useAppContext()

  const [detailProxy, setDetailProxy] = useState<any>(null)
  const [detailRoute, setDetailRoute] = useState<any>(null)
  const [addBackendModalOpen, setAddBackendModalOpen] = useState(false)
  const [backendForm] = Form.useForm()
  const [selectedBackendPlatformId, setSelectedBackendPlatformId] = useState<string>('')
  const [remoteModels, setRemoteModels] = useState<{ id: string; owned_by?: string }[]>([])
  const [fetchingRemote, setFetchingRemote] = useState(false)

  const [editProxyModalOpen, setEditProxyModalOpen] = useState(false)
  const [editProxyForm] = Form.useForm()

  const [usageModalOpen, setUsageModalOpen] = useState(false)
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

  useEffect(() => { loadAll(); loadAdminPort() }, [])


  const loadAdminPort = async () => {
    try { const settings = await getSettings(); setAdminPort(settings.admin_port) } catch {}
  }

  const loadAll = async () => {
    setLoading(true)
    try {
      const [p, pl, ak] = await Promise.all([listProxies(), listPlatforms(), fetchApiKeys().catch(() => [])])
      setProxies(p); setPlatforms(pl); setApiKeysList(ak)
      const routeMap: Record<string, any> = {}
      await Promise.all(p.map(async (proxy: any) => {
        try {
          const routes = await listRoutes(proxy.id)
          if (routes.length > 0) routeMap[proxy.id] = routes[0]
        } catch {}
      }))
      setProxyRoutes(routeMap)
    } catch {}
    setLoading(false)
  }

  const handleCreate = async (values: any) => {
    try {
      const backends = values.backends || []
      const proxy = await createProxy({ name: values.name })
      if (backends.length > 0) {
        await createRoute(proxy.id, {
          lb_strategy: values.lb_strategy || 'RoundRobin',
          backends: backends.filter((b: any) => b.platform_id && b.model_id),
        })
      }
      message.success(t(locale, 'createSuccess'))
      setCreateModalOpen(false)
      form.resetFields()
      setCreateRemoteModels({})
      setCreateFetching({})
      loadAll()
    } catch { message.error(t(locale, 'createFailed')) }
  }

  const handleDelete = async (id: string) => {
    try { await deleteProxy(id); message.success(t(locale, 'deleteSuccess')); loadAll() } catch {}
  }

  const openDetail = async (proxy: any) => {
    setDetailProxy(proxy)
    try {
      const routes = await listRoutes(proxy.id)
      setDetailRoute(routes.length > 0 ? routes[0] : null)
    } catch { setDetailRoute(null) }
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
      setAddBackendModalOpen(false)
      backendForm.resetFields()
      setSelectedBackendPlatformId('')
      setRemoteModels([])
      openDetail(detailProxy)
    } catch { message.error(t(locale, 'createFailed')) }
  }

  const handleDeleteBackend = async (id: string) => {
    try { await deleteBackend(id); message.success(t(locale, 'deleteSuccess')); openDetail(detailProxy) } catch {}
  }

  const handleEditProxy = async (values: any) => {
    try {
      await updateProxy(detailProxy.id, values)
      message.success(t(locale, 'updateSuccess'))
      setEditProxyModalOpen(false)
      loadAll()
      openDetail({ ...detailProxy, ...values })
    } catch { message.error(t(locale, 'updateFailed')) }
  }

  const openEditProxy = () => {
    editProxyForm.setFieldsValue({ name: detailProxy.name })
    setEditProxyModalOpen(true)
  }

  const openUsageModal = (proxy: any) => {
    setUsageProxy(proxy)
    setUsageModalOpen(true)
  }

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).then(() => message.success('Copied!')).catch(() => {})
  }

  const getPlatformDisplayName = (id: string) => {
    const plat = platforms.find((p: any) => p.id === id)
    if (!plat) return id
    const preset = platformPresets.find(p => p.name === plat.name)
    return preset ? getPresetName(preset, locale) : plat.name
  }

  const getPlatformName = (id: string) => {
    const plat = platforms.find((p: any) => p.id === id)
    return plat?.name || ''
  }

  const getPresetCapabilities = (platformName: string, modelId: string): string[] => {
    const presetModels = getModelsForPlatform(platformName)
    const preset = presetModels.find(m => m.model_id === modelId)
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
      .filter(item => item.selected)
      .map(item => ({
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
      const rows = await Promise.all(platforms.map(async (platform: any) => {
        const presetModels = getModelsForPlatform(platform.name)
        const presetMatch = presetModels.find(m => m.model_id.toLowerCase() === targetModelId.toLowerCase())
        const remoteResult = await fetchRemoteModels(platform.id).catch(() => ({ models: [] }))
        const remoteModels = Array.isArray(remoteResult?.models) ? remoteResult.models : []
        const remoteMatch = remoteModels.find((m: any) => String(m.id).toLowerCase() === targetModelId.toLowerCase())
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
      }))

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
      for (let i = 0; i < nextCandidates.length; i += 1) {
        const item = nextCandidates[i]
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

          nextCandidates[i] = {
            ...item,
            probe_status: probeStatus,
            probe_category: category,
            probe_detail: result?.chat_probe?.message || result?.models_probe?.error || '',
            actual_model: result?.actual_model || '',
            selected: probeStatus === 'available' || probeStatus === 'mapped_model_mismatch',
          }
        } catch (e: any) {
          nextCandidates[i] = {
            ...item,
            probe_status: 'unavailable',
            probe_category: 'platform_compat_issue',
            probe_detail: e?.response?.data?.error?.message || e?.message || t(locale, 'testConnectionFailed'),
            selected: false,
          }
        }
        setQuickPoolCandidates([...nextCandidates])
      }

      const healthy = nextCandidates.filter(item => item.selected)
      applyQuickPoolCandidates(healthy)
      message.success(t(locale, 'quickPoolProbeSuccess', String(healthy.length)))
    } finally {
      setQuickPoolProbing(false)
    }
  }

  const columns = [

    {
      title: t(locale, 'name'),
      dataIndex: 'name',
      key: 'name',
      width: 160,
      render: (v: string) => <Tag color="purple" style={{ fontSize: 13, padding: '2px 10px', borderRadius: 4, fontFamily: 'monospace' }}>{v}</Tag>,
    },
    {
      title: t(locale, 'backends'),
      key: 'backends',
      render: (_: any, record: any) => {
        const route = proxyRoutes[record.id]
        const backends = route?.backends || []
        if (backends.length === 0) return <Text type="secondary">-</Text>
        return (
          <Space size={4} wrap>
            {backends.map((b: any) => (
              <Tag key={b.id} style={{ borderRadius: 4, fontFamily: 'monospace', fontSize: 12 }}>{getPlatformDisplayName(b.platform_id)}·{b.model_id}</Tag>
            ))}
          </Space>
        )
      },
    },
    {
      title: t(locale, 'action'),
      key: 'action',
      width: isMobile ? 132 : 120,
      render: (_: any, record: any) => (
        <Space direction={isMobile ? 'vertical' : 'horizontal'} size={isMobile ? 4 : 8}>
          <Button type="text" size="small" icon={<CodeOutlined />} onClick={() => openUsageModal(record)} block={isMobile} />
          <Button type="text" size="small" icon={<SettingOutlined />} onClick={() => openDetail(record)} block={isMobile} />
          <Popconfirm title={t(locale, 'deleteConfirm')} onConfirm={() => handleDelete(record.id)}>
            <Button type="text" danger size="small" icon={<DeleteOutlined />} block={isMobile} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const getUsageSnippets = (proxy: any) => {
    const isRemote = window.location.hostname !== '127.0.0.1' && window.location.hostname !== 'localhost'
    const originBase = isRemote ? window.location.origin : `http://localhost:${adminPort}`
    const apiBaseUrl = `${originBase}/v1`
    const relevantKey = apiKeysList.find((k: any) => !k.proxy_id) || apiKeysList.find((k: any) => k.proxy_id === proxy.id)
    const token = relevantKey?.key || ''
    const modelName = proxy.name

    const curlOpenai = `curl ${apiBaseUrl}/chat/completions \\
  -H "Content-Type: application/json" \\
${token ? `  -H "Authorization: Bearer ${token}" \\
  ` : '  '}--data '{
    "model": "${modelName}",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 100
  }'`

    const curlAnthropic = `curl ${apiBaseUrl}/messages \\
  -H "Content-Type: application/json" \\
  -H "anthropic-version: 2023-06-01" \\
${token ? `  -H "x-api-key: ${token}" \\
  ` : '  '}--data '{
    "model": "${modelName}",
    "max_tokens": 100,
    "messages": [{"role": "user", "content": "Hello"}]
  }'`

    const pythonOpenai = `import openai

client = openai.OpenAI(
    base_url="${apiBaseUrl}",${token ? `
    api_key="${token}",` : ''}
)

response = client.chat.completions.create(
    model="${modelName}",
    messages=[{"role": "user", "content": "Hello"}],
    max_tokens=100
)
print(response.choices[0].message.content)`

    const pythonAnthropic = `import anthropic

client = anthropic.Anthropic(
    base_url="${apiBaseUrl}/messages",${token ? `
    api_key="${token}",` : ''}
)

message = client.messages.create(
    model="${modelName}",
    max_tokens=100,
    messages=[{"role": "user", "content": "Hello"}]
)
print(message.content[0].text)`

    const nodeOpenai = `import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: '${apiBaseUrl}',${token ? `
  apiKey: '${token}',` : ''}
});

const response = await client.chat.completions.create({
  model: '${modelName}',
  messages: [{ role: 'user', content: 'Hello' }],
  max_tokens: 100,
});
console.log(response.choices[0].message.content);`

    const nodeAnthropic = `import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  baseURL: '${apiBaseUrl}/messages',${token ? `
  apiKey: '${token}',` : ''}
});

const message = await client.messages.create({
  model: '${modelName}',
  max_tokens: 100,
  messages: [{ role: 'user', content: 'Hello' }],
});
console.log(message.content[0].text);`

    const ccSwitchConfig = `Base URL: ${apiBaseUrl}
API Key: ${token || '请先在 API Key 页面生成 sk-xxx'}
Model: ${modelName}`

    return [
      { key: 'curl', label: 'cURL', children: [
        { key: 'openai', label: 'OpenAI', code: curlOpenai },
        { key: 'anthropic', label: 'Anthropic', code: curlAnthropic },
      ]},
      { key: 'python', label: 'Python', children: [
        { key: 'openai', label: 'OpenAI', code: pythonOpenai },
        { key: 'anthropic', label: 'Anthropic', code: pythonAnthropic },
      ]},
      { key: 'node', label: 'Node.js', children: [
        { key: 'openai', label: 'OpenAI', code: nodeOpenai },
        { key: 'anthropic', label: 'Anthropic', code: nodeAnthropic },
      ]},
      { key: 'ccswitch', label: 'CC Switch', children: [
        { key: 'config', label: '一键配置', code: ccSwitchConfig },
      ]},
    ]
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
        <Title level={5} style={{ margin: 0 }}>{t(locale, 'proxies')}</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)} block={isMobile}>{t(locale, 'newProxy')}</Button>
      </div>

      <Card styles={{ body: { padding: 0 } }}>
        <Table columns={columns} dataSource={proxies} rowKey="id" loading={loading} pagination={{ pageSize: 20, showSizeChanger: false }} />
      </Card>

      <Modal title={t(locale, 'newProxy')} open={createModalOpen} onCancel={() => { setCreateModalOpen(false); setCreateRemoteModels({}); setCreateFetching({}); resetQuickPool() }} onOk={() => form.submit()} width={860}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="name" label={t(locale, 'proxyName')} rules={[{ required: true }]}
            extra={<Text type="secondary" style={{ fontSize: 12 }}>{t(locale, 'virtualModelPlaceholder')}</Text>}>
            <Input placeholder="qc480" />
          </Form.Item>
          <Card size="small" title={t(locale, 'quickPool')} style={{ marginBottom: 16 }}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Text type="secondary">{t(locale, 'quickPoolDesc')}</Text>
              <Row gutter={[8, 8]}>
                <Col xs={24} md={12}>
                  <Input
                    value={quickPoolModelId}
                    onChange={(e) => setQuickPoolModelId(e.target.value)}
                    placeholder={t(locale, 'quickPoolModelIdPlaceholder')}
                  />
                </Col>
                <Col xs={24} md={12}>
                  <Space direction={isMobile ? 'vertical' : 'horizontal'} wrap style={isMobile ? { width: '100%' } : undefined}>
                    <Button onClick={handleScanQuickPoolCandidates} loading={quickPoolLoading} block={isMobile}>{t(locale, 'quickPoolLoadCandidates')}</Button>
                    <Button type="primary" onClick={handleProbeQuickPoolCandidates} loading={quickPoolProbing} disabled={quickPoolCandidates.length === 0} block={isMobile}>{t(locale, 'quickPoolProbeCandidates')}</Button>
                    <Button onClick={() => applyQuickPoolCandidates(quickPoolCandidates)} disabled={quickPoolCandidates.length === 0} block={isMobile}>{t(locale, 'quickPoolOnlyHealthy')}</Button>
                  </Space>
                </Col>
              </Row>
              {quickPoolCandidates.length === 0 ? (
                <Text type="secondary">{t(locale, 'quickPoolNoCandidates')}</Text>
              ) : (
                <Table
                  size="small"
                  rowKey="key"
                  pagination={false}
                  dataSource={quickPoolCandidates}
                  rowSelection={{
                    selectedRowKeys: quickPoolCandidates.filter(item => item.selected).map(item => item.key),
                    onChange: (selectedRowKeys) => {
                      const selectedKeySet = new Set(selectedRowKeys.map(String))
                      setQuickPoolCandidates(prev => prev.map(item => ({
                        ...item,
                        selected: selectedKeySet.has(item.key),
                      })))
                    },
                  }}
                  columns={[
                    { title: t(locale, 'platforms'), dataIndex: 'platform_name', key: 'platform_name', render: (v: string) => <Tag>{v}</Tag> },
                    { title: t(locale, 'modelId'), dataIndex: 'model_id', key: 'model_id', render: (v: string) => <Text code>{v}</Text> },
                    { title: 'Source', dataIndex: 'source', key: 'source', width: 90, render: (v: string) => <Tag color={v === 'remote' ? 'blue' : 'default'}>{v}</Tag> },
                    { title: t(locale, 'quickPoolProbeStatus'), dataIndex: 'probe_status', key: 'probe_status', width: 130, render: (v: string) => <Tag color={v === 'available' ? 'success' : v === 'mapped_model_mismatch' ? 'warning' : v === 'cooldown' ? 'processing' : v === 'untested' ? 'default' : 'error'}>{v}</Tag> },
                    { title: t(locale, 'actualModel'), dataIndex: 'actual_model', key: 'actual_model', render: (v: string) => v ? <Text code>{v}</Text> : '-' },
                    { title: t(locale, 'errorCategory'), dataIndex: 'probe_category', key: 'probe_category', render: (v: string) => v || '-' },
                    { title: t(locale, 'detail'), dataIndex: 'probe_detail', key: 'probe_detail', render: (v: string) => v ? <Text type="secondary">{v}</Text> : '-' },
                  ]}
                />
              )}
            </Space>
          </Card>
          <Form.Item name="lb_strategy" label={t(locale, 'lbStrategy')} initialValue="RoundRobin">
            <Select options={LB_OPTIONS} />
          </Form.Item>
          <Form.List name="backends" initialValue={[{}]} >

            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...rest }) => (
                  <div key={key} style={{ border: '1px solid var(--ant-color-border-secondary)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Text strong style={{ fontSize: 12 }}>{t(locale, 'backendModel')} #{name + 1}</Text>
                      {name > 0 && <Button danger type="text" size="small" onClick={() => remove(name)}>{t(locale, 'delete')}</Button>}
                    </div>
                    <Row gutter={8}>
                      <Col span={12}>
                        <Form.Item {...rest} name={[name, 'platform_id']} style={{ marginBottom: 8 }} rules={[{ required: true }]}>
                          <Select
                            placeholder={t(locale, 'selectPlatform')}
                            size="small"
                            options={platforms.map((p: any) => {
                              const preset = platformPresets.find(pr => pr.name === p.name)
                              return { value: p.id, label: preset ? getPresetName(preset, locale) : p.name }
                            })}
                            onChange={async (value: string) => {
                              form.setFieldsValue({ backends: form.getFieldValue('backends')?.map((b: any, i: number) => i === name ? { ...b, model_id: undefined, capabilities: undefined } : b) })
                              setCreateRemoteModels(prev => ({ ...prev, [name]: [] }))
                              setCreateFetching(prev => ({ ...prev, [name]: true }))
                              const models = await fetchRemote(value)
                              setCreateRemoteModels(prev => ({ ...prev, [name]: models }))
                              setCreateFetching(prev => ({ ...prev, [name]: false }))
                            }}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item {...rest} name={[name, 'model_id']} style={{ marginBottom: 8 }} rules={[{ required: true }]}>
                          <Select
                            placeholder={createFetching[name] ? t(locale, 'loading') : t(locale, 'selectModel')}
                            size="small"
                            showSearch
                            optionFilterProp="label"
                            notFoundContent={createFetching[name] ? <LoadingOutlined /> : undefined}
                            options={(() => {
                              const backends = form.getFieldValue('backends') || []
                              const pid = backends[name]?.platform_id
                              const pName = getPlatformName(pid)
                              const remote = createRemoteModels[name] || []
                              const presetMs = getModelsForPlatform(pName)
                              const remoteIds = new Set(remote.map(m => m.id))
                              const presetOnly = presetMs.filter(m => !remoteIds.has(m.model_id))
                              const remoteOpts = remote.map(m => {
                                const pm = presetMs.find(p => p.model_id === m.id)
                                const display = pm ? `${locale === 'zh' ? pm.display_name_zh : pm.display_name} (${m.id})` : m.id
                                return { value: m.id, label: display }
                              })
                              const presetOpts = presetOnly.map(m => ({
                                value: m.model_id,
                                label: `${locale === 'zh' ? m.display_name_zh : m.display_name} (${m.model_id})`,
                              }))
                              return [...remoteOpts, ...presetOpts]
                            })()}
                            onChange={(value: string) => {
                              const backends = form.getFieldValue('backends') || []
                              const pid = backends[name]?.platform_id
                              const pName = getPlatformName(pid)
                              const caps = getPresetCapabilities(pName, value)
                              if (caps.length > 0) {
                                form.setFieldsValue({ backends: form.getFieldValue('backends')?.map((b: any, i: number) => i === name ? { ...b, capabilities: caps } : b) })
                              }
                            }}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={8}>
                      <Col span={8}>
                        <Form.Item {...rest} name={[name, 'weight']} initialValue={1} style={{ marginBottom: 0 }}>
                          <InputNumber min={1} placeholder={t(locale, 'weight')} size="small" style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item {...rest} name={[name, 'priority']} initialValue={0} style={{ marginBottom: 0 }}>
                          <InputNumber min={0} placeholder={t(locale, 'priority')} size="small" style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item {...rest} name={[name, 'capabilities']} style={{ marginBottom: 0 }}>
                          <Select mode="multiple" size="small" placeholder={t(locale, 'capabilities')} style={{ width: '100%' }} options={CAPABILITY_OPTIONS.map(c => ({ value: c.value, label: locale === 'zh' ? c.labelZh : c.labelEn }))} />
                        </Form.Item>
                      </Col>
                    </Row>
                  </div>
                ))}
                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>{t(locale, 'addBackendModel')}</Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>

      <Modal title={`${t(locale, 'usageCode')} - ${usageProxy?.name || ''}`} open={usageModalOpen} onCancel={() => setUsageModalOpen(false)} footer={null} width={720}>
        {usageProxy && (
          <div>
            <Tabs items={getUsageSnippets(usageProxy).map(lang => ({
              key: lang.key,
              label: lang.label,
              children: (
                <Tabs
                  type="card"
                  size="small"
                  items={lang.children.map(proto => ({
                    key: proto.key,
                    label: proto.label,
                    children: (
                      <div style={{ position: 'relative' }}>
                        <pre style={{
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
                        }}>
                          {proto.code}
                        </pre>
                        <Button
                          size="small"
                          icon={<CopyOutlined />}
                          style={{ position: 'absolute', top: 8, right: 8 }}
                          onClick={() => copyText(proto.code)}
                        />
                      </div>
                    ),
                  }))}
                />
              ),
            }))} />
          </div>
        )}
      </Modal>

      <Drawer title={`${t(locale, 'proxyConfig')} - ${detailProxy?.name || ''}`} open={!!detailProxy} onClose={() => { setDetailProxy(null); setDetailRoute(null) }} width={720}>
        {detailProxy && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text strong style={{ fontSize: 14 }}>{t(locale, 'editProxyInfo')}</Text>
              <Button size="small" onClick={openEditProxy}>{t(locale, 'edit')}</Button>
            </div>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label={t(locale, 'name')}>
                <Tag color="purple" style={{ fontSize: 13, padding: '2px 10px', borderRadius: 4, fontFamily: 'monospace' }}>{detailProxy.name}</Tag>
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="left" style={{ marginTop: 20 }}>
              {t(locale, 'backendModels')}
              <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => setAddBackendModalOpen(true)}>{t(locale, 'add')}</Button>
            </Divider>

            {!detailRoute || !detailRoute.backends || detailRoute.backends.length === 0 ? (
              <Text type="secondary">{t(locale, 'noBackendModels')}</Text>
            ) : (
              <Card size="small" style={{ borderRadius: 8 }} styles={{ body: { padding: '12px 16px' } }}>
                <div style={{ marginBottom: 8 }}>
                  <Tag style={{ borderRadius: 4 }}>{detailRoute.lb_strategy}</Tag>
                </div>
                <Table
                  size="small" pagination={false}
                  dataSource={detailRoute.backends || []} rowKey="id"
                  columns={[
                    { title: t(locale, 'platforms').slice(0, 2), render: (_: any, r: any) => getPlatformDisplayName(r.platform_id) },
                    { title: t(locale, 'models').slice(0, 2), render: (_: any, r: any) => <Tag style={{ borderRadius: 4, fontFamily: 'monospace' }}>{getPlatformDisplayName(r.platform_id)}·{r.model_id}</Tag> },
                    { title: t(locale, 'weight'), dataIndex: 'weight', width: 60 },
                    { title: t(locale, 'priority'), dataIndex: 'priority', width: 60 },
                    {
                      title: '', width: 40,
                      render: (_: any, r: any) => (
                        <Popconfirm title={t(locale, 'deleteBackend')} onConfirm={() => handleDeleteBackend(r.id)}>
                          <Button danger type="text" size="small" icon={<DeleteOutlined />} />
                        </Popconfirm>
                      ),
                    },
                  ]}
                />
              </Card>
            )}
          </div>
        )}
      </Drawer>

      <Modal title={t(locale, 'editProxyInfo')} open={editProxyModalOpen} onCancel={() => setEditProxyModalOpen(false)} onOk={() => editProxyForm.submit()}>
        <Form form={editProxyForm} layout="vertical" onFinish={handleEditProxy}>
          <Form.Item name="name" label={t(locale, 'proxyName')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={t(locale, 'addBackendModel')} open={addBackendModalOpen} onCancel={() => { setAddBackendModalOpen(false); setSelectedBackendPlatformId(''); setRemoteModels([]) }} onOk={() => backendForm.submit()}>
        <Form form={backendForm} layout="vertical" onFinish={handleAddBackend}>
          <Form.Item name="platform_id" label={t(locale, 'platforms')} rules={[{ required: true }]}>
            <Select
              options={platforms.map((p: any) => {
                const preset = platformPresets.find(pr => pr.name === p.name)
                return { value: p.id, label: preset ? getPresetName(preset, locale) : p.name }
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
                const pName = getPlatformName(selectedBackendPlatformId)
                const presetMs = getModelsForPlatform(pName)
                const remoteIds = new Set(remoteModels.map(m => m.id))
                const presetOnly = presetMs.filter(m => !remoteIds.has(m.model_id))
                const remoteOpts = remoteModels.map(m => {
                  const pm = presetMs.find(p => p.model_id === m.id)
                  const display = pm ? `${locale === 'zh' ? pm.display_name_zh : pm.display_name} (${m.id})` : m.id
                  return { value: m.id, label: display }
                })
                const presetOpts = presetOnly.map(m => ({
                  value: m.model_id,
                  label: `${locale === 'zh' ? m.display_name_zh : m.display_name} (${m.model_id})`,
                }))
                return [...remoteOpts, ...presetOpts]
              })()}
              onChange={(value: string) => {
                const pName = getPlatformName(selectedBackendPlatformId)
                const caps = getPresetCapabilities(pName, value)
                if (caps.length > 0) {
                  backendForm.setFieldsValue({ capabilities: caps })
                }
              }}
            />
          </Form.Item>
          <Form.Item name="capabilities" label={t(locale, 'capabilities')}>
            <Select mode="multiple" placeholder={t(locale, 'selectCapabilities')} options={CAPABILITY_OPTIONS.map(c => ({ value: c.value, label: locale === 'zh' ? c.labelZh : c.labelEn }))} />
          </Form.Item>
          <Form.Item name="weight" label={t(locale, 'weight')} initialValue={1}>
            <InputNumber min={1} />
          </Form.Item>
          <Form.Item name="priority" label={t(locale, 'priority')} initialValue={0}>
            <InputNumber min={0} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
