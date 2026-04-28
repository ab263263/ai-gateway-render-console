import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Col, Input, InputNumber, Row, Select, Space, Tag, Typography, message } from 'antd'
import { ApiOutlined, SendOutlined } from '@ant-design/icons'
import { listPlatforms, fetchRemoteModels, testPlatformChat } from '../api'
import { useAppContext } from '../ThemeContext'
import { t } from '../i18n'

const { Text, Title, Paragraph } = Typography

type RemoteModelResult = {
  success?: boolean
  models?: { id: string; owned_by?: string }[]
  count?: number
  message?: string
  platform_name?: string
}

export default function ChatTest() {
  const { locale } = useAppContext()
  const [platforms, setPlatforms] = useState<any[]>([])
  const [loadingPlatforms, setLoadingPlatforms] = useState(false)
  const [selectedPlatformId, setSelectedPlatformId] = useState<string>()
  const [selectedModelId, setSelectedModelId] = useState<string>()
  const [messageText, setMessageText] = useState('回复一句 OK，并带上你实际命中的模型名')
  const [maxTokens, setMaxTokens] = useState(128)
  const [loadingModels, setLoadingModels] = useState(false)
  const [testing, setTesting] = useState(false)
  const [modelMap, setModelMap] = useState<Record<string, RemoteModelResult>>({})
  const [testResult, setTestResult] = useState<any>(null)

  useEffect(() => { void loadPlatforms() }, [])

  const loadPlatforms = async () => {
    setLoadingPlatforms(true)
    try {
      const data = await listPlatforms()
      setPlatforms(data)
    } catch {
      message.error(t(locale, 'loadFailed'))
    }
    setLoadingPlatforms(false)
  }

  const selectedPlatform = useMemo(
    () => platforms.find((item: any) => item.id === selectedPlatformId),
    [platforms, selectedPlatformId],
  )

  const currentModels = modelMap[selectedPlatformId || '']?.models || []

  const handleFetchModels = async (platformId?: string) => {
    const targetId = platformId || selectedPlatformId
    if (!targetId) {
      message.warning(t(locale, 'selectPlatform'))
      return
    }
    setLoadingModels(true)
    try {
      const result = await fetchRemoteModels(targetId)
      setModelMap(prev => ({ ...prev, [targetId]: result }))
      const count = result?.count || result?.models?.length || 0
      if (result?.success === false) {
        message.error(result?.message || t(locale, 'fetchRemoteModelsFailed'))
      } else {
        message.success(`${t(locale, 'fetchFromPlatform')}${count > 0 ? `：${count}` : ''}`)
      }
    } catch (e: any) {
      message.error(e?.response?.data?.error?.message || t(locale, 'fetchRemoteModelsFailed'))
    }
    setLoadingModels(false)
  }

  const handlePlatformChange = async (value: string) => {
    setSelectedPlatformId(value)
    setSelectedModelId(undefined)
    setTestResult(null)
    if (!modelMap[value]) {
      await handleFetchModels(value)
    }
  }

  const handleTest = async () => {
    if (!selectedPlatformId) {
      message.warning(t(locale, 'selectPlatform'))
      return
    }
    if (!selectedModelId) {
      message.warning(t(locale, 'selectModel'))
      return
    }
    setTesting(true)
    try {
      const result = await testPlatformChat(selectedPlatformId, {
        model_id: selectedModelId,
        message: messageText,
        max_tokens: maxTokens,
      })
      setTestResult(result)
      if (result?.success) {
        message.success(`${t(locale, 'testConnectionSuccess')} (${result.latency_ms}ms)`)
      } else {
        message.error(result?.message || t(locale, 'testConnectionFailed'))
      }
    } catch (e: any) {
      const err = e?.response?.data?.error?.message || e?.message || t(locale, 'testConnectionFailed')
      setTestResult({ success: false, status: 0, latency_ms: 0, message: err, output: '' })
      message.error(err)
    }
    setTesting(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0 }}>{t(locale, 'chatTest')}</Title>
        <Button icon={<ApiOutlined />} onClick={() => handleFetchModels()} loading={loadingModels} disabled={!selectedPlatformId}>
          {t(locale, 'fetchFromPlatform')}
        </Button>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card>
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <div>
                <Text strong>{t(locale, 'selectPlatform')}</Text>
                <Select
                  style={{ width: '100%', marginTop: 8 }}
                  placeholder={t(locale, 'selectPlatform')}
                  loading={loadingPlatforms}
                  value={selectedPlatformId}
                  options={platforms.map((p: any) => ({ value: p.id, label: p.name }))}
                  onChange={handlePlatformChange}
                />
              </div>

              <div>
                <Text strong>{t(locale, 'selectModel')}</Text>
                <Select
                  showSearch
                  style={{ width: '100%', marginTop: 8 }}
                  placeholder={t(locale, 'selectRemoteModel')}
                  value={selectedModelId}
                  options={currentModels.map(m => ({ value: m.id, label: m.id }))}
                  onChange={setSelectedModelId}
                  filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase())}
                />
              </div>

              <div>
                <Text strong>{t(locale, 'testMessage')}</Text>
                <Input.TextArea rows={5} value={messageText} onChange={e => setMessageText(e.target.value)} style={{ marginTop: 8 }} />
              </div>

              <div>
                <Text strong>{t(locale, 'maxTokens')}</Text>
                <InputNumber min={1} value={maxTokens} onChange={v => setMaxTokens(Number(v || 128))} style={{ width: '100%', marginTop: 8 }} />
              </div>

              <Button type="primary" icon={<SendOutlined />} onClick={handleTest} loading={testing}>
                {t(locale, 'runChatTest')}
              </Button>
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title={t(locale, 'platformModels')}>
            {!selectedPlatform && <Text type="secondary">{t(locale, 'selectPlatform')}</Text>}
            {selectedPlatform && (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <div>
                  <Text strong>{selectedPlatform.name}</Text>
                  <Paragraph type="secondary" style={{ marginBottom: 0 }}>{selectedPlatform.base_url}</Paragraph>
                </div>
                {modelMap[selectedPlatform.id]?.message && modelMap[selectedPlatform.id]?.success === false && (
                  <Alert type="error" showIcon message={modelMap[selectedPlatform.id]?.message} />
                )}
                <div>
                  <Text type="secondary">
                    {t(locale, 'remoteModelsCount', String(modelMap[selectedPlatform.id]?.count || currentModels.length || 0))}
                  </Text>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {currentModels.length > 0 ? currentModels.map(m => (
                    <Tag
                      key={m.id}
                      color={selectedModelId === m.id ? 'processing' : 'default'}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedModelId(m.id)}
                    >
                      {m.id}
                    </Tag>
                  )) : <Text type="secondary">{t(locale, 'noRemoteModels')}</Text>}
                </div>
              </Space>
            )}
          </Card>

          <Card title={t(locale, 'chatTestResult')} style={{ marginTop: 16 }}>
            {!testResult && <Text type="secondary">{t(locale, 'noRequests')}</Text>}
            {testResult && (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Alert
                  type={testResult.success ? 'success' : 'error'}
                  showIcon
                  message={testResult.success ? t(locale, 'testConnectionSuccess') : t(locale, 'testConnectionFailed')}
                  description={testResult.message}
                />
                <div>
                  <Text strong>HTTP:</Text> <Text code>{String(testResult.status ?? '-')}</Text>
                  <Text strong style={{ marginLeft: 12 }}>{t(locale, 'latency')}:</Text> <Text code>{String(testResult.latency_ms ?? 0)}ms</Text>
                </div>
                <div>
                  <Text strong>{t(locale, 'responseText')}</Text>
                  <Card size="small" styles={{ body: { whiteSpace: 'pre-wrap', wordBreak: 'break-word' } }} style={{ marginTop: 8 }}>
                    {testResult.output || JSON.stringify(testResult.raw || {}, null, 2)}
                  </Card>
                </div>
              </Space>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}
