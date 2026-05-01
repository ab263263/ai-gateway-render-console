import { useEffect, useState } from 'react'
import { Button, Table, Tag, Space, message, Card, Typography, Alert, Statistic, Row, Col, Tooltip, Descriptions } from 'antd'
import { GiftOutlined, DollarOutlined, ReloadOutlined, HistoryOutlined, CheckCircleOutlined } from '@ant-design/icons'
import { listPlatforms, doCheckinSingle, listBalances, listCheckinLogs, refreshBalances } from '../api'
import { useAppContext } from '../ThemeContext'
import { t } from '../i18n'

const { Text, Title } = Typography

type PlatformWithBalance = {
  id: string
  name: string
  type: string
  checkin_enabled: number
  auto_checkin: number
  balance: number | null
  quota: number | null
  used_quota: number | null
  last_checkin: string | null
  last_balance_check: string | null
}

type CheckinLog = {
  id: number
  platform_name: string
  result: string
  quota_added: number
  balance_after: number
  success: number
  error_message: string | null
  checked_at: string
}

export default function Checkin() {
  const [platforms, setPlatforms] = useState<PlatformWithBalance[]>([])
  const [logs, setLogs] = useState<CheckinLog[]>([])
  const [loading, setLoading] = useState(false)
  const [checkingId, setCheckingId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const { locale } = useAppContext()

  const loadData = async () => {
    setLoading(true)
    try {
      const [platformsData, balancesData, logsData] = await Promise.all([
        listPlatforms(),
        listBalances(),
        listCheckinLogs({ limit: 50 })
      ])
      
      // Merge balance data into platforms
      const platformsWithBalance = platformsData.map((p: any) => {
        const balance = balancesData?.find((b: any) => b.id === p.id)
        return {
          ...p,
          balance: balance?.balance ?? null,
          quota: balance?.quota ?? null,
          used_quota: balance?.used_quota ?? null,
          last_checkin: balance?.last_checkin ?? null,
          last_balance_check: balance?.last_balance_check ?? null,
        }
      })
      
      setPlatforms(platformsWithBalance)
      setLogs(logsData || [])
    } catch (e: any) {
      message.error(e?.response?.data?.error?.message || t(locale, 'loadFailed'))
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const handleCheckin = async (platformId: string) => {
    setCheckingId(platformId)
    try {
      const result = await doCheckinSingle(platformId)
      if (result?.success) {
        message.success(t(locale, 'checkinSuccess') + `: ${result?.balance_after ?? ''}`)
      } else {
        message.error(t(locale, 'checkinFailed') + `: ${result?.error || ''}`)
      }
      loadData()
    } catch (e: any) {
      message.error(e?.response?.data?.error?.message || t(locale, 'checkinFailed'))
    }
    setCheckingId(null)
  }

  const handleRefreshAll = async () => {
    setRefreshing(true)
    try {
      const result = await refreshBalances()
      message.success(t(locale, 'refreshSuccess'))
      loadData()
    } catch (e: any) {
      message.error(e?.response?.data?.error?.message || t(locale, 'refreshFailed'))
    }
    setRefreshing(false)
  }

  const columns = [
    {
      title: t(locale, 'name'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: PlatformWithBalance) => (
        <Space>
          <Text strong>{text}</Text>
          {record.checkin_enabled === 1 && <Tag color="green">{t(locale, 'checkinEnabled')}</Tag>}
          {record.auto_checkin === 1 && <Tag color="blue">{t(locale, 'autoCheckin')}</Tag>}
        </Space>
      ),
    },
    {
      title: t(locale, 'type'),
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (text: string) => <Tag>{text}</Tag>,
    },
    {
      title: t(locale, 'balance'),
      key: 'balance',
      width: 150,
      render: (_: any, record: PlatformWithBalance) => (
        <Statistic
          value={record.balance ?? 0}
          precision={2}
          prefix="$"
          valueStyle={{ fontSize: 14 }}
        />
      ),
    },
    {
      title: t(locale, 'quota'),
      key: 'quota',
      width: 150,
      render: (_: any, record: PlatformWithBalance) => (
        <Text>
          {record.quota != null ? `$${(record.quota / 10000).toFixed(2)}` : '-'}
          {record.used_quota != null && (
            <Text type="secondary" style={{ marginLeft: 8 }}>
              / used: $${(record.used_quota / 10000).toFixed(2)}
            </Text>
          )}
        </Text>
      ),
    },
    {
      title: t(locale, 'lastCheckin'),
      key: 'last_checkin',
      width: 180,
      render: (_: any, record: PlatformWithBalance) => (
        record.last_checkin ? (
          <Text type="secondary">{new Date(record.last_checkin).toLocaleString()}</Text>
        ) : (
          <Text type="secondary">-</Text>
        )
      ),
    },
    {
      title: t(locale, 'actions'),
      key: 'actions',
      width: 120,
      render: (_: any, record: PlatformWithBalance) => (
        <Space>
          {record.checkin_enabled === 1 && (
            <Tooltip title={t(locale, 'checkinNow')}>
              <Button
                type="primary"
                icon={<GiftOutlined />}
                size="small"
                loading={checkingId === record.id}
                onClick={() => handleCheckin(record.id)}
              >
                {t(locale, 'checkin')}
              </Button>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ]

  const logColumns = [
    {
      title: t(locale, 'platform'),
      dataIndex: 'platform_name',
      key: 'platform_name',
      width: 150,
    },
    {
      title: t(locale, 'result'),
      dataIndex: 'result',
      key: 'result',
      render: (text: string, record: CheckinLog) => (
        <Space>
          {record.success === 1 ? (
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
          ) : (
            <span style={{ color: '#ff4d4f' }}>✗</span>
          )}
          <Text>{text}</Text>
        </Space>
      ),
    },
    {
      title: t(locale, 'quotaAdded'),
      dataIndex: 'quota_added',
      key: 'quota_added',
      width: 120,
      render: (val: number) => val != null ? <Text>+${val.toFixed(4)}</Text> : '-',
    },
    {
      title: t(locale, 'balanceAfter'),
      dataIndex: 'balance_after',
      key: 'balance_after',
      width: 120,
      render: (val: number) => val != null ? <Text>${val.toFixed(2)}</Text> : '-',
    },
    {
      title: t(locale, 'time'),
      dataIndex: 'checked_at',
      key: 'checked_at',
      width: 180,
      render: (text: string) => new Date(text).toLocaleString(),
    },
    {
      title: t(locale, 'error'),
      dataIndex: 'error_message',
      key: 'error_message',
      ellipsis: true,
      render: (text: string) => text ? <Text type="danger">{text}</Text> : '-',
    },
  ]

  const checkinEnabledPlatforms = platforms.filter(p => p.checkin_enabled === 1)
  const totalBalance = platforms.reduce((sum, p) => sum + (p.balance || 0), 0)

  return (
    <div style={{ padding: 24, overflow: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>
          <GiftOutlined style={{ marginRight: 8 }} />
          {t(locale, 'checkin')}
        </Title>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={loadData}
            loading={loading}
          >
            {t(locale, 'refresh')}
          </Button>
          <Button
            type="primary"
            icon={<DollarOutlined />}
            onClick={handleRefreshAll}
            loading={refreshing}
          >
            {t(locale, 'refreshBalance')}
          </Button>
        </Space>
      </div>

      {checkinEnabledPlatforms.length === 0 && (
        <Alert
          message={t(locale, 'noCheckinPlatforms')}
          description={t(locale, 'noCheckinPlatformsDesc')}
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card>
            <Statistic
              title={t(locale, 'totalBalance')}
              value={totalBalance}
              precision={2}
              prefix="$"
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title={t(locale, 'checkinPlatforms')}
              value={checkinEnabledPlatforms.length}
              suffix={`/ ${platforms.length}`}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title={t(locale, 'recentCheckins')}
              value={logs.filter(l => {
                const d = new Date(l.checked_at)
                const now = new Date()
                return (now.getTime() - d.getTime()) < 24 * 60 * 60 * 1000
              }).length}
              suffix={t(locale, 'today')}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title={t(locale, 'platforms')}
        style={{ marginBottom: 24 }}
      >
        <Table
          dataSource={platforms}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
          size="small"
        />
      </Card>

      <Card title={t(locale, 'checkinLogs')}>
        <Table
          dataSource={logs}
          columns={logColumns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          size="small"
        />
      </Card>
    </div>
  )
}
