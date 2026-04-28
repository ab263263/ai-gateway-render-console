import { useEffect, useState } from 'react'
import { Button, Table, Modal, Form, Input, Select, Tag, Space, message, Popconfirm, Card, Typography, Alert } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, KeyOutlined, CloudDownloadOutlined, ImportOutlined } from '@ant-design/icons'
import { listPlatforms, createPlatform, updatePlatform, deletePlatform, fetchRemoteModels, importRemoteModels } from '../api'
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
  const [platformModels, setPlatformModels] = useState<Record<string, PlatformModelState>>({})
  const { locale } = useAppContext()

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
      width: 90,
      render: (v: string) => <Tag color={v === 'Active' ? 'success' : 'default'} style={{ borderRadius: 4 }}>{v === 'Active' ? t(locale, 'active') : v}</Tag>,
    },
    {
      title: 'API Key',
      dataIndex: 'api_key',
      key: 'api_key',
      width: 120,
      render: (v: string) => v ? <Text code style={{ fontSize: 12 }}>{v.slice(0, 8)}...</Text> : <Text type="secondary">-</Text>,
    },
    {
      title: t(locale, 'supportedModels'),
      key: 'supported_models',
      render: (_: any, record: any) => {
        const state = platformModels[record.id]
        const models = state?.models || []
        return (
          <div style={{ minWidth: 380 }}>
            {state?.message && state?.success === false && (
              <Alert type="error" showIcon message={state.message} style={{ marginBottom: 8 }} />
            )}
            {state?.importMessage && (
              <Alert type="success" showIcon message={state.importMessage} style={{ marginBottom: 8 }} />
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <Button
                size="small"
                icon={<CloudDownloadOutlined />}
                loading={fetchingId === record.id}
                onClick={() => handleFetchModels(record)}
              >
                {t(locale, 'fetchFromPlatform')}
              </Button>
              <Button
                size="small"
                icon={<ImportOutlined />}
                loading={importingId === record.id}
                onClick={() => handleImportModels(record)}
                disabled={models.length === 0}
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
      width: 90,
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0 }}>{t(locale, 'platforms')}</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t(locale, 'addPlatform')}</Button>
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
        </Form>
      </Modal>
    </div>
  )
}

