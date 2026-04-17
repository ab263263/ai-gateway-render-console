import { useEffect, useState } from 'react'
import { Card, Form, InputNumber, Select, Button, message, Typography, Alert, Divider, Space, Input } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import { getSettings, updateSettings } from '../api'
import { useAppContext } from '../ThemeContext'
import { t } from '../i18n'

const { Title, Text, Paragraph } = Typography

export default function Settings() {
  const [form] = Form.useForm()
  const { locale } = useAppContext()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [currentPort, setCurrentPort] = useState(1994)

  useEffect(() => { loadSettings() }, [])

  const loadSettings = async () => {
    setLoading(true)
    try {
      const data = await getSettings()
      form.setFieldsValue(data)
      setCurrentPort(data.admin_port)
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
      if (values.admin_port !== currentPort) {
        message.warning(t(locale, 'portChangeHint'), 6)
      }
      setCurrentPort(values.admin_port)
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

  return (
    <div style={{ maxWidth: 720 }}>
      <Alert
        message={t(locale, 'settingsNote')}
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Form form={form} layout="vertical" onFinish={onSave}>
        {/* Server Section */}
        <Card
          title={<Title level={5} style={{ margin: 0 }}>{t(locale, 'serverSettings')}</Title>}
          loading={loading}
          style={{ marginBottom: 24 }}
        >
          <Form.Item name="admin_port" label={t(locale, 'adminPort')} rules={[{ required: true }]}
            extra={<Text type="secondary" style={{ fontSize: 12 }}>{t(locale, 'adminPortDesc')}</Text>}>
            <InputNumber min={1} max={65535} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="host" label={t(locale, 'listenHost')} rules={[{ required: true }]}
            extra={<Text type="secondary" style={{ fontSize: 12 }}>{t(locale, 'listenHostDesc')}</Text>}>
            <Input />
          </Form.Item>
          <Form.Item name="log_level" label={t(locale, 'logLevel')}
            extra={<Text type="secondary" style={{ fontSize: 12 }}>{t(locale, 'logLevelDesc')}</Text>}>
            <Select options={LOG_OPTIONS} />
          </Form.Item>
        </Card>

        {/* Request Policy Section */}
        <Card
          title={<Title level={5} style={{ margin: 0 }}>{t(locale, 'defaultSettings')}</Title>}
          loading={loading}
          style={{ marginBottom: 24 }}
        >
          <Form.Item name="lb_strategy" label={t(locale, 'lbStrategyDefault')}
            extra={<Text type="secondary" style={{ fontSize: 12 }}>{t(locale, 'lbStrategyDefaultDesc')}</Text>}>
            <Select options={LB_OPTIONS} />
          </Form.Item>
          <Form.Item name="max_retries" label={t(locale, 'maxRetries')}
            extra={<Text type="secondary" style={{ fontSize: 12 }}>{t(locale, 'maxRetriesDesc')}</Text>}>
            <InputNumber min={0} max={10} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="retry_backoff_ms" label={t(locale, 'retryBackoffMs')}
            extra={<Text type="secondary" style={{ fontSize: 12 }}>{t(locale, 'retryBackoffMsDesc')}</Text>}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="request_timeout_secs" label={t(locale, 'requestTimeoutSecs')}
            extra={<Text type="secondary" style={{ fontSize: 12 }}>{t(locale, 'requestTimeoutSecsDesc')}</Text>}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
        </Card>

        <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving} size="large">
          {t(locale, 'save')}
        </Button>
      </Form>
    </div>
  )
}
