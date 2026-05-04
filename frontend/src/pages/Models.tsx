import { useEffect, useMemo, useState } from 'react'
import {
  Table,
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Tag,
  Space,
  message,
  Popconfirm,
  Card,
  Typography,
  Tooltip,
  Grid,
  Row,
  Col,
  Statistic,
  Empty,
  theme,
  Alert,
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  ApiOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  CloudDownloadOutlined,
  AppstoreOutlined,
  ThunderboltOutlined,
  LinkOutlined,
} from '@ant-design/icons'
import { listModels, createModel, updateModel, deleteModel, listPlatforms, testModelConnection, fetchRemoteModels } from '../api'
import { useAppContext } from '../ThemeContext'
import { t } from '../i18n'
import { getModelsForPlatform, getModelDisplayName, getPresetName, platformPresets, CAPABILITY_OPTIONS, getCapabilityLabel, getCapabilityColor } from '../presets'

const { Text, Title } = Typography

export default function Models() {
  const [models, setModels] = useState<any[]>([])
  const [platforms, setPlatforms] = useState<any[]>([])
  const [editorOpen, setEditorOpen] = useState(false)
  const [editItem, setEditItem] = useState<any>(null)
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [selectedPlatformName, setSelectedPlatformName] = useState<string>('')
  const [useCustomModelId, setUseCustomModelId] = useState(false)
  const [customModelId, setCustomModelId] = useState('')
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; latency_ms: number; message: string }>>({})
  const [remoteModels, setRemoteModels] = useState<{ id: string; owned_by: string }[]>([])
  const [fetchingRemote, setFetchingRemote] = useState(false)
  const [showRemoteModels, setShowRemoteModels] = useState(false)
  const { locale } = useAppContext()
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const { token } = theme.useToken()

  useEffect(() => {
    loadModels()
    loadPlatforms()
  }, [])

  const loadModels = async () => {
    setLoading(true)
    try {
      setModels(await listModels())
    } catch {}
    setLoading(false)
  }

  const loadPlatforms = async () => {
    try {
      setPlatforms(await listPlatforms())
    } catch {}
  }

  const closeEditor = () => {
    setEditorOpen(false)
    setEditItem(null)
    form.resetFields()
    setSelectedPlatformName('')
    setUseCustomModelId(false)
    setCustomModelId('')
    setRemoteModels([])
    setShowRemoteModels(false)
  }

  const openCreate = () => {
    setEditItem(null)
    form.resetFields()
    setSelectedPlatformName('')
    setUseCustomModelId(false)
    setCustomModelId('')
    setRemoteModels([])
    setShowRemoteModels(false)
    setEditorOpen(true)
  }

  const openEdit = (record: any) => {
    setEditItem(record)
    const platform = platforms.find((item: any) => item.id === record.platform_id)
    setSelectedPlatformName(platform?.name || '')
    const presetModels = getModelsForPlatform(platform?.name || '')
    const isPreset = presetModels.some((item) => item.model_id === record.model_id)
    setUseCustomModelId(!isPreset)
    setCustomModelId(isPreset ? '' : record.model_id)
    form.setFieldsValue({
      platform_id: record.platform_id,
      model_id: isPreset ? record.model_id : undefined,
      display_name: record.display_name,
      max_tokens: record.max_tokens,
      context_window: record.context_window,
      capabilities: record.capabilities || [],
    })
    setRemoteModels([])
    setShowRemoteModels(false)
    setEditorOpen(true)
  }

  const handlePlatformChange = (platformId: string) => {
    const platform = platforms.find((item: any) => item.id === platformId)
    setSelectedPlatformName(platform?.name || '')
    setUseCustomModelId(false)
    setCustomModelId('')
    setRemoteModels([])
    setShowRemoteModels(false)
    form.setFieldsValue({ model_id: undefined, display_name: undefined })
  }

  const handleModelPresetSelect = (modelId: string) => {
    const presetModels = getModelsForPlatform(selectedPlatformName)
    const preset = presetModels.find((item) => item.model_id === modelId)
    if (preset) {
      form.setFieldsValue({
        model_id: preset.model_id,
        display_name: getModelDisplayName(preset, locale),
        max_tokens: preset.max_tokens,
        context_window: preset.context_window,
        capabilities: preset.capabilities || [],
      })
    }
  }

  const handleFetchRemoteModels = async () => {
    const platformId = form.getFieldValue('platform_id')
    if (!platformId) {
      message.warning(t(locale, 'selectPlatform'))
      return
    }
    setFetchingRemote(true)
    try {
      const data = await fetchRemoteModels(platformId)
      const nextRemoteModels = data.models || []
      if (nextRemoteModels.length === 0) {
        message.info(t(locale, 'noRemoteModels'))
      }
      setRemoteModels(nextRemoteModels)
      setShowRemoteModels(true)
    } catch {
      message.error(t(locale, 'fetchRemoteModelsFailed'))
    }
    setFetchingRemote(false)
  }

  const handleRemoteModelSelect = (modelId: string) => {
    const presetModels = getModelsForPlatform(selectedPlatformName)
    const preset = presetModels.find((item) => item.model_id === modelId)
    if (preset) {
      form.setFieldsValue({
        model_id: preset.model_id,
        display_name: getModelDisplayName(preset, locale),
        max_tokens: preset.max_tokens,
        context_window: preset.context_window,
        capabilities: preset.capabilities || [],
      })
    } else {
      form.setFieldsValue({
        model_id: modelId,
        display_name: modelId,
        max_tokens: 4096,
        context_window: 8192,
        capabilities: [],
      })
    }
    setUseCustomModelId(false)
    setCustomModelId('')
  }

  const handleSubmit = async (values: any) => {
    try {
      const submitValues = {
        ...values,
        model_id: useCustomModelId ? customModelId : values.model_id,
      }
      if (!submitValues.model_id) {
        message.error(t(locale, 'modelId'))
        return
      }
      if (editItem) {
        await updateModel(editItem.id, submitValues)
        message.success(t(locale, 'updateSuccess'))
      } else {
        await createModel(submitValues)
        message.success(t(locale, 'createSuccess'))
      }
      closeEditor()
      loadModels()
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message || (editItem ? t(locale, 'updateFailed') : t(locale, 'createFailed')))
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteModel(id)
      message.success(t(locale, 'deleteSuccess'))
      loadModels()
    } catch {}
  }

  const handleTestConnection = async (id: string) => {
    setTestingId(id)
    try {
      const result = await testModelConnection(id)
      setTestResults((prev) => ({ ...prev, [id]: result }))
      if (result.success) {
        message.success(`${t(locale, 'testConnectionSuccess')} (${result.latency_ms}ms)`)
      } else {
        message.error(`${t(locale, 'testConnectionFailed')}: ${result.message}`)
      }
    } catch (error: any) {
      setTestResults((prev) => ({ ...prev, [id]: { success: false, latency_ms: 0, message: error?.message || 'Unknown error' } }))
      message.error(t(locale, 'testConnectionFailed'))
    }
    setTestingId(null)
  }

  const getPlatformDisplayName = (platformId: string) => {
    const platform = platforms.find((item: any) => item.id === platformId)
    if (!platform) return '-'
    const preset = platformPresets.find((item) => item.name === platform.name)
    return preset ? getPresetName(preset, locale) : platform.name
  }

  const getConnectionState = (recordId: string) => {
    if (testingId === recordId) {
      return {
        icon: <LoadingOutlined style={{ color: token.colorPrimary }} />,
        text: locale === 'zh' ? '测试中' : 'Testing',
        color: token.colorPrimary,
      }
    }
    const state = testResults[recordId]
    if (!state) {
      return {
        icon: <ApiOutlined style={{ color: token.colorTextSecondary }} />,
        text: locale === 'zh' ? '未测试' : 'Not tested',
        color: token.colorTextSecondary,
      }
    }
    if (state.success) {
      return {
        icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
        text: `${locale === 'zh' ? '可用' : 'Healthy'} · ${state.latency_ms}ms`,
        color: '#52c41a',
      }
    }
    return {
      icon: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
      text: locale === 'zh' ? '连接失败' : 'Failed',
      color: '#ff4d4f',
    }
  }

  const summary = useMemo(() => {
    const total = models.length
    const connected = Object.values(testResults).filter((item) => item.success).length
    const tested = Object.keys(testResults).length
    const customModels = models.filter((record: any) => {
      const platform = platforms.find((item: any) => item.id === record.platform_id)
      const presetModels = getModelsForPlatform(platform?.name || '')
      return !presetModels.some((item) => item.model_id === record.model_id)
    }).length
    const platformCount = new Set(models.map((item: any) => item.platform_id)).size
    return { total, connected, tested, customModels, platformCount }
  }, [models, platforms, testResults])

  const presetModels = getModelsForPlatform(selectedPlatformName)

  const columns = [
    {
      title: t(locale, 'modelInfo'),
      key: 'model_info',
      width: 300,
      render: (_: any, record: any) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0' }}>
          <Text strong style={{ fontSize: 14 }}>{record.display_name}</Text>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Tag style={{ fontFamily: 'monospace', fontSize: 11, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderRadius: 999 }}>
              {record.model_id}
            </Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>{getPlatformDisplayName(record.platform_id)}</Text>
          </div>
        </div>
      ),
    },
    {
      title: locale === 'zh' ? '限制与能力' : 'Limits & Capabilities',
      key: 'limits',
      width: 280,
      render: (_: any, record: any) => (
        <Space direction="vertical" size={6}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Tag style={{ borderRadius: 999 }}>{t(locale, 'maxTokens')}: {record.max_tokens}</Tag>
            <Tag style={{ borderRadius: 999 }}>{t(locale, 'contextWindow')}: {record.context_window}</Tag>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {record.capabilities?.length > 0 ? record.capabilities.map((capability: string) => (
              <Tag key={capability} color={getCapabilityColor(capability)} style={{ borderRadius: 999 }}>
                {getCapabilityLabel(capability, locale)}
              </Tag>
            )) : <Text type="secondary">-</Text>}
          </div>
        </Space>
      ),
    },
    {
      title: locale === 'zh' ? '连接状态' : 'Connection',
      key: 'connection',
      width: 180,
      render: (_: any, record: any) => {
        const state = getConnectionState(record.id)
        return (
          <Tooltip title={testResults[record.id]?.message || t(locale, 'testConnection')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {state.icon}
              <Text style={{ color: state.color, fontSize: 12 }}>{state.text}</Text>
            </div>
          </Tooltip>
        )
      },
    },
    {
      title: t(locale, 'action'),
      key: 'action',
      width: 120,
      render: (_: any, record: any) => (
        <Space>
          <Button
            type="text"
            size="small"
            icon={testingId === record.id ? <LoadingOutlined /> : <ApiOutlined />}
            onClick={() => handleTestConnection(record.id)}
            loading={testingId === record.id}
          />
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm title={t(locale, 'deleteConfirm')} onConfirm={() => handleDelete(record.id)}>
            <Button type="text" danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', marginBottom: 16, gap: 12, flexDirection: isMobile ? 'column' : 'row' }}>
        <div>
          <Title level={5} style={{ margin: 0 }}>{t(locale, 'models')}</Title>
          <div style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {locale === 'zh' ? '统一管理平台模型、能力标签和连通性测试。' : 'Manage platform models, capability tags, and connectivity checks in one place.'}
            </Text>
          </div>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} block={isMobile}>{t(locale, 'addModel')}</Button>
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 20 }}>
            <Statistic title={locale === 'zh' ? '模型总数' : 'Total Models'} value={summary.total} prefix={<AppstoreOutlined style={{ color: token.colorPrimary }} />} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 20 }}>
            <Statistic title={locale === 'zh' ? '连接正常' : 'Healthy'} value={summary.connected} prefix={<LinkOutlined style={{ color: '#52c41a' }} />} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 20 }}>
            <Statistic title={locale === 'zh' ? '已测试' : 'Tested'} value={summary.tested} prefix={<ThunderboltOutlined style={{ color: '#faad14' }} />} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 20 }}>
            <Statistic title={locale === 'zh' ? '平台 / 自定义' : 'Platforms / Custom'} value={`${summary.platformCount} / ${summary.customModels}`} prefix={<ApiOutlined style={{ color: token.colorPrimary }} />} />
          </Card>
        </Col>
      </Row>

      {models.length === 0 && !loading ? (
        <Card style={{ borderRadius: 24 }}>
          <Empty description={locale === 'zh' ? '还没有模型，先从平台导入或手动添加。' : 'No models yet. Import from a platform or create one manually.'} />
        </Card>
      ) : isMobile ? (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {models.map((record: any) => {
            const connectionState = getConnectionState(record.id)
            return (
              <Card key={record.id} style={{ borderRadius: 20 }}>
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                    <div>
                      <Text strong style={{ fontSize: 15 }}>{record.display_name}</Text>
                      <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <Tag style={{ fontFamily: 'monospace', borderRadius: 999 }}>{record.model_id}</Tag>
                        <Tag style={{ borderRadius: 999 }}>{getPlatformDisplayName(record.platform_id)}</Tag>
                      </div>
                    </div>
                    <Space>
                      <Button type="text" size="small" icon={testingId === record.id ? <LoadingOutlined /> : <ApiOutlined />} onClick={() => handleTestConnection(record.id)} />
                      <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
                      <Popconfirm title={t(locale, 'deleteConfirm')} onConfirm={() => handleDelete(record.id)}>
                        <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                    <div>
                      <Text type="secondary">{t(locale, 'maxTokens')}</Text>
                      <div><Text>{record.max_tokens}</Text></div>
                    </div>
                    <div>
                      <Text type="secondary">{t(locale, 'contextWindow')}</Text>
                      <div><Text>{record.context_window}</Text></div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {connectionState.icon}
                    <Text style={{ color: connectionState.color, fontSize: 12 }}>{connectionState.text}</Text>
                  </div>

                  <div>
                    <Text type="secondary">{t(locale, 'capabilities')}</Text>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      {record.capabilities?.length > 0 ? record.capabilities.map((capability: string) => (
                        <Tag key={capability} color={getCapabilityColor(capability)} style={{ borderRadius: 999 }}>
                          {getCapabilityLabel(capability, locale)}
                        </Tag>
                      )) : <Text type="secondary">-</Text>}
                    </div>
                  </div>
                </Space>
              </Card>
            )
          })}
        </Space>
      ) : (
        <Card styles={{ body: { padding: 0 } }} style={{ borderRadius: 24 }}>
          <Table columns={columns} dataSource={models} rowKey="id" loading={loading} pagination={{ pageSize: 20, showSizeChanger: false }} />
        </Card>
      )}

      <Drawer
        title={editItem ? t(locale, 'editModel') : t(locale, 'addModel')}
        open={editorOpen}
        onClose={closeEditor}
        width={isMobile ? '100%' : 560}
        extra={<Button type="primary" onClick={() => form.submit()}>{editItem ? t(locale, 'save') : t(locale, 'create')}</Button>}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Card size="small" title={locale === 'zh' ? '模型基础信息' : 'Basic Info'} style={{ marginBottom: 16, borderRadius: 20 }}>
            <Form.Item name="platform_id" label={t(locale, 'belongPlatform')} rules={[{ required: true }]}> 
              <Select
                placeholder={t(locale, 'selectPlatform')}
                options={platforms.map((platform: any) => {
                  const preset = platformPresets.find((item) => item.name === platform.name)
                  return { value: platform.id, label: preset ? getPresetName(preset, locale) : platform.name }
                })}
                onChange={handlePlatformChange}
              />
            </Form.Item>

            <Form.Item label={t(locale, 'modelId')} required>
              {useCustomModelId ? (
                <Space.Compact style={{ width: '100%' }}>
                  <Input
                    placeholder="e.g. gpt-4-1106-preview"
                    value={customModelId}
                    onChange={(event) => setCustomModelId(event.target.value)}
                    style={{ flex: 1 }}
                  />
                  <Button onClick={() => { setUseCustomModelId(false); setCustomModelId('') }}>
                    {locale === 'zh' ? '切回预设' : 'Back to Presets'}
                  </Button>
                </Space.Compact>
              ) : (
                <Space.Compact style={{ width: '100%' }}>
                  <Form.Item name="model_id" noStyle rules={[{ required: !useCustomModelId }]}>
                    <Select
                      showSearch
                      placeholder={t(locale, 'modelIdPlaceholder')}
                      options={presetModels.map((item) => ({ value: item.model_id, label: `${getModelDisplayName(item, locale)} (${item.model_id})` }))}
                      filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase())}
                      onSelect={handleModelPresetSelect}
                      style={{ width: '100%' }}
                      allowClear
                    />
                  </Form.Item>
                  <Button onClick={() => setUseCustomModelId(true)}>
                    {t(locale, 'customInput')}
                  </Button>
                </Space.Compact>
              )}
            </Form.Item>

            <Form.Item name="display_name" label={t(locale, 'displayName')} rules={[{ required: true }]}>
              <Input placeholder="GPT-4o" />
            </Form.Item>
            <Form.Item name="max_tokens" label={t(locale, 'maxTokens')} initialValue={4096}>
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="context_window" label={t(locale, 'contextWindow')} initialValue={8192}>
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="capabilities" label={t(locale, 'capabilities')} initialValue={[]}>
              <Select
                mode="multiple"
                placeholder={t(locale, 'selectCapabilities')}
                options={CAPABILITY_OPTIONS.map((item) => ({
                  value: item.value,
                  label: locale === 'zh' ? item.labelZh : item.labelEn,
                }))}
                optionFilterProp="label"
              />
            </Form.Item>
          </Card>

          <Card size="small" title={locale === 'zh' ? '远程模型选择' : 'Remote Model Picker'} style={{ borderRadius: 20 }}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Text type="secondary">
                {locale === 'zh' ? '先从平台拉取远程模型，再一键回填显示名称、上下文和能力。' : 'Fetch remote models first, then autofill display name, context window, and capabilities.'}
              </Text>
              <Space direction={isMobile ? 'vertical' : 'horizontal'} style={isMobile ? { width: '100%' } : undefined}>
                <Button
                  size="small"
                  icon={<CloudDownloadOutlined />}
                  onClick={handleFetchRemoteModels}
                  loading={fetchingRemote}
                  disabled={!form.getFieldValue('platform_id')}
                  block={isMobile}
                >
                  {t(locale, 'fetchFromPlatform')}
                </Button>
                <Button size="small" onClick={() => setUseCustomModelId(true)} block={isMobile}>
                  {t(locale, 'customInput')}
                </Button>
              </Space>

              {showRemoteModels ? (
                remoteModels.length > 0 ? (
                  <div>
                    <div style={{ marginBottom: 6 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {t(locale, 'remoteModelsCount', String(remoteModels.length))}
                      </Text>
                    </div>
                    <Select
                      showSearch
                      placeholder={t(locale, 'selectRemoteModel')}
                      style={{ width: '100%' }}
                      options={remoteModels.map((item) => ({ value: item.id, label: item.id }))}
                      filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase())}
                      onSelect={handleRemoteModelSelect}
                      allowClear
                    />
                  </div>
                ) : (
                  <Alert type="info" showIcon message={t(locale, 'noRemoteModels')} />
                )
              ) : null}
            </Space>
          </Card>
        </Form>
      </Drawer>
    </div>
  )
}
