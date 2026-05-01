import { useEffect, useState } from 'react'
import { Table, Tag, Typography, Card, Input, Select, Space, Button, DatePicker, Grid } from 'antd'
import { ReloadOutlined, FilterOutlined } from '@ant-design/icons'
import { listLogs } from '../api'
import { useAppContext } from '../ThemeContext'
import { t } from '../i18n'

const { Title, Text } = Typography
const { RangePicker } = DatePicker

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

  const loadLogs = async (p = page, ps = pageSize) => {
    setLoading(true)
    try {
      const params: any = { page: p, page_size: ps, ...filters }
      if (params.start_time && params.start_time.$d) {
        params.start_time = params.start_time.$d.toISOString()
      }
      if (params.end_time && params.end_time.$d) {
        params.end_time = params.end_time.$d.toISOString()
      }
      const result = await listLogs(params)
      setLogs(result.logs || [])
      setTotal(result.total || 0)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { loadLogs() }, [page, pageSize])

  const handleFilter = () => {
    setPage(1)
    loadLogs(1)
  }

  const columns = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 170,
      render: (v: string) => {
        if (!v) return '-'
        try {
          return <Text style={{ fontSize: 12 }}>{new Date(v).toLocaleString('zh-CN')}</Text>
        } catch { return <Text style={{ fontSize: 12 }}>{v}</Text> }
      },
    },
    {
      title: '平台',
      dataIndex: 'platform_name',
      key: 'platform_name',
      width: 120,
      ellipsis: true,
      render: (v: string) => v || <Text type="secondary">-</Text>,
    },
    {
      title: '模型',
      dataIndex: 'model_id',
      key: 'model_id',
      width: 140,
      ellipsis: true,
      render: (v: string) => v ? <Tag>{v}</Tag> : <Text type="secondary">-</Text>,
    },
    {
      title: '虚拟模型',
      dataIndex: 'proxy_name',
      key: 'proxy_name',
      width: 120,
      ellipsis: true,
      render: (v: string) => v || <Text type="secondary">-</Text>,
    },
    {
      title: '状态码',
      dataIndex: 'status_code',
      key: 'status_code',
      width: 80,
      render: (v: number) => {
        if (!v) return <Tag color="error">0</Tag>
        if (v >= 200 && v < 300) return <Tag color="success">{v}</Tag>
        if (v >= 400 && v < 500) return <Tag color="warning">{v}</Tag>
        return <Tag color="error">{v}</Tag>
      },
    },
    {
      title: '延迟(ms)',
      dataIndex: 'latency_ms',
      key: 'latency_ms',
      width: 90,
      render: (v: number) => {
        if (!v) return <Text type="secondary">-</Text>
        const color = v < 1000 ? 'success' : v < 3000 ? 'warning' : 'error'
        return <Tag color={color}>{v}</Tag>
      },
    },
    {
      title: 'Token In',
      dataIndex: 'token_input',
      key: 'token_input',
      width: 80,
      render: (v: number) => v || <Text type="secondary">-</Text>,
    },
    {
      title: 'Token Out',
      dataIndex: 'token_output',
      key: 'token_output',
      width: 80,
      render: (v: number) => v || <Text type="secondary">-</Text>,
    },
    {
      title: '流式',
      dataIndex: 'is_stream',
      key: 'is_stream',
      width: 60,
      render: (v: boolean) => v ? <Tag color="processing">SSE</Tag> : <Tag>REST</Tag>,
    },
    {
      title: '错误',
      dataIndex: 'error_type',
      key: 'error_type',
      width: 100,
      ellipsis: true,
      render: (v: string, record: any) => {
        if (!v) return <Text type="secondary">-</Text>
        return (
          <div>
            <Tag color="error" style={{ marginBottom: 2 }}>{v}</Tag>
            {record.error_message && (
              <div>
                <Text type="danger" style={{ fontSize: 11 }} ellipsis={{ tooltip: record.error_message }}>
                  {record.error_message.slice(0, 50)}
                </Text>
              </div>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: isMobile ? 'stretch' : 'center',
        marginBottom: 16,
        gap: 12,
        flexDirection: isMobile ? 'column' : 'row',
      }}>
        <Title level={5} style={{ margin: 0 }}>
          {t(locale, 'requestLogs')}
        </Title>
        <Button icon={<ReloadOutlined />} onClick={() => loadLogs()} loading={loading}>
          {t(locale, 'refresh')}
        </Button>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Space wrap style={{ width: '100%' }}>
          <Input
            placeholder="平台ID"
            value={filters.platform_id || ''}
            onChange={e => setFilters((f: any) => ({ ...f, platform_id: e.target.value || undefined }))}
            style={{ width: 140 }}
            allowClear
          />
          <Input
            placeholder="模型名"
            value={filters.model_id || ''}
            onChange={e => setFilters((f: any) => ({ ...f, model_id: e.target.value || undefined }))}
            style={{ width: 140 }}
            allowClear
          />
          <Select
            placeholder="状态码"
            value={filters.status_code || undefined}
            onChange={v => setFilters((f: any) => ({ ...f, status_code: v }))}
            style={{ width: 120 }}
            allowClear
            options={[
              { value: 200, label: '200' },
              { value: 400, label: '400' },
              { value: 401, label: '401' },
              { value: 429, label: '429' },
              { value: 500, label: '500' },
              { value: 502, label: '502' },
              { value: 0, label: '0 (连接失败)' },
            ]}
          />
          <Button type="primary" icon={<FilterOutlined />} onClick={handleFilter}>
            筛选
          </Button>
        </Space>
      </Card>

      <Card styles={{ body: { padding: 0 } }}>
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
            showTotal: (total) => `共 ${total} 条`,
            onChange: (p, ps) => { setPage(p); setPageSize(ps) },
          }}
          scroll={{ x: 1200 }}
          size="small"
        />
      </Card>
    </div>
  )
}
