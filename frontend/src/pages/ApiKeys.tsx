import { useEffect, useState } from 'react'
import {
  Button, Table, Modal, Form, Input, Space,
  message, Card, Popconfirm, Typography, Select,
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, CopyOutlined,
} from '@ant-design/icons'
import { listApiKeys, createApiKey, deleteApiKey, listProxies } from '../api'
import { useAppContext } from '../ThemeContext'
import { t } from '../i18n'

const { Text, Title } = Typography

function generateAgToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let token = 'sk-ag-'
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return token
}

function maskKey(key: string): string {
  if (!key) return '-'
  if (key.length <= 14) return key // won't happen but safe
  const prefix = key.slice(0, 11)  // sk-ag- + first 5 chars = 11
  const suffix = key.slice(-4)
  return `${prefix}****${suffix}`
}

interface ApiKeyRecord {
  id: string
  name: string
  key: string
  proxy_id: string | null
  created_at: string
  last_used: string | null
}

interface ProxyOption {
  id: string
  name: string
}

export default function ApiKeys() {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([])
  const [proxies, setProxies] = useState<ProxyOption[]>([])
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [form] = Form.useForm()
  const { locale } = useAppContext()
  // Show generated key after creation
  const [createdKey, setCreatedKey] = useState<string>('')

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [keysData, proxiesData] = await Promise.all([listApiKeys(), listProxies()])
      setKeys(keysData)
      setProxies(proxiesData)
    } catch (e) {
      message.error(t(locale, 'loadFailed'))
    }
    setLoading(false)
  }

  const handleCreate = async (values: any) => {
    try {
      const key = generateAgToken()
      await createApiKey({ name: values.name, key, proxy_id: values.proxy_id || null })
      setCreatedKey(key)
      message.success(t(locale, 'createSuccess'))
      loadAll()
    } catch { message.error(t(locale, 'createFailed')) }
  }

  const handleDelete = async (id: string) => {
    try { await deleteApiKey(id); message.success(t(locale, 'deleteSuccess')); loadAll() } catch { message.error(t(locale, 'deleteFailed')) }
  }

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).then(() => message.success('Copied!')).catch(() => {})
  }

  const proxyMap = Object.fromEntries(proxies.map(p => [p.id, p.name]))

  const columns = [
    {
      title: t(locale, 'apiKeyName'),
      dataIndex: 'name',
      key: 'name',
      width: 160,
      render: (v: string) => <Text strong>{v}</Text>,
    },
    {
      title: t(locale, 'apiKeyKey'),
      dataIndex: 'key',
      key: 'key',
      width: 220,
      render: (v: string) => (
        <Space>
          <Text code style={{ fontSize: 12 }}>{maskKey(v)}</Text>
          <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => copyText(v)} />
        </Space>
      ),
    },
    {
      title: t(locale, 'proxyBinding'),
      dataIndex: 'proxy_id',
      key: 'proxy_id',
      width: 140,
      render: (v: string | null) =>
        v ? <Text style={{ color: '#1677ff' }}>{proxyMap[v] ?? v}</Text> : <Text type="secondary">-</Text>,
    },
    {
      title: t(locale, 'apiKeyLastUsed'),
      dataIndex: 'last_used',
      key: 'last_used',
      width: 170,
      render: (v: string | null) =>
        v ? <Text type="secondary" style={{ fontSize: 12 }}>{new Date(v).toLocaleString()}</Text> : <Text type="secondary">-</Text>,
    },
    {
      title: t(locale, 'apiKeyCreatedAt'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (v: string) =>
        <Text type="secondary" style={{ fontSize: 12 }}>{v ? new Date(v).toLocaleString() : '-'}</Text>,
    },
    {
      title: t(locale, 'action'),
      key: 'action',
      width: 60,
      render: (_: any, record: ApiKeyRecord) => (
        <Popconfirm title={t(locale, 'deleteConfirm')} onConfirm={() => handleDelete(record.id)}>
          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0 }}>{t(locale, 'apiKeys')}</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setCreateOpen(true); setCreatedKey('') }}>
          {t(locale, 'newApiKey')}
        </Button>
      </div>

      <Card styles={{ body: { padding: 0 } }}>
        <Table
          columns={columns}
          dataSource={keys}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: false }}
        />
      </Card>

      <Modal
        title={t(locale, 'newApiKey')}
        open={createOpen}
        onCancel={() => { setCreateOpen(false); setCreatedKey('') }}
        footer={createdKey ? (
          <Button type="primary" onClick={() => { setCreateOpen(false); form.resetFields(); setCreatedKey('') }}>
            {t(locale, 'confirm')}
          </Button>
        ) : null}
        okText={t(locale, 'create')}
        {...(!createdKey ? { onOk: () => form.submit() } : {})}
      >
        {createdKey ? (
          <div style={{ padding: '16px 0' }}>
            <Text type="secondary">{t(locale, 'apiKeyCreatedTip')}</Text>
            <div style={{
              marginTop: 12,
              background: 'var(--ant-color-bg-container)',
              border: '1px solid var(--ant-color-border)',
              borderRadius: 8,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}>
              <Text code style={{ fontSize: 13, wordBreak: 'break-all' }}>{createdKey}</Text>
              <Button size="small" icon={<CopyOutlined />} onClick={() => copyText(createdKey)} />
            </div>
          </div>
        ) : (
          <Form form={form} layout="vertical" onFinish={handleCreate}>
            <Form.Item name="name" label={t(locale, 'apiKeyName')} rules={[{ required: true }]}>
              <Input placeholder={t(locale, 'apiKeyNamePlaceholder')} />
            </Form.Item>
            <Form.Item name="proxy_id" label={t(locale, 'proxyBinding')}>
              <Select
                allowClear
                placeholder={t(locale, 'proxyBindingPlaceholder')}
                options={proxies.map(p => ({ label: p.name, value: p.id }))}
              />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </div>
  )
}