import { useEffect, useState } from 'react'
import { Button, Table, Modal, Form, Input, Select, Tag, Space, message, Popconfirm, Card, Typography, Alert, Grid, Switch, Divider, Tooltip, Badge } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, KeyOutlined, CloudDownloadOutlined, ImportOutlined, DollarOutlined, GiftOutlined, ReloadOutlined, ExperimentOutlined, CheckCircleOutlined, CloseCircleOutlined, MinusCircleOutlined } from '@ant-design/icons'
import { listPlatforms, createPlatform, updatePlatform, deletePlatform, fetchRemoteModels, importRemoteModels, listPlatformKeys, addPlatformKey, deletePlatformKey, doCheckinSingle, triggerHealthCheck, getPlatformHealth } from '../api'
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

export default function Platforms() {
  const [platforms, setPlatforms] = useState<any[]>([])
  const [modalOpen, setModalOpen] = useState(false)
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

  // Reload platforms whenever healthRefresh changes (after manual trigger)
  useEffect(() => { loadPlatforms() }, [healthRefresh])

  const PLATFORM_TYPES = [
    { value: 'OpenAI', label: t(locale, 'openaiType') },
    { value: 'Anthropic', label: t(locale, 'anthropicType') },
    { value: 'Ollama', label: t(locale, 'ollamaType') },
    { value: 'Azure', label: t(locale, 'azureType') },
    { value: 'Custom', label: t(locale, 'customType') },
  ]

  useEffect(() => { loadPlatforms() }, [])

  const loadPlatforms = async () => {
    setLoading(true)
    try { setPlatforms(await listPlatforms()) } catch {}
    setLoading(false)
  }

  const handleTriggerHealthCheck = async () => {
    setHealthLoading(true)
    try {
      await triggerHealthCheck()
      message.success(t(locale, 'healthCheckTriggered') || '健康探测已触发')
      // Refresh platforms after a short delay to show updated status
      setTimeout(() => setHealthRefresh(n => n + 1), 3000)
    } catch (e: any) {
      message.error(e?.response?.data?.error?.message || t(locale, 'healthCheckFailed') || '探测失败')
    }
    setHealthLoading(false)
  }

  const handleFetchModels = async (record: any) => {
    setFetchingId(record.id)
    try {
      const result = await fetchRemoteModels(record.id)
      setPlatformModels(prev => ({ ...prev, [record.id]: result }))
      if (result?.success === false) {
        message.error(result?.message || t(locale, 'fetchRemoteModelsFailed'))
      } else {
        message.success(result?.message || t(locale, 'fetchFromPlatform'))
      }
    } catch (e: any) {
      const err = e?.response?.data?.error?.message || t(locale, 'fetchRemoteModelsFailed')
      setPlatformModels(prev => ({ ...prev, [record.id]: { success: false, message: err, count: 0, models: [] } }))
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
      const result = await importRemoteModels(record.id, { model_ids: state.models.map(m => m.id) })
      setPlatformModels(prev => ({
        ...prev,
        [record.id]: {
          ...prev[record.id],
          importMessage: result?.message,
          imported: result?.imported,
          skipped: result?.skipped,
        },
      }))
      message.success(result?.message || t(locale, 'importModels'))
    } catch (e: any) {
      message.error(e?.response?.data?.error?.message || t(locale, 'importModelsFailed'))
    }
    setImportingId(null)
  }

  const openCreate = () => {
    setEditItem(null)
    form.resetFields()
    setModalOpen(true)
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
    setModalOpen(true)
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
      setModalOpen(false)
      form.resetFields()
      setEditItem(null)
      loadPlatforms()
    } catch (e: any) {
      message.error(e?.response?.data?.error?.message || (editItem ? t(locale, 'updateFailed') : t(locale, 'createFailed')))
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

  const columns = [
    {
      title: t(locale, 'name'),
      dataIndex: 'name',
      key: 'name',
      width: 140,
      render: (v: string) => {
        const preset = platformPresets.find(p => p.name === v)
        return <Text strong>{preset ? getPresetName(preset, locale) : v}</Text>
      },
    },
    {
      title: t(locale, 'type'),
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (v: string) => <Tag style={{ borderRadius: 4 }}>{v}</Tag>,
    },
    { title: t(locale, 'baseUrl'), dataIndex: 'base_url', key: 'base_url', ellipsis: true },
    {
      title: t(locale, 'status'),
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (v: string, record: any) => {
        const isAutoDisabled = record.auto_disabled
        const consecutiveFails = record.consecutive_fails || 0
        return (
          <div>
            <Tag color={isAutoDisabled ? 'error' : v === 'Active' ? 'success' : 'default'} style={{ borderRadius: 4 }}>
              {isAutoDisabled ? t(locale, 'autoDisabled') : v === 'Active' ? t(locale, 'active') : v}
            </Tag>
            {consecutiveFails > 0 && (
              <div style={{ marginTop: 2 }}>
                <Tag color="warning" style={{ fontSize: 10, borderRadius: 4 }}>
                  {t(locale, 'consecutiveFails')}: {consecutiveFails}
                </Tag>
              </div>
            )}
          </div>
        )
      },
    },
    {
      title: 'API Key',
      dataIndex: 'api_key',
      key: 'api_key',
      width: 120,
      render: (v: string) => v ? <Text code style={{ fontSize: 12 }}>{v.slice(0, 8)}...</Text> : <Text type="secondary">-</Text>,
    },
    {
      title: t(locale, 'balance'),
      key: 'balance',
      width: 120,
      render: (_: any, record: any) => {
        if (record.balance != null) {
          const remaining = record.quota && record.used_quota ? (record.quota - record.used_quota) : record.balance
          return (
            <div>
              <Tag color={remaining > 1000 ? 'success' : remaining > 100 ? 'warning' : 'error'} style={{ borderRadius: 4 }}>
                ${remaining.toFixed(2)}
              </Tag>
              {record.last_balance_check && (
                <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>
                  {new Date(record.last_balance_check).toLocaleTimeString('zh-CN')}
                </div>
              )}
            </div>
          )
        }
        return <Text type="secondary">-</Text>
      },
    },
    {
      title: t(locale, 'checkin'),
      key: 'checkin',
      width: 100,
      render: (_: any, record: any) => {
        const hasCheckinConfig = record.checkin_enabled && record.checkin_session
        return (
          <div>
            {hasCheckinConfig && (
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
                  } catch (e: any) {
                    message.error(e?.response?.data?.error?.message || t(locale, 'checkinFailed'))
                  }
                  setCheckinId(null)
                }}
                block={isMobile}
              >
                {t(locale, 'checkin')}
              </Button>
            )}
            {!hasCheckinConfig && record.checkin_enabled && (
              <Tag color="default" style={{ fontSize: 10 }}>需配置 Session</Tag>
            )}
            {!record.checkin_enabled && (
              <Text type="secondary" style={{ fontSize: 10 }}>-</Text>
            )}
            {record.last_checkin && (
              <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>
                上次: {new Date(record.last_checkin).toLocaleDateString('zh-CN')}
              </div>
            )}
          </div>
        )
      },
    },
    {
      title: t(locale, 'healthCheck') || '健康',
      key: 'health',
      width: 160,
      render: (_: any, record: any) => {
        const lastCheck = record.last_health_check
          ? new Date(record.last_health_check).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
          : null
        const fails = record.consecutive_fails || 0
        const isDisabled = record.auto_disabled

        let icon: React.ReactNode = <MinusCircleOutlined style={{ color: '#999' }} />
        let color = '#999'
        let label = t(locale, 'neverChecked') || '未探测'
        if (isDisabled) {
          icon = <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
          color = '#ff4d4f'
          label = t(locale, 'healthDisabled') || '已禁用'
        } else if (fails > 0) {
          icon = <CloseCircleOutlined style={{ color: '#faad14' }} />
          color = '#faad14'
          label = `${fails}次失败`
        } else if (lastCheck) {
          icon = <CheckCircleOutlined style={{ color: '#52c41a' }} />
          color = '#52c41a'
          label = lastCheck
        }
        return (
          <Tooltip
            title={
              isDisabled
                ? t(locale, 'healthDisabledTip') || `连续失败${fails}次，自动禁用`
                : fails > 0
                ? t(locale, 'healthFailsTip') || `连续失败${fails}次`
                : lastCheck
                ? t(locale, 'healthOkTip') || '健康检查正常'
                : t(locale, 'healthNeverTip') || '从未执行过健康探测'
            }
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color, fontSize: 16 }}>{icon}</span>
              <Text style={{ color, fontSize: 12 }}>{label}</Text>
            </div>
          </Tooltip>
        )
      },
    },
    {
      render: (_: any, record: any) => {
        const state = platformModels[record.id]
        const models = state?.models || []
        return (
          <div style={{ minWidth: isMobile ? 260 : 380 }}>
            {state?.message && state?.success === false && (
              <Alert type="error" showIcon message={state.message} style={{ marginBottom: 8 }} />
            )}
            {state?.importMessage && (
              <Alert type="success" showIcon message={state.importMessage} style={{ marginBottom: 8 }} />
            )}
            <div
              style={{
                display: 'flex',
                alignItems: isMobile ? 'stretch' : 'center',
                gap: 8,
                marginBottom: 8,
                flexWrap: 'wrap',
                flexDirection: isMobile ? 'column' : 'row',
              }}
            >
              <Button
                size="small"
                icon={<CloudDownloadOutlined />}
                loading={fetchingId === record.id}
                onClick={() => handleFetchModels(record)}
                block={isMobile}
              >
                {t(locale, 'fetchFromPlatform')}
              </Button>
              <Button
                size="small"
                icon={<ImportOutlined />}
                loading={importingId === record.id}
                onClick={() => handleImportModels(record)}
                disabled={models.length === 0}
                block={isMobile}
              >
                {t(locale, 'importModels')}
              </Button>
              <Text type="secondary">
                {state ? t(locale, 'remoteModelsCount', String(state.count || models.length || 0)) : t(locale, 'noRemoteModels')}
              </Text>
              {(typeof state?.imported === 'number' || typeof state?.skipped === 'number') && (
                <Text type="secondary">导入 {state?.imported || 0}，跳过 {state?.skipped || 0}</Text>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {models.length > 0 ? models.map((m) => <Tag key={m.id}>{m.id}</Tag>) : <Text type="secondary">{t(locale, 'noRemoteModels')}</Text>}
            </div>
          </div>
        )
      },
    },
    {
      title: t(locale, 'action'),
      key: 'action',
      width: isMobile ? 120 : 90,
      render: (_: any, record: any) => (
        <Space direction={isMobile ? 'vertical' : 'horizontal'} size={isMobile ? 4 : 8}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} block={isMobile} />
          <Popconfirm title={t(locale, 'deleteConfirm')} onConfirm={() => handleDelete(record.id)}>
            <Button type="text" danger size="small" icon={<DeleteOutlined />} block={isMobile} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

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
        <Title level={5} style={{ margin: 0 }}>{t(locale, 'platforms')}</Title>
        <Space>
          <Button icon={<ExperimentOutlined />} loading={healthLoading} onClick={handleTriggerHealthCheck} size="small">
            {t(locale, 'triggerHealthCheck') || '触发探测'}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} block={isMobile}>{t(locale, 'addPlatform')}</Button>
        </Space>
      </div>

      <Card styles={{ body: { padding: 0 } }}>
        <Table columns={columns} dataSource={platforms} rowKey="id" loading={loading} pagination={{ pageSize: 20, showSizeChanger: false }} scroll={{ x: 1400 }} />
      </Card>

      <Modal
        title={editItem ? t(locale, 'editPlatform') : t(locale, 'addPlatform')}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditItem(null) }}
        onOk={() => form.submit()}
        width={600}
      >
        {!editItem && (
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>{t(locale, 'quickPreset')}</Text>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {platformPresets.map((p) => (
                <Tag key={p.name} color="processing" style={{ cursor: 'pointer', borderRadius: 4 }} onClick={() => applyPreset(p)}>
                  {getPresetName(p, locale)}
                </Tag>
              ))}
            </div>
          </div>
        )}
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label={t(locale, 'platformName')} rules={[{ required: true }]}>
            <Input placeholder="OpenAI, DeepSeek, etc." />
          </Form.Item>
          <Form.Item name="type" label={t(locale, 'platformType')} rules={[{ required: true }]} initialValue="OpenAI">
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
          {editItem && (
            <>
              <Divider orientation="left" style={{ fontSize: 13 }}>签到与余额</Divider>
              <Form.Item name="checkin_enabled" label={t(locale, 'checkinEnabled')} valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="auto_checkin" label={t(locale, 'autoCheckin')} valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="checkin_session" label="Session">
                <Input.Password placeholder="浏览器 Cookie 中的 session 值" />
              </Form.Item>
              <Form.Item name="checkin_user_id" label="User ID">
                <Input placeholder="NewAPI 用户 ID" />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </div>
  )
}

