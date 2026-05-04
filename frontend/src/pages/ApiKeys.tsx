import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Table,
  Drawer,
  Form,
  Input,
  Space,
  message,
  Card,
  Popconfirm,
  Typography,
  Select,
  Grid,
  Tag,
  Row,
  Col,
  Statistic,
  Empty,
} from 'antd'
import { PlusOutlined, DeleteOutlined, CopyOutlined, KeyOutlined, LinkOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
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
  if (key.length <= 14) return key
  const prefix = key.slice(0, 11)
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
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const [createdKey, setCreatedKey] = useState('')

  useEffect(() => {
    loadAll()
  }, [])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [keysData, proxiesData] = await Promise.all([listApiKeys(), listProxies()])
      setKeys(keysData)
      setProxies(proxiesData)
    } catch {
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
    } catch {
      message.error(t(locale, 'createFailed'))
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteApiKey(id)
      message.success(t(locale, 'deleteSuccess'))
      loadAll()
    } catch {
      message.error(t(locale, 'deleteFailed'))
    }
  }

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).then(() => message.success(locale === 'zh' ? '已复制' : 'Copied')).catch(() => {})
  }

  const proxyMap = Object.fromEntries(proxies.map((item) => [item.id, item.name]))

  const formatDateTime = (value?: string | null) => {
    if (!value) return '-'
    try {
      return new Date(value).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')
    } catch {
      return value
    }
  }

  const summary = useMemo(() => {
    const total = keys.length
    const bound = keys.filter((item) => Boolean(item.proxy_id)).length
    const global = keys.filter((item) => !item.proxy_id).length
    const used = keys.filter((item) => Boolean(item.last_used)).length
    return { total, bound, global, used }
  }, [keys])

  const columns = [
    {
      title: locale === 'zh' ? 'Key 信息' : 'Key Info',
      key: 'name',
      width: 260,
      render: (_: any, record: ApiKeyRecord) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0' }}>
          <Text strong>{record.name}</Text>
          <Space>
            <Text code style={{ fontSize: 12 }}>{maskKey(record.key)}</Text>
            <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => copyText(record.key)} />
          </Space>
        </div>
      ),
    },
    {
      title: locale === 'zh' ? '作用范围' : 'Scope',
      key: 'scope',
      width: 180,
      render: (_: any, record: ApiKeyRecord) => (
        record.proxy_id ? <Tag color="blue">{proxyMap[record.proxy_id] ?? record.proxy_id}</Tag> : <Tag>{locale === 'zh' ? '全局可用' : 'Global'}</Tag>
      ),
    },
    {
      title: locale === 'zh' ? '使用情况' : 'Usage',
      key: 'usage',
      width: 180,
      render: (_: any, record: ApiKeyRecord) => (
        <Space direction="vertical" size={4}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {locale === 'zh' ? '最后使用' : 'Last Used'}：{formatDateTime(record.last_used)}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {locale === 'zh' ? '创建时间' : 'Created'}：{formatDateTime(record.created_at)}
          </Text>
        </Space>
      ),
    },
    {
      title: t(locale, 'action'),
      key: 'action',
      width: 70,
      render: (_: any, record: ApiKeyRecord) => (
        <Popconfirm title={t(locale, 'deleteConfirm')} onConfirm={() => handleDelete(record.id)}>
          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', marginBottom: 16, gap: 12, flexDirection: isMobile ? 'column' : 'row' }}>
        <div>
          <Title level={5} style={{ margin: 0 }}>{t(locale, 'apiKeys')}</Title>
          <div style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {locale === 'zh' ? '管理全局与代理级 API Key，并追踪最近使用情况。' : 'Manage global or proxy-scoped API keys and review recent usage.'}
            </Text>
          </div>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setCreateOpen(true); setCreatedKey('') }} block={isMobile}>
          {t(locale, 'newApiKey')}
        </Button>
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 20 }}>
            <Statistic title={locale === 'zh' ? 'Key 总数' : 'Total Keys'} value={summary.total} prefix={<KeyOutlined style={{ color: 'var(--ant-color-primary)' }} />} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 20 }}>
            <Statistic title={locale === 'zh' ? '绑定代理' : 'Bound Keys'} value={summary.bound} prefix={<LinkOutlined style={{ color: '#1890ff' }} />} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 20 }}>
            <Statistic title={locale === 'zh' ? '全局 Key' : 'Global Keys'} value={summary.global} prefix={<SafetyCertificateOutlined style={{ color: '#52c41a' }} />} />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 20 }}>
            <Statistic title={locale === 'zh' ? '已使用' : 'Used'} value={summary.used} prefix={<CopyOutlined style={{ color: 'var(--ant-color-primary)' }} />} />
          </Card>
        </Col>
      </Row>

      {keys.length === 0 && !loading ? (
        <Card style={{ borderRadius: 24 }}>
          <Empty description={locale === 'zh' ? '还没有 API Key。' : 'No API keys yet.'} />
        </Card>
      ) : isMobile ? (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {keys.map((record) => (
            <Card key={record.id} style={{ borderRadius: 20 }}>
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                  <div>
                    <Text strong>{record.name}</Text>
                    <div style={{ marginTop: 6 }}>
                      <Text code>{maskKey(record.key)}</Text>
                    </div>
                  </div>
                  <Space>
                    <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => copyText(record.key)} />
                    <Popconfirm title={t(locale, 'deleteConfirm')} onConfirm={() => handleDelete(record.id)}>
                      <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                  <div>
                    <Text type="secondary">{t(locale, 'proxyBinding')}</Text>
                    <div>{record.proxy_id ? <Tag color="blue">{proxyMap[record.proxy_id] ?? record.proxy_id}</Tag> : <Tag>{locale === 'zh' ? '全局可用' : 'Global'}</Tag>}</div>
                  </div>
                  <div>
                    <Text type="secondary">{t(locale, 'apiKeyLastUsed')}</Text>
                    <div><Text>{formatDateTime(record.last_used)}</Text></div>
                  </div>
                </div>

                <Text type="secondary" style={{ fontSize: 12 }}>{formatDateTime(record.created_at)}</Text>
              </Space>
            </Card>
          ))}
        </Space>
      ) : (
        <Card styles={{ body: { padding: 0 } }} style={{ borderRadius: 24 }}>
          <Table columns={columns} dataSource={keys} rowKey="id" loading={loading} pagination={{ pageSize: 20, showSizeChanger: false }} />
        </Card>
      )}

      <Drawer
        title={t(locale, 'newApiKey')}
        open={createOpen}
        onClose={() => { setCreateOpen(false); setCreatedKey(''); form.resetFields() }}
        width={isMobile ? '100%' : 460}
        extra={!createdKey ? <Button type="primary" onClick={() => form.submit()}>{t(locale, 'create')}</Button> : null}
      >
        {createdKey ? (
          <div style={{ padding: '8px 0' }}>
            <Text type="secondary">{t(locale, 'apiKeyCreatedTip')}</Text>
            <div style={{ marginTop: 12, background: 'var(--ant-color-bg-container)', border: '1px solid var(--ant-color-border)', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Text code style={{ fontSize: 13, wordBreak: 'break-all' }}>{createdKey}</Text>
              <Button size="small" icon={<CopyOutlined />} onClick={() => copyText(createdKey)} />
            </div>
            <Button type="primary" style={{ marginTop: 16 }} onClick={() => { setCreateOpen(false); form.resetFields(); setCreatedKey('') }} block>
              {t(locale, 'confirm')}
            </Button>
          </div>
        ) : (
          <Form form={form} layout="vertical" onFinish={handleCreate}>
            <Form.Item name="name" label={t(locale, 'apiKeyName')} rules={[{ required: true }]}> 
              <Input placeholder={t(locale, 'apiKeyNamePlaceholder')} />
            </Form.Item>
            <Form.Item name="proxy_id" label={t(locale, 'proxyBinding')}>
              <Select allowClear placeholder={t(locale, 'proxyBindingPlaceholder')} options={proxies.map((item) => ({ label: item.name, value: item.id }))} />
            </Form.Item>
          </Form>
        )}
      </Drawer>
    </div>
  )
}
