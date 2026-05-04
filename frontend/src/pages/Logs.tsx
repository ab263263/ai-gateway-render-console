import { useEffect, useMemo, useState } from 'react'
import {
  Table,
  Tag,
  Typography,
  Card,
  Input,
  Select,
  Space,
  Button,
  Grid,
  Row,
  Col,
  Collapse,
  Empty,
  Statistic,
  theme,
} from 'antd'
import {
  ReloadOutlined,
  FilterOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ApiOutlined,
} from '@ant-design/icons'
import { listLogs } from '../api'
import { useAppContext } from '../ThemeContext'
import { t } from '../i18n'

const { Title, Text } = Typography

function getStatusTag(statusCode?: number) {
  if (!statusCode) return <Tag color="error">0</Tag>
  if (statusCode >= 200 && statusCode < 300) return <Tag color="success">{statusCode}</Tag>
  if (statusCode >= 400 && statusCode < 500) return <Tag color="warning">{statusCode}</Tag>
  return <Tag color="error">{statusCode}</Tag>
}

function getLatencyTag(latency?: number) {
  if (!latency) return <Text type="secondary">-</Text>
  const color = latency < 1000 ? 'success' : latency < 3000 ? 'warning' : 'error'
  return <Tag color={color}>{latency}ms</Tag>
}

export default function Logs() {
  const [logs, setLogs] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState<any>({})
  const { locale } = useAppContext()
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const { token } = theme.useToken()

  const formatTimestamp = (value?: string) => {
    if (!value) return '-'
    try {
      return new Date(value).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')
    } catch {
      return value
    }
  }

  const loadLogs = async (p = page, ps = pageSize, nextFilters = filters) => {
    setLoading(true)
    try {
      const params: any = { page: p, page_size: ps, ...nextFilters }
      const result = await listLogs(params)
      setLogs(result.logs || [])
      setTotal(result.total || 0)
    } catch {
      setLogs([])
      setTotal(0)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadLogs(page, pageSize, filters)
  }, [page, pageSize])

  const handleFilter = () => {
    setPage(1)
    loadLogs(1, pageSize, filters)
  }

  const handleReset = () => {
    const nextFilters = {}
    setFilters(nextFilters)
    setPage(1)
    loadLogs(1, pageSize, nextFilters)
  }

  const activeFilterCount = useMemo(() => ['platform_id', 'model_id', 'status_code'].filter((key) => filters[key] !== undefined && filters[key] !== '').length, [filters])

  const summary = useMemo(() => {
    const pageCount = logs.length
    const successCount = logs.filter((item) => item.status_code >= 200 && item.status_code < 300).length
    const errorCount = logs.filter((item) => !item.status_code || item.status_code >= 400).length
    const sseCount = logs.filter((item) => item.is_stream).length
    const latencyValues = logs.map((item) => Number(item.latency_ms) || 0).filter((value) => value > 0)
    const avgLatency = latencyValues.length > 0 ? Math.round(latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length) : 0

    return {
      pageCount,
      successCount,
      errorCount,
      sseCount,
      avgLatency,
      successRate: pageCount > 0 ? Number(((successCount / pageCount) * 100).toFixed(1)) : 0,
    }
  }, [logs])

  const columns = [
    {
      title: t(locale, 'time'),
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (value: string) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Text style={{ fontSize: 12 }}>{formatTimestamp(value)}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {value ? String(value).replace('T', ' ').slice(0, 19) : '-'}
          </Text>
        </div>
      ),
    },
    {
      title: t(locale, 'requestTarget'),
      key: 'target',
      width: 280,
      render: (_: any, record: any) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text strong>{record.proxy_name || record.platform_name || '-'}</Text>
            {record.is_stream ? <Tag color="processing">SSE</Tag> : <Tag>REST</Tag>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {record.model_id ? <Tag>{record.model_id}</Tag> : <Text type="secondary">-</Text>}
            <Text type="secondary" style={{ fontSize: 12 }}>{record.platform_name || '-'}</Text>
          </div>
        </div>
      ),
    },
    {
      title: t(locale, 'resultSummary'),
      key: 'result',
      width: 170,
      render: (_: any, record: any) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div>{getStatusTag(record.status_code)}</div>
          <div>{getLatencyTag(record.latency_ms)}</div>
        </div>
      ),
    },
    {
      title: 'Token',
      key: 'tokens',
      width: 150,
      render: (_: any, record: any) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Text style={{ fontSize: 12 }}>In: {record.token_input || '-'}</Text>
          <Text style={{ fontSize: 12 }}>Out: {record.token_output || '-'}</Text>
        </div>
      ),
    },
    {
      title: t(locale, 'errorSummary'),
      key: 'error',
      render: (_: any, record: any) => {
        if (!record.error_type && !record.error_message) return <Text type="secondary">-</Text>
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {record.error_type ? <Tag color="error" style={{ width: 'fit-content' }}>{record.error_type}</Tag> : null}
            <Text type="danger" style={{ fontSize: 12 }} ellipsis={{ tooltip: record.error_message || record.error_type }}>
              {record.error_message || record.error_type}
            </Text>
          </div>
        )
      },
    },
  ]

  const filterPanel = (
    <Card style={{ marginBottom: 16, borderRadius: 24, borderColor: token.colorBorderSecondary, boxShadow: token.boxShadowSecondary }} styles={{ body: { padding: isMobile ? 16 : 20 } }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: isMobile ? 'stretch' : 'center', flexDirection: isMobile ? 'column' : 'row', marginBottom: 16 }}>
        <div>
          <Text strong style={{ fontSize: 14 }}>{t(locale, 'logFilterTitle')}</Text>
          <div style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>{t(locale, 'logFilterDesc')}</Text>
          </div>
        </div>
        <Space wrap>
          <Tag color={activeFilterCount > 0 ? 'processing' : 'default'} style={{ borderRadius: 999 }}>
            {t(locale, 'logFilterCount', String(activeFilterCount))}
          </Tag>
          <Button onClick={handleReset}>{t(locale, 'resetFilters')}</Button>
          <Button type="primary" icon={<FilterOutlined />} onClick={handleFilter}>{t(locale, 'search')}</Button>
        </Space>
      </div>

      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12} xl={8}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>{t(locale, 'platformNameOrId')}</Text>
          <Input placeholder={locale === 'zh' ? '例如 OpenAI / deepseek' : 'e.g. OpenAI / deepseek'} value={filters.platform_id || ''} onChange={(event) => setFilters((prev: any) => ({ ...prev, platform_id: event.target.value || undefined }))} allowClear />
        </Col>
        <Col xs={24} sm={12} xl={8}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>{t(locale, 'modelIdLabel')}</Text>
          <Input placeholder={locale === 'zh' ? '例如 gpt-4o / claude-3.7' : 'e.g. gpt-4o / claude-3.7'} value={filters.model_id || ''} onChange={(event) => setFilters((prev: any) => ({ ...prev, model_id: event.target.value || undefined }))} allowClear />
        </Col>
        <Col xs={24} sm={12} xl={8}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>{t(locale, 'statusCodeLabel')}</Text>
          <Select placeholder={t(locale, 'allStatuses')} value={filters.status_code ?? undefined} onChange={(value) => setFilters((prev: any) => ({ ...prev, status_code: value }))} style={{ width: '100%' }} allowClear options={[
            { value: 200, label: locale === 'zh' ? '200 成功' : '200 Success' },
            { value: 400, label: locale === 'zh' ? '400 请求错误' : '400 Bad Request' },
            { value: 401, label: locale === 'zh' ? '401 认证失败' : '401 Unauthorized' },
            { value: 429, label: locale === 'zh' ? '429 限流' : '429 Rate Limited' },
            { value: 500, label: locale === 'zh' ? '500 服务错误' : '500 Server Error' },
            { value: 502, label: locale === 'zh' ? '502 网关错误' : '502 Gateway Error' },
            { value: 0, label: locale === 'zh' ? '0 连接失败' : '0 Connection Failed' },
          ]} />
        </Col>
      </Row>
    </Card>
  )

  const summaryCards = (
    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
      <Col xs={12} lg={6}><Card bordered={false} style={{ borderRadius: 20 }}><Statistic title={t(locale, 'currentPageLogs')} value={summary.pageCount} prefix={<ApiOutlined style={{ color: token.colorPrimary }} />} /></Card></Col>
      <Col xs={12} lg={6}><Card bordered={false} style={{ borderRadius: 20 }}><Statistic title={t(locale, 'successRate')} value={summary.successRate} suffix="%" precision={1} prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />} /></Card></Col>
      <Col xs={12} lg={6}><Card bordered={false} style={{ borderRadius: 20 }}><Statistic title={t(locale, 'avgLatency')} value={summary.avgLatency} suffix="ms" prefix={<ClockCircleOutlined style={{ color: '#faad14' }} />} /></Card></Col>
      <Col xs={12} lg={6}><Card bordered={false} style={{ borderRadius: 20 }}><Statistic title={t(locale, 'exceptionAndSse')} value={`${summary.errorCount} / ${summary.sseCount}`} prefix={<ThunderboltOutlined style={{ color: token.colorPrimary }} />} /></Card></Col>
    </Row>
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', marginBottom: 16, gap: 12, flexDirection: isMobile ? 'column' : 'row' }}>
        <div>
          <Title level={5} style={{ margin: 0 }}>{t(locale, 'requestLogs')}</Title>
          <div style={{ marginTop: 4 }}><Text type="secondary" style={{ fontSize: 12 }}>{t(locale, 'logsDesc')}</Text></div>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => loadLogs(page, pageSize, filters)} loading={loading} block={isMobile}>{t(locale, 'refresh')}</Button>
      </div>

      {summaryCards}
      {filterPanel}

      {logs.length === 0 && !loading ? (
        <Card style={{ borderRadius: 24 }}>
          <Empty description={activeFilterCount > 0 ? t(locale, 'noLogsForFilters') : t(locale, 'noLogsYet')} />
        </Card>
      ) : isMobile ? (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {logs.map((record: any) => (
            <Card key={record.id} style={{ borderRadius: 20 }}>
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                  <div>
                    <Text strong>{record.proxy_name || record.platform_name || '-'}</Text>
                    <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {record.model_id ? <Tag>{record.model_id}</Tag> : <Tag>-</Tag>}
                      {record.is_stream ? <Tag color="processing">SSE</Tag> : <Tag>REST</Tag>}
                      {getStatusTag(record.status_code)}
                    </div>
                  </div>
                  <div>{getLatencyTag(record.latency_ms)}</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                  <div><Text type="secondary">{t(locale, 'targetPlatform')}</Text><div><Text>{record.platform_name || '-'}</Text></div></div>
                  <div><Text type="secondary">{t(locale, 'proxyLabel')}</Text><div><Text>{record.proxy_name || '-'}</Text></div></div>
                  <div><Text type="secondary">Token In</Text><div><Text>{record.token_input || '-'}</Text></div></div>
                  <div><Text type="secondary">Token Out</Text><div><Text>{record.token_output || '-'}</Text></div></div>
                </div>

                <div style={{ padding: '10px 12px', borderRadius: 14, background: token.colorFillAlter }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{t(locale, 'requestTime')}</Text>
                  <div style={{ marginTop: 4 }}><Text style={{ fontSize: 12 }}>{formatTimestamp(record.timestamp)}</Text></div>
                </div>

                {(record.error_type || record.error_message) ? (
                  <Collapse
                    size="small"
                    items={[{ key: 'error', label: <Text type="danger">{record.error_type || t(locale, 'error')}</Text>, children: <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>{record.error_message || '-'}</div> }]}
                  />
                ) : null}
              </Space>
            </Card>
          ))}
        </Space>
      ) : (
        <Card styles={{ body: { padding: 0 } }} style={{ borderRadius: 24 }}>
          <Table
            columns={columns}
            dataSource={logs}
            rowKey="id"
            loading={loading}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              showTotal: (count) => locale === 'zh' ? `共 ${count} 条` : `${count} total`,
              onChange: (p, ps) => {
                setPage(p)
                setPageSize(ps)
              },
            }}
            scroll={{ x: 1020 }}
            expandable={{
              expandedRowRender: (record: any) => (
                <div style={{ padding: '4px 0' }}>
                  <Row gutter={[16, 12]}>
                    <Col span={8}><Text type="secondary">{t(locale, 'targetPlatform')}</Text><div><Text>{record.platform_name || '-'}</Text></div></Col>
                    <Col span={8}><Text type="secondary">{t(locale, 'proxyLabel')}</Text><div><Text>{record.proxy_name || '-'}</Text></div></Col>
                    <Col span={8}><Text type="secondary">{t(locale, 'requestTime')}</Text><div><Text>{formatTimestamp(record.timestamp)}</Text></div></Col>
                  </Row>
                  {(record.error_type || record.error_message) ? (
                    <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: token.colorErrorBg }}>
                      <Text strong type="danger">{record.error_type || t(locale, 'error')}</Text>
                      <div style={{ marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>{record.error_message || '-'}</div>
                    </div>
                  ) : null}
                </div>
              ),
              rowExpandable: (record: any) => Boolean(record.error_message || record.error_type || record.proxy_name || record.platform_name),
            }}
          />
        </Card>
      )}
    </div>
  )
}
