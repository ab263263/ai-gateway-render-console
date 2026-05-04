import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Table,
  Drawer,
  Form,
  Input,
  Select,
  Tag,
  Space,
  message,
  Popconfirm,
  Card,
  Typography,
  Alert,
  Grid,
  Switch,
  Divider,
  Tooltip,
  Empty,
  Statistic,
  Row,
  Col,
  theme,
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  CloudDownloadOutlined,
  ImportOutlined,
  GiftOutlined,
  ExperimentOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  MinusCircleOutlined,
  ApiOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import {
  listPlatforms,
  createPlatform,
  updatePlatform,
  deletePlatform,
  fetchRemoteModels,
  importRemoteModels,
  doCheckinSingle,
  triggerHealthCheck,
} from '../api'
import { useAppContext } from '../ThemeContext'
import { t } from '../i18n'
import { platformPresets, getPresetName } from '../presets'

const { Text, Title } = Typography

type PlatformModelState = {
  success?: boolean
  message?: string
  count?: number
  models?: { id: string; owned_by?: string }[]
  importMessage?: string
  imported?: number
  skipped?: number
}

function getHealthVisual(locale: string, record: any) {
  const lastCheck = record.last_health_check
    ? new Date(record.last_health_check).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null
  const fails = record.consecutive_fails || 0
  const isDisabled = record.auto_disabled

  let icon: React.ReactNode = <MinusCircleOutlined style={{ color: '#999' }} />
  let color = '#999'
  let label = t(locale as any, 'neverChecked') || '未探测'
  let tooltip = t(locale as any, 'healthNeverTip') || '从未执行过健康探测'

  if (isDisabled) {
    icon = <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
    color = '#ff4d4f'
    label = t(locale as any, 'healthDisabled') || '已禁用'
    tooltip = t(locale as any, 'healthDisabledTip') || `连续失败${fails}次，自动禁用`
  } else if (fails > 0) {
    icon = <CloseCircleOutlined style={{ color: '#faad14' }} />
    color = '#faad14'
    label = `${fails}${t(locale as any, 'consecutiveFails')}`
    tooltip = t(locale as any, 'healthFailsTip') || `连续失败${fails}次`
  } else if (lastCheck) {
    icon = <CheckCircleOutlined style={{ color: '#52c41a' }} />
    color = '#52c41a'
    label = lastCheck
    tooltip = t(locale as any, 'healthOkTip') || '健康检查正常'
  }

  return { icon, color, label, tooltip }
}

export default function Platforms() {
  const [platforms, setPlatforms] = useState<any[]>([])
  const [editorOpen, setEditorOpen] = useState(false)
  const [editItem, setEditItem] = useState<any>(null)
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [fetchingId, setFetchingId] = useState<string | null>(null)
  const [importingId, setImportingId] = useState<string | null>(null)
  const [checkinId, setCheckinId] = useState<string | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)
  const [healthRefresh, setHealthRefresh] = useState(0)
  const [platformModels, setPlatformModels] = useState<Record<string, PlatformModelState>>({})
  const { locale } = useAppContext()
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const { token } = theme.useToken()

  const PLATFORM_TYPES = [
    { value: 'OpenAI', label: t(locale, 'openaiType') },
    { value: 'Anthropic', label: t(locale, 'anthropicType') },
    { value: 'Ollama', label: t(locale, 'ollamaType') },
    { value: 'Azure', label: t(locale, 'azureType') },
    { value: 'Custom', label: t(locale, 'customType') },
  ]

  useEffect(() => {
    loadPlatforms()
  }, [])

  useEffect(() => {
    loadPlatforms()
  }, [healthRefresh])

  const loadPlatforms = async () => {
    setLoading(true)
    try {
      setPlatforms(await listPlatforms())
    } catch {}
    setLoading(false)
  }

  const handleTriggerHealthCheck = async () => {
    setHealthLoading(true)
    try {
      await triggerHealthCheck()
      message.success(t(locale, 'healthCheckTriggered') || '健康探测已触发')
      setTimeout(() => setHealthRefresh((value) => value + 1), 3000)
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message || t(locale, 'healthCheckFailed') || '探测失败')
    }
    setHealthLoading(false)
  }

  const handleFetchModels = async (record: any) => {
    setFetchingId(record.id)
    try {
      const result = await fetchRemoteModels(record.id)
      setPlatformModels((prev) => ({ ...prev, [record.id]: result }))
      if (result?.success === false) {
        message.error(result?.message || t(locale, 'fetchRemoteModelsFailed'))
      } else {
        message.success(result?.message || t(locale, 'fetchFromPlatform'))
      }
    } catch (error: any) {
      const err = error?.response?.data?.error?.message || t(locale, 'fetchRemoteModelsFailed')
      setPlatformModels((prev) => ({ ...prev, [record.id]: { success: false, message: err, count: 0, models: [] } }))
      message.error(err)
    }
    setFetchingId(null)
  }

  const handleImportModels = async (record: any) => {
    const state = platformModels[record.id]
    if (!state?.models || state.models.length === 0) {
      message.warning(t(locale, 'noRemoteModels'))
      return
    }
    setImportingId(record.id)
    try {
      const result = await importRemoteModels(record.id, { model_ids: state.models.map((item) => item.id) })
      setPlatformModels((prev) => ({
        ...prev,
        [record.id]: {
          ...prev[record.id],
          importMessage: result?.message,
          imported: result?.imported,
          skipped: result?.skipped,
        },
      }))
      message.success(result?.message || t(locale, 'importModels'))
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message || t(locale, 'importModelsFailed'))
    }
    setImportingId(null)
  }

  const openCreate = () => {
    setEditItem(null)
    form.resetFields()
    form.setFieldsValue({ type: 'OpenAI' })
    setEditorOpen(true)
  }

  const openEdit = (record: any) => {
    setEditItem(record)
    form.setFieldsValue({
      name: record.name,
      type: record.type,
      base_url: record.base_url,
      api_key: record.api_key,
      organization: record.organization,
      checkin_enabled: record.checkin_enabled || false,
      auto_checkin: record.auto_checkin || false,
      checkin_session: record.checkin_session || '',
      checkin_user_id: record.checkin_user_id || '',
    })
    setEditorOpen(true)
  }

  const closeEditor = () => {
    setEditorOpen(false)
    setEditItem(null)
    form.resetFields()
  }

  const handleSubmit = async (values: any) => {
    try {
      if (editItem) {
        await updatePlatform(editItem.id, values)
        message.success(t(locale, 'updateSuccess'))
      } else {
        await createPlatform(values)
        message.success(t(locale, 'createSuccess'))
      }
      closeEditor()
      loadPlatforms()
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message || (editItem ? t(locale, 'updateFailed') : t(locale, 'createFailed')))
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deletePlatform(id)
      message.success(t(locale, 'deleteSuccess'))
      loadPlatforms()
    } catch {}
  }

  const applyPreset = (preset: typeof platformPresets[0]) => {
    form.setFieldsValue({
      name: preset.name,
      type: preset.platform_type,
      base_url: preset.base_url,
    })
  }

  const summary = useMemo(() => {
    const total = platforms.length
    const active = platforms.filter((item) => item.status === 'Active' && !item.auto_disabled).length
    const disabled = platforms.filter((item) => item.auto_disabled).length
    const checkinEnabled = platforms.filter((item) => item.checkin_enabled).length
    const fetchedModels = Object.values(platformModels).reduce((sum, item) => sum + (item.count || item.models?.length || 0), 0)
    return { total, active, disabled, checkinEnabled, fetchedModels }
  }, [platforms, platformModels])

  const columns = [
    {
      title: locale === 'zh' ? '平台信息' : 'Platform Info',
      key: 'platform',
      width: 260,
      render: (_: any, record: any) => {
        const preset = platformPresets.find((item) => item.name === record.name)
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text strong>{preset ? getPresetName(preset, locale) : record.name}</Text>
              <Tag style={{ borderRadius: 999 }}>{record.type}</Tag>
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>{record.base_url}</Text>
          </div>
        )
      },
    },
    {
      title: t(locale, 'healthAndStatus'),
      key: 'health',
      width: 220,
      render: (_: any, record: any) => {
        const health = getHealthVisual(locale, record)
        const isAutoDisabled = record.auto_disabled
        const consecutiveFails = record.consecutive_fails || 0
        return (
          <Space direction="vertical" size={6}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Tag color={isAutoDisabled ? 'error' : record.status === 'Active' ? 'success' : 'default'} style={{ borderRadius: 999 }}>
                {isAutoDisabled ? t(locale, 'autoDisabled') : record.status === 'Active' ? t(locale, 'active') : record.status}
              </Tag>
              {consecutiveFails > 0 ? (
                <Tag color="warning" style={{ borderRadius: 999 }}>
                  {t(locale, 'consecutiveFails')}: {consecutiveFails}
                </Tag>
              ) : null}
            </div>
            <Tooltip title={health.tooltip}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {health.icon}
                <Text style={{ color: health.color, fontSize: 12 }}>{health.label}</Text>
              </div>
            </Tooltip>
          </Space>
        )
      },
    },
    {
      title: t(locale, 'apiAndBalance'),
      key: 'api',
      width: 180,
      render: (_: any, record: any) => {
        const remaining = record.balance != null
          ? (record.quota && record.used_quota ? (record.quota - record.used_quota) : record.balance)
          : null
        return (
          <Space direction="vertical" size={6}>
            <Text code style={{ fontSize: 12 }}>{record.api_key ? `${record.api_key.slice(0, 8)}...` : '-'}</Text>
              {remaining != null ? (
                <Tag color={remaining > 1000 ? 'success' : remaining > 100 ? 'warning' : 'error'} style={{ borderRadius: 999, width: 'fit-content' }}>
                  ${Number(remaining).toFixed(2)}
                </Tag>
            ) : (
              <Text type="secondary">-</Text>
            )}
          </Space>
        )
      },
    },
    {
      title: t(locale, 'remoteModelsLabel'),
      key: 'remote',
      render: (_: any, record: any) => {
        const state = platformModels[record.id]
        const models = state?.models || []
        return (
          <div style={{ minWidth: 280 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <Button size="small" icon={<CloudDownloadOutlined />} loading={fetchingId === record.id} onClick={() => handleFetchModels(record)}>
                {t(locale, 'fetchFromPlatform')}
              </Button>
              <Button size="small" icon={<ImportOutlined />} loading={importingId === record.id} onClick={() => handleImportModels(record)} disabled={models.length === 0}>
                {t(locale, 'importModels')}
              </Button>
              <Text type="secondary">{state ? t(locale, 'remoteModelsCount', String(state.count || models.length || 0)) : t(locale, 'noRemoteModels')}</Text>
            </div>
            {state?.message && state?.success === false ? <Alert type="error" showIcon message={state.message} style={{ marginBottom: 8 }} /> : null}
            {state?.importMessage ? <Alert type="success" showIcon message={state.importMessage} style={{ marginBottom: 8 }} /> : null}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {models.length > 0 ? models.map((item) => <Tag key={item.id}>{item.id}</Tag>) : <Text type="secondary">{t(locale, 'noRemoteModels')}</Text>}
            </div>
          </div>
        )
      },
    },
    {
      title: t(locale, 'action'),
      key: 'action',
      width: 120,
      render: (_: any, record: any) => (
        <Space>
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
          <Title level={5} style={{ margin: 0 }}>{t(locale, 'platforms')}</Title>
          <div style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t(locale, 'platformsDesc')}
            </Text>
          </div>
        </div>
        <Space direction={isMobile ? 'vertical' : 'horizontal'} style={isMobile ? { width: '100%' } : undefined}>
          <Button icon={<ExperimentOutlined />} loading={healthLoading} onClick={handleTriggerHealthCheck} block={isMobile}>
            {t(locale, 'triggerHealthCheck')}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} block={isMobile}>
            {t(locale, 'addPlatform')}
          </Button>
        </Space>
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 20 }}>
            <Statistic title={t(locale, 'platformTotal')} value={summary.total} prefix={<ApiOutlined style={{ color: token.colorPrimary }} />} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 20 }}>
            <Statistic title={t(locale, 'healthyPlatforms')} value={summary.active} prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 20 }}>
            <Statistic title={t(locale, 'autoDisabledCount')} value={summary.disabled} prefix={<WarningOutlined style={{ color: '#faad14' }} />} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 20 }}>
            <Statistic title={t(locale, 'checkinAndRemoteModels')} value={`${summary.checkinEnabled} / ${summary.fetchedModels}`} prefix={<GiftOutlined style={{ color: token.colorPrimary }} />} />
          </Card>
        </Col>
      </Row>

      {platforms.length === 0 && !loading ? (
        <Card style={{ borderRadius: 24 }}>
          <Empty description={t(locale, 'noPlatforms')} />
        </Card>
      ) : isMobile ? (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {platforms.map((record: any) => {
            const state = platformModels[record.id]
            const models = state?.models || []
            const preset = platformPresets.find((item) => item.name === record.name)
            const health = getHealthVisual(locale, record)
            return (
              <Card key={record.id} style={{ borderRadius: 20 }}>
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                    <div>
                      <Text strong style={{ fontSize: 15 }}>{preset ? getPresetName(preset, locale) : record.name}</Text>
                      <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <Tag>{record.type}</Tag>
                        <Tag color={record.auto_disabled ? 'error' : record.status === 'Active' ? 'success' : 'default'}>
                          {record.auto_disabled ? t(locale, 'autoDisabled') : record.status === 'Active' ? t(locale, 'active') : record.status}
                        </Tag>
                      </div>
                    </div>
                    <Space>
                      <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
                      <Popconfirm title={t(locale, 'deleteConfirm')} onConfirm={() => handleDelete(record.id)}>
                        <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  </div>

                  <Text type="secondary" style={{ fontSize: 12 }}>{record.base_url}</Text>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                    <div>
                      <Text type="secondary">{t(locale, 'apiKey')}</Text>
                      <div><Text code>{record.api_key ? `${record.api_key.slice(0, 8)}...` : '-'}</Text></div>
                    </div>
                    <div>
                      <Text type="secondary">{t(locale, 'healthCheck') || '健康'}</Text>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        {health.icon}
                        <Text style={{ color: health.color, fontSize: 12 }}>{health.label}</Text>
                      </div>
                    </div>
                  </div>

                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Button size="small" icon={<CloudDownloadOutlined />} loading={fetchingId === record.id} onClick={() => handleFetchModels(record)} block>
                      {t(locale, 'fetchFromPlatform')}
                    </Button>
                    <Button size="small" icon={<ImportOutlined />} loading={importingId === record.id} onClick={() => handleImportModels(record)} disabled={models.length === 0} block>
                      {t(locale, 'importModels')}
                    </Button>
                    {record.checkin_enabled ? (
                      <Button
                        size="small"
                        icon={<GiftOutlined />}
                        loading={checkinId === record.id}
                        onClick={async () => {
                          setCheckinId(record.id)
                          try {
                            const result = await doCheckinSingle(record.id)
                            if (result.success) {
                              message.success(`${t(locale, 'checkinSuccess')}${result.quota_added ? ` +${result.quota_added}` : ''}`)
                            } else {
                              message.error(result.error_message || t(locale, 'checkinFailed'))
                            }
                            loadPlatforms()
                          } catch (error: any) {
                            message.error(error?.response?.data?.error?.message || t(locale, 'checkinFailed'))
                          }
                          setCheckinId(null)
                        }}
                        block
                      >
                        {t(locale, 'checkin')}
                      </Button>
                    ) : null}
                  </Space>

                  {state?.message && state?.success === false ? <Alert type="error" showIcon message={state.message} /> : null}
                  {state?.importMessage ? <Alert type="success" showIcon message={state.importMessage} /> : null}

                  <div>
                    <Text type="secondary">{state ? t(locale, 'remoteModelsCount', String(state.count || models.length || 0)) : t(locale, 'noRemoteModels')}</Text>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {models.length > 0 ? models.map((item) => <Tag key={item.id}>{item.id}</Tag>) : <Text type="secondary">{t(locale, 'noRemoteModels')}</Text>}
                    </div>
                  </div>
                </Space>
              </Card>
            )
          })}
        </Space>
      ) : (
        <Card styles={{ body: { padding: 0 } }} style={{ borderRadius: 24 }}>
          <Table columns={columns} dataSource={platforms} rowKey="id" loading={loading} pagination={{ pageSize: 20, showSizeChanger: false }} scroll={{ x: 1280 }} />
        </Card>
      )}

      <Drawer
        title={editItem ? t(locale, 'editPlatform') : t(locale, 'addPlatform')}
        open={editorOpen}
        onClose={closeEditor}
        width={isMobile ? '100%' : 560}
        extra={<Button type="primary" onClick={() => form.submit()}>{editItem ? t(locale, 'save') : t(locale, 'create')}</Button>}
      >
        {!editItem ? (
          <Card size="small" title={t(locale, 'quickPreset')} style={{ marginBottom: 16, borderRadius: 20 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {platformPresets.map((preset) => (
                <Tag key={preset.name} color="processing" style={{ cursor: 'pointer', borderRadius: 999, padding: '4px 10px' }} onClick={() => applyPreset(preset)}>
                  {getPresetName(preset, locale)}
                </Tag>
              ))}
            </div>
          </Card>
        ) : null}

        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Card size="small" title={t(locale, 'basicInfo')} style={{ marginBottom: 16, borderRadius: 20 }}>
            <Form.Item name="name" label={t(locale, 'platformName')} rules={[{ required: true }]}>
              <Input placeholder="OpenAI, DeepSeek, etc." />
            </Form.Item>
            <Form.Item name="type" label={t(locale, 'platformType')} rules={[{ required: true }]}>
              <Select options={PLATFORM_TYPES} />
            </Form.Item>
            <Form.Item name="base_url" label={t(locale, 'baseUrl')} rules={[{ required: true }]}>
              <Input placeholder="https://api.openai.com/v1" />
            </Form.Item>
            <Form.Item name="api_key" label={t(locale, 'apiKey')}>
              <Input.Password placeholder="sk-..." prefix={<KeyOutlined />} />
            </Form.Item>
            <Form.Item name="organization" label={t(locale, 'organization')}>
              <Input placeholder="org-xxx (optional)" />
            </Form.Item>
          </Card>

          {editItem ? (
            <Card size="small" title={t(locale, 'checkinAndRemoteModels')} style={{ borderRadius: 20 }}>
              <Form.Item name="checkin_enabled" label={t(locale, 'checkinEnabled')} valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="auto_checkin" label={t(locale, 'autoCheckin')} valuePropName="checked">
                <Switch />
              </Form.Item>
              <Divider style={{ margin: '12px 0' }} />
              <Form.Item name="checkin_session" label="Session">
                <Input.Password placeholder="浏览器 Cookie 中的 session 值" />
              </Form.Item>
              <Form.Item name="checkin_user_id" label="User ID">
                <Input placeholder="NewAPI 用户 ID" />
              </Form.Item>
            </Card>
          ) : null}
        </Form>
      </Drawer>
    </div>
  )
}
