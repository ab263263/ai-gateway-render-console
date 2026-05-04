import { useEffect, useMemo, useState } from 'react'
import { Button, Table, Tag, Space, message, Card, Typography, Alert, Statistic, Row, Col, Tooltip, Grid, Empty } from 'antd'
import { GiftOutlined, DollarOutlined, ReloadOutlined, HistoryOutlined, CheckCircleOutlined, CloseCircleOutlined, SyncOutlined } from '@ant-design/icons'
import { listPlatforms, doCheckinSingle, listBalances, listCheckinLogs, refreshBalances } from '../api'
import { useAppContext } from '../ThemeContext'
import { t } from '../i18n'
import { getPresetName, platformPresets } from '../presets'

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
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md

  const getPlatformDisplayName = (name: string) => {
    const preset = platformPresets.find((item) => item.name === name)
    return preset ? getPresetName(preset, locale) : name
  }

  const formatDateTime = (value?: string | null) => {
    if (!value) return '-'
    try {
      return new Date(value).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')
    } catch {
      return value
    }
  }

  const loadData = async () => {
    setLoading(true)
    try {
      const [platformsData, balancesData, logsData] = await Promise.all([
        listPlatforms(),
        listBalances(),
        listCheckinLogs({ limit: 50 }),
      ])

      const platformsWithBalance = platformsData.map((platform: any) => {
        const balance = balancesData?.find((item: any) => item.id === platform.id)
        return {
          ...platform,
          balance: balance?.balance ?? null,
          quota: balance?.quota ?? null,
          used_quota: balance?.used_quota ?? null,
          last_checkin: balance?.last_checkin ?? null,
          last_balance_check: balance?.last_balance_check ?? null,
        }
      })

      setPlatforms(platformsWithBalance)
      setLogs(logsData || [])
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message || t(locale, 'loadFailed'))
    }
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleCheckin = async (platformId: string) => {
    setCheckingId(platformId)
    try {
      const result = await doCheckinSingle(platformId)
      if (result?.success) {
        message.success(`${t(locale, 'checkinSuccess')}: ${result?.balance_after ?? ''}`)
      } else {
        message.error(`${t(locale, 'checkinFailed')}: ${result?.error || ''}`)
      }
      loadData()
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message || t(locale, 'checkinFailed'))
    }
    setCheckingId(null)
  }

  const handleRefreshAll = async () => {
    setRefreshing(true)
    try {
      await refreshBalances()
      message.success(t(locale, 'refreshSuccess'))
      loadData()
    } catch (error: any) {
      message.error(error?.response?.data?.error?.message || t(locale, 'refreshFailed'))
    }
    setRefreshing(false)
  }

  const checkinEnabledPlatforms = platforms.filter((item) => item.checkin_enabled === 1)
  const totalBalance = platforms.reduce((sum, item) => sum + (item.balance || 0), 0)
  const recentCheckins = useMemo(() => logs.filter((item) => {
    const checkedAt = new Date(item.checked_at)
    const now = new Date()
    return (now.getTime() - checkedAt.getTime()) < 24 * 60 * 60 * 1000
  }).length, [logs])

  const columns = [
    {
      title: locale === 'zh' ? '平台信息' : 'Platform',
      key: 'platform',
      render: (_: any, record: PlatformWithBalance) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text strong>{getPlatformDisplayName(record.name)}</Text>
            <Tag>{record.type}</Tag>
            {record.checkin_enabled === 1 ? <Tag color="green">{t(locale, 'checkinEnabled')}</Tag> : null}
            {record.auto_checkin === 1 ? <Tag color="blue">{t(locale, 'autoCheckin')}</Tag> : null}
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {locale === 'zh' ? '最后签到' : 'Last Check-in'}：{formatDateTime(record.last_checkin)}
          </Text>
        </div>
      ),
    },
    {
      title: locale === 'zh' ? '余额与配额' : 'Balance & Quota',
      key: 'balance',
      width: 230,
      render: (_: any, record: PlatformWithBalance) => (
        <Space direction="vertical" size={4}>
          <Text strong>${record.balance != null ? Number(record.balance).toFixed(2) : '0.00'}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.quota != null ? `$${(record.quota / 10000).toFixed(2)}` : '-'}
            {record.used_quota != null ? ` / $${(record.used_quota / 10000).toFixed(2)}` : ''}
          </Text>
        </Space>
      ),
    },
    {
      title: locale === 'zh' ? '余额刷新' : 'Balance Refresh',
      key: 'refresh',
      width: 180,
      render: (_: any, record: PlatformWithBalance) => (
        <Text type="secondary" style={{ fontSize: 12 }}>{formatDateTime(record.last_balance_check)}</Text>
      ),
    },
    {
      title: t(locale, 'actions'),
      key: 'actions',
      width: 120,
      render: (_: any, record: PlatformWithBalance) => (
        record.checkin_enabled === 1 ? (
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
        ) : <Text type="secondary">-</Text>
      ),
    },
  ]

  const logColumns = [
    {
      title: t(locale, 'platform'),
      dataIndex: 'platform_name',
      key: 'platform_name',
      width: 180,
      render: (value: string) => <Text strong>{getPlatformDisplayName(value)}</Text>,
    },
    {
      title: t(locale, 'result'),
      dataIndex: 'result',
      key: 'result',
      width: 180,
      render: (value: string, record: CheckinLog) => (
        <Space>
          {record.success === 1 ? (
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
          ) : (
            <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
          )}
          <Text>{value}</Text>
        </Space>
      ),
    },
    {
      title: t(locale, 'quotaAdded'),
      dataIndex: 'quota_added',
      key: 'quota_added',
      width: 120,
      render: (value: number) => value != null ? <Text>+${value.toFixed(4)}</Text> : '-',
    },
    {
      title: t(locale, 'balanceAfter'),
      dataIndex: 'balance_after',
      key: 'balance_after',
      width: 120,
      render: (value: number) => value != null ? <Text>${value.toFixed(2)}</Text> : '-',
    },
    {
      title: t(locale, 'time'),
      dataIndex: 'checked_at',
      key: 'checked_at',
      width: 180,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: t(locale, 'error'),
      dataIndex: 'error_message',
      key: 'error_message',
      ellipsis: true,
      render: (value: string) => value ? <Text type="danger">{value}</Text> : '-',
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', marginBottom: 16, gap: 12, flexDirection: isMobile ? 'column' : 'row' }}>
        <div>
          <Title level={5} style={{ margin: 0 }}>{t(locale, 'checkin')}</Title>
          <div style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {locale === 'zh' ? '集中查看签到平台余额、执行签到并回看近 50 条签到记录。' : 'Review platform balances, run check-ins, and inspect the latest 50 check-in logs.'}
            </Text>
          </div>
        </div>
        <Space direction={isMobile ? 'vertical' : 'horizontal'} style={isMobile ? { width: '100%' } : undefined}>
          <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading} block={isMobile}>
            {t(locale, 'refresh')}
          </Button>
          <Button type="primary" icon={<DollarOutlined />} onClick={handleRefreshAll} loading={refreshing} block={isMobile}>
            {t(locale, 'refreshBalance')}
          </Button>
        </Space>
      </div>

      {checkinEnabledPlatforms.length === 0 ? (
        <Alert
          message={t(locale, 'noCheckinPlatforms')}
          description={t(locale, 'noCheckinPlatformsDesc')}
          type="info"
          showIcon
          style={{ marginBottom: 16, borderRadius: 16 }}
        />
      ) : null}

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} lg={8}>
          <Card bordered={false} style={{ borderRadius: 20 }}>
            <Statistic title={t(locale, 'totalBalance')} value={totalBalance} precision={2} prefix="$" valueStyle={{ color: '#3f8600' }} />
          </Card>
        </Col>
        <Col xs={12} lg={8}>
          <Card bordered={false} style={{ borderRadius: 20 }}>
            <Statistic title={t(locale, 'checkinPlatforms')} value={checkinEnabledPlatforms.length} suffix={`/ ${platforms.length}`} valueStyle={{ color: '#1890ff' }} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card bordered={false} style={{ borderRadius: 20 }}>
            <Statistic title={t(locale, 'recentCheckins')} value={recentCheckins} suffix={t(locale, 'today')} valueStyle={{ color: '#722ed1' }} />
          </Card>
        </Col>
      </Row>

      {platforms.length === 0 && !loading ? (
        <Card style={{ borderRadius: 24, marginBottom: 16 }}>
          <Empty description={locale === 'zh' ? '暂无平台数据。' : 'No platform data yet.'} />
        </Card>
      ) : isMobile ? (
        <Space direction="vertical" size={12} style={{ width: '100%', marginBottom: 16 }}>
          {platforms.map((record) => (
            <Card key={record.id} style={{ borderRadius: 20 }}>
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <div>
                    <Text strong style={{ fontSize: 15 }}>{getPlatformDisplayName(record.name)}</Text>
                    <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Tag>{record.type}</Tag>
                      {record.checkin_enabled === 1 ? <Tag color="green">{t(locale, 'checkinEnabled')}</Tag> : null}
                      {record.auto_checkin === 1 ? <Tag color="blue">{t(locale, 'autoCheckin')}</Tag> : null}
                    </div>
                  </div>
                  {record.checkin_enabled === 1 ? (
                    <Button type="primary" size="small" icon={<GiftOutlined />} loading={checkingId === record.id} onClick={() => handleCheckin(record.id)}>
                      {t(locale, 'checkin')}
                    </Button>
                  ) : null}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                  <div>
                    <Text type="secondary">{t(locale, 'balance')}</Text>
                    <div><Text strong>${record.balance != null ? Number(record.balance).toFixed(2) : '0.00'}</Text></div>
                  </div>
                  <div>
                    <Text type="secondary">{t(locale, 'quota')}</Text>
                    <div><Text>{record.quota != null ? `$${(record.quota / 10000).toFixed(2)}` : '-'}</Text></div>
                  </div>
                </div>

                <div>
                  <Text type="secondary">{t(locale, 'lastCheckin')}</Text>
                  <div><Text>{formatDateTime(record.last_checkin)}</Text></div>
                </div>
              </Space>
            </Card>
          ))}
        </Space>
      ) : (
        <Card title={t(locale, 'platforms')} style={{ marginBottom: 16, borderRadius: 24 }} styles={{ body: { padding: 0 } }}>
          <Table dataSource={platforms} columns={columns} rowKey="id" loading={loading} pagination={false} />
        </Card>
      )}

      <Card title={<span><HistoryOutlined style={{ marginRight: 8 }} />{t(locale, 'checkinLogs')}</span>} style={{ borderRadius: 24 }} styles={{ body: { padding: isMobile ? 16 : 0 } }}>
        {logs.length === 0 && !loading ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={locale === 'zh' ? '还没有签到记录。' : 'No check-in logs yet.'} />
        ) : isMobile ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {logs.map((record) => (
              <Card key={record.id} size="small" style={{ borderRadius: 16 }}>
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <div>
                      <Text strong>{getPlatformDisplayName(record.platform_name)}</Text>
                      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {record.success === 1 ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : <CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
                        <Text>{record.result}</Text>
                      </div>
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>{formatDateTime(record.checked_at)}</Text>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                    <div>
                      <Text type="secondary">{t(locale, 'quotaAdded')}</Text>
                      <div><Text>{record.quota_added != null ? `+$${record.quota_added.toFixed(4)}` : '-'}</Text></div>
                    </div>
                    <div>
                      <Text type="secondary">{t(locale, 'balanceAfter')}</Text>
                      <div><Text>{record.balance_after != null ? `$${record.balance_after.toFixed(2)}` : '-'}</Text></div>
                    </div>
                  </div>
                  {record.error_message ? <Text type="danger">{record.error_message}</Text> : null}
                </Space>
              </Card>
            ))}
          </Space>
        ) : (
          <Table dataSource={logs} columns={logColumns} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} />
        )}
      </Card>
    </div>
  )
}
