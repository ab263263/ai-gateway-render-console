import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Col, Input, InputNumber, Row, Select, Space, Table, Tag, Typography, message } from 'antd'
import { ApiOutlined, SendOutlined, PlayCircleOutlined } from '@ant-design/icons'
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

type TestRow = {
  key: string
  model_id: string
  success: boolean
  status: number
  latency_ms: number
  message: string
  output?: string
  actual_model?: string
}

export default function ChatTest() {
  const { locale } = useAppContext()
  const [platforms, setPlatforms] = useState<any[]>([])
  const [loadingPlatforms, setLoadingPlatforms] = useState(false)
  const [selectedPlatformId, setSelectedPlatformId] = useState<string>()
  const [selectedModelId, setSelectedModelId] = useState<string>()
  const [manualModelId, setManualModelId] = useState('')
  const [messageText, setMessageText] = useState('回复一句 OK，并带上你实际命中的模型名')
  const [maxTokens, setMaxTokens] = useState(128)
  const [loadingModels, setLoadingModels] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testingAll, setTestingAll] = useState(false)
  const [modelMap, setModelMap] = useState<Record<string, RemoteModelResult>>({})
  const [testResult, setTestResult] = useState<any>(null)
  const [batchResults, setBatchResults] = useState<TestRow[]>([])

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
  const effectiveModelId = manualModelId.trim() || selectedModelId || ''

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
    setManualModelId('')
    setTestResult(null)
    setBatchResults([])
    if (!modelMap[value]) {
      await handleFetchModels(value)
    }
  }

  const normalizeResult = (modelId: string, result: any): TestRow => ({
    key: modelId,
    model_id: modelId,
    success: !!result?.success,
    status: Number(result?.status || 0),
    latency_ms: Number(result?.latency_ms || 0),
    message: result?.message || '',
    output: result?.output || '',
    actual_model: result?.raw?.model || result?.model || '',
  })

  const runSingleTest = async (modelId: string) => {
    if (!selectedPlatformId) {
      message.warning(t(locale, 'selectPlatform'))
      return null
    }
    const result = await testPlatformChat(selectedPlatformId, {
      model_id: modelId,
      message: messageText,
      max_tokens: maxTokens,
    })
    return normalizeResult(modelId, result)
  }

  const handleTest = async () => {
    if (!selectedPlatformId) {
      message.warning(t(locale, 'selectPlatform'))
      return
    }
    if (!effectiveModelId) {
      message.warning(t(locale, 'selectModel'))
      return
    }
    setTesting(true)
    try {
      const result = await runSingleTest(effectiveModelId)
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

  const handleSingleRowTest = async (modelId: string) => {
    setSelectedModelId(modelId)
    setManualModelId('')
    setTesting(true)
    try {
      const result = await runSingleTest(modelId)
      if (result) {
        setTestResult(result)
        setBatchResults(prev => {
          const next = prev.filter(item => item.model_id !== modelId)
          return [result, ...next]
        })
      }
    } catch (e: any) {
      message.error(e?.response?.data?.error?.message || e?.message || t(locale, 'testConnectionFailed'))
    }
    setTesting(false)
  }

  const handleTestAll = async () => {
    if (!selectedPlatformId) {
      message.warning(t(locale, 'selectPlatform'))
      return
    }
    if (currentModels.length === 0) {
      message.warning(t(locale, 'noRemoteModels'))
      return
    }
    setTestingAll(true)
    const results: TestRow[] = []
    for (const model of currentModels) {
      try {
        const result = await runSingleTest(model.id)
        if (result) results.push(result)
      } catch (e: any) {
        results.push({
          key: model.id,
          model_id: model.id,
          success: false,
          status: 0,
          latency_ms: 0,
          message: e?.response?.data?.error?.message || e?.message || t(locale, 'testConnectionFailed'),
          output: '',
          actual_model: '',
        })
      }
    }
    setBatchResults(results)
    setTestingAll(false)
    message.success(`完成 ${results.length} 个模型测试`)
  }

  const batchColumns = [
    { title: t(locale, 'modelId'), dataIndex: 'model_id', key: 'model_id', width: 220 },
    {
      title: t(locale, 'status'), dataIndex: 'success', key: 'success', width: 90,
      render: (v: boolean) => <Tag color={v ? 'success' : 'error'}>{v ? 'OK' : 'FAIL'}</Tag>,
    },
    { title: 'HTTP', dataIndex: 'status', key: 'status', width: 80 },
    { title: t(locale, 'latency'), dataIndex: 'latency_ms', key: 'latency_ms', width: 90, render: (v: number) => `${v}ms` },
    { title: t(locale, 'actualModel'), dataIndex: 'actual_model', key: 'actual_model', width: 220, render: (v: string) => v || '-' },
    { title: t(locale, 'responseText'), dataIndex: 'message', key: 'message', ellipsis: true },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0 }}>{t(locale, 'chatTest')}</Title>
        <Space>
          <Button icon={<ApiOutlined />} onClick={() => handleFetchModels()} loading={loadingModels} disabled={!selectedPlatformId}>
            {t(locale, 'fetchFromPlatform')}
          </Button>
          <Button icon={<PlayCircleOutlined />} onClick={handleTestAll} loading={testingAll} disabled={!selectedPlatformId || currentModels.length === 0}>
            {t(locale, 'testAllModels')}
          </Button>
        </Space>
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
                  allowClear
                />
              </div>

              <div>
                <Text strong>{t(locale, 'manualModelId')}</Text>
                <Input value={manualModelId} onChange={e => setManualModelId(e.target.value)} placeholder="例如：gpt-5.5 / K2.6 / MiniMax-M2.7" style={{ marginTop: 8 }} />
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
                      onClick={() => { setSelectedModelId(m.id); setManualModelId('') }}
                    >
                      <Space size={4}>
                        <span>{m.id}</span>
                        <PlayCircleOutlined onClick={(e) => { e.stopPropagation(); void handleSingleRowTest(m.id) }} />
                      </Space>
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
                  <Text strong>{t(locale, 'actualModel')}</Text> <Text code>{testResult.actual_model || '-'}</Text>
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

          <Card title={t(locale, 'batchTestResult')} style={{ marginTop: 16 }}>
            <Table columns={batchColumns as any} dataSource={batchResults} pagination={false} rowKey="key" locale={{ emptyText: t(locale, 'noRequests') }} scroll={{ x: 900 }} />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
