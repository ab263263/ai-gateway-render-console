import { useEffect, useState } from 'react'
import { Card, Form, InputNumber, Input, Select, Button, message, Typography, Divider, Grid, Space, theme } from 'antd'
import { SaveOutlined, DesktopOutlined, ControlOutlined, ThunderboltOutlined, DownloadOutlined, SettingOutlined } from '@ant-design/icons'
import { useAppContext } from '../ThemeContext'
import { t } from '../i18n'
import { getSettings, updateSettings, exportBackup } from '../api'

const { Title, Text } = Typography

export default function Settings() {
  const [form] = Form.useForm()
  const { locale } = useAppContext()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const { token } = theme.useToken()

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    setLoading(true)
    try {
      const data = await getSettings()
      form.setFieldsValue(data)
    } catch {
      message.error(t(locale, 'loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  const onSave = async (values: any) => {
    setSaving(true)
    try {
      await updateSettings(values)
      message.success(t(locale, 'updateSuccess'))
    } catch {
      message.error(t(locale, 'updateFailed'))
    } finally {
      setSaving(false)
    }
  }

  const LOG_OPTIONS = [
    { value: 'error', label: 'Error' },
    { value: 'warn', label: 'Warn' },
    { value: 'info', label: 'Info' },
    { value: 'debug', label: 'Debug' },
    { value: 'trace', label: 'Trace' },
  ]

  const LB_OPTIONS = [
    { value: 'RoundRobin', label: t(locale, 'roundRobin') },
    { value: 'WeightedRandom', label: t(locale, 'weightedRandom') },
    { value: 'LeastConnections', label: t(locale, 'leastConnections') },
    { value: 'Priority', label: t(locale, 'priorityMode') },
    { value: 'LatencyBased', label: t(locale, 'latencyBased') },
  ]

  const sectionIcon = (icon: React.ReactNode) => (
    <div
      style={{
        width: 30,
        height: 30,
        borderRadius: 10,
        background: token.colorPrimaryBg,
        color: token.colorPrimary,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {icon}
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', marginBottom: 16, gap: 12, flexDirection: isMobile ? 'column' : 'row' }}>
        <div>
          <Title level={5} style={{ margin: 0 }}>{t(locale, 'settings')}</Title>
          <div style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {locale === 'zh' ? '统一管理服务监听、默认请求策略、连通性测试和备份导出。' : 'Manage server binding, default request policy, connectivity testing, and backups in one place.'}
            </Text>
          </div>
        </div>
        <Space direction={isMobile ? 'vertical' : 'horizontal'} style={isMobile ? { width: '100%' } : undefined}>
          <Button
            icon={<DownloadOutlined />}
            onClick={async () => {
              try {
                const data = await exportBackup()
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const anchor = document.createElement('a')
                anchor.href = url
                anchor.download = `ai-gateway-backup-${new Date().toISOString().slice(0, 10)}.json`
                anchor.click()
                URL.revokeObjectURL(url)
                message.success(locale === 'zh' ? '备份已下载' : 'Backup exported')
              } catch {
                message.error(locale === 'zh' ? '备份导出失败' : 'Failed to export backup')
              }
            }}
            block={isMobile}
          >
            {locale === 'zh' ? '导出备份' : 'Export Backup'}
          </Button>
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving} form="settings-form" block={isMobile}>
            {t(locale, 'save')}
          </Button>
        </Space>
      </div>

      <Form id="settings-form" form={form} layout="vertical" onFinish={onSave}>
        <Card style={{ marginBottom: 16, borderRadius: 24 }} styles={{ body: { padding: isMobile ? 16 : 20 } }} loading={loading}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            {sectionIcon(<DesktopOutlined />)}
            <div>
              <Text strong>{t(locale, 'serverSettings')}</Text>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {locale === 'zh' ? '控制管理端口、监听地址和日志级别。' : 'Configure admin port, host binding, and log verbosity.'}
                </Text>
              </div>
            </div>
          </div>
          <Form.Item name="admin_port" label={t(locale, 'adminPort')} extra={<Text type="secondary" style={{ fontSize: 11 }}>{t(locale, 'adminPortDesc')}</Text>}>
            <InputNumber min={1024} max={65535} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="host" label={t(locale, 'listenHost')} extra={<Text type="secondary" style={{ fontSize: 11 }}>{t(locale, 'listenHostDesc')}</Text>}>
            <Input placeholder="0.0.0.0" />
          </Form.Item>
          <Form.Item name="log_level" label={t(locale, 'logLevel')} extra={<Text type="secondary" style={{ fontSize: 11 }}>{t(locale, 'logLevelDesc')}</Text>}>
            <Select options={LOG_OPTIONS} />
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 11 }}>{t(locale, 'settingsNote')}</Text>
        </Card>

        <Card style={{ marginBottom: 16, borderRadius: 24 }} styles={{ body: { padding: isMobile ? 16 : 20 } }} loading={loading}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            {sectionIcon(<ControlOutlined />)}
            <div>
              <Text strong>{t(locale, 'defaultSettings')}</Text>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {locale === 'zh' ? '定义默认负载策略、重试行为和请求超时时间。' : 'Define default load balancing, retry behavior, and request timeouts.'}
                </Text>
              </div>
            </div>
          </div>
          <Form.Item name="lb_strategy" label={t(locale, 'lbStrategyDefault')} extra={<Text type="secondary" style={{ fontSize: 11 }}>{t(locale, 'lbStrategyDefaultDesc')}</Text>}>
            <Select options={LB_OPTIONS} />
          </Form.Item>
          <Form.Item name="max_retries" label={t(locale, 'maxRetries')} extra={<Text type="secondary" style={{ fontSize: 11 }}>{t(locale, 'maxRetriesDesc')}</Text>}>
            <InputNumber min={0} max={10} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="retry_backoff_ms" label={t(locale, 'retryBackoffMs')} extra={<Text type="secondary" style={{ fontSize: 11 }}>{t(locale, 'retryBackoffMsDesc')}</Text>}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="request_timeout_secs" label={t(locale, 'requestTimeoutSecs')} extra={<Text type="secondary" style={{ fontSize: 11 }}>{t(locale, 'requestTimeoutSecsDesc')}</Text>}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
        </Card>

        <Card style={{ borderRadius: 24 }} styles={{ body: { padding: isMobile ? 16 : 20 } }} loading={loading}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            {sectionIcon(<ThunderboltOutlined />)}
            <div>
              <Text strong>{t(locale, 'testConnection')}</Text>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {locale === 'zh' ? '调整模型连通性测试的超时时间。' : 'Adjust the timeout used when probing model connectivity.'}
                </Text>
              </div>
            </div>
          </div>
          <Form.Item name="test_connection_timeout_secs" label={t(locale, 'testConnTimeoutSecs')} extra={<Text type="secondary" style={{ fontSize: 11 }}>{t(locale, 'testConnTimeoutSecsDesc')}</Text>}>
            <InputNumber min={1} max={120} style={{ width: '100%' }} />
          </Form.Item>
        </Card>
      </Form>
    </div>
  )
}
