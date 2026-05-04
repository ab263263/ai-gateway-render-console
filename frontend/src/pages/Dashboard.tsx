import { useEffect, useState, useCallback } from 'react'
import { Card, Col, Row, Statistic, Tag, Typography, Button, Tooltip, Badge, Progress, Grid, Space, Empty } from 'antd'
import {
  CloudServerOutlined,
  ApiOutlined,
  CheckCircleOutlined,
  SafetyCertificateOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  DollarOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  ThunderboltOutlined,
  WalletOutlined,
  WarningOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons'
import { getOverview, listProxies, listPlatforms, getProxyStats, getPlatformStats, listBalances } from '../api'
import { useAppContext } from '../ThemeContext'
import { t } from '../i18n'
import { getPresetName, platformPresets } from '../presets'

const { Text, Title } = Typography

interface ProxyWithStats {
  id: string
  name: string
  stats?: {
    total_requests: number
    success_rate: number
    avg_latency_ms: number
    requests_today: number
    total_token_input: number
    total_token_output: number
  }
}

interface PlatformWithStats {
  id: string
  name: string
  type: string
  base_url: string
  balance?: number | null
  auto_disabled?: boolean
  consecutive_fails?: number
  stats?: {
    total_requests: number
    success_rate: number
    avg_latency_ms: number
    total_token_input: number
    total_token_output: number
  }
}

export default function Dashboard() {
  const [stats, setStats] = useState<any>({})
  const [proxies, setProxies] = useState<ProxyWithStats[]>([])
  const [platforms, setPlatforms] = useState<PlatformWithStats[]>([])
  const [balances, setBalances] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const { locale } = useAppContext()
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [overview, proxyList, platformList, balanceList] = await Promise.all([
        getOverview().catch(() => ({})),
        listProxies().catch(() => []),
        listPlatforms().catch(() => []),
        listBalances().catch(() => []),
      ])
      setStats(overview)
      setBalances(balanceList)

      const proxiesWithStats: ProxyWithStats[] = await Promise.all(
        proxyList.map(async (proxy: any) => {
          try {
            const proxyStats = await getProxyStats(proxy.id).catch(() => null)
            return { ...proxy, stats: proxyStats || undefined }
          } catch {
            return { ...proxy }
          }
        }),
      )
      setProxies(proxiesWithStats)

      const platformsWithStats: PlatformWithStats[] = await Promise.all(
        platformList.map(async (platform: any) => {
          try {
            const platformStats = await getPlatformStats(platform.id).catch(() => null)
            const balance = balanceList.find((item: any) => item.id === platform.id)
            return {
              ...platform,
              balance: balance?.balance ?? null,
              stats: platformStats || undefined,
            }
          } catch {
            return { ...platform }
          }
        }),
      )
      setPlatforms(platformsWithStats)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const getPlatformDisplayName = (name: string) => {
    const preset = platformPresets.find((item) => item.name === name)
    return preset ? getPresetName(preset, locale) : name
  }

  const formatTokenCount = (count: number) => {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`
    return count.toString()
  }

  const StatItem = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <div>
      <Text type="secondary" style={{ fontSize: 11 }}>{label}</Text>
      <div style={{ fontWeight: 600, fontSize: 13, color }}>{value}</div>
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', marginBottom: 16, gap: 12, flexDirection: isMobile ? 'column' : 'row' }}>
        <div>
          <Title level={5} style={{ margin: 0 }}>{t(locale, 'dashboard')}</Title>
          <div style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {locale === 'zh' ? '集中查看请求、平台、虚拟模型与余额的全局运行状态。' : 'Track requests, platforms, virtual models, and balances from one overview.'}
            </Text>
          </div>
        </div>
        <Tooltip title={t(locale, 'refresh')}>
          <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading} type={isMobile ? 'default' : 'text'} block={isMobile}>
            {isMobile ? t(locale, 'refresh') : undefined}
          </Button>
        </Tooltip>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 20, minHeight: 124 }}>
            <Statistic title={<Text type="secondary">{t(locale, 'totalRequests')}</Text>} value={stats.total_requests || 0} prefix={<ThunderboltOutlined style={{ color: '#1677ff' }} />} valueStyle={{ fontWeight: 700 }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 20, minHeight: 124 }}>
            <Statistic title={<Text type="secondary">{t(locale, 'successRate')}</Text>} value={stats.success_rate || 0} suffix="%" precision={1} valueStyle={{ fontWeight: 700, color: (stats.success_rate || 0) > 90 ? '#52c41a' : '#ff4d4f' }} prefix={<SafetyCertificateOutlined style={{ color: (stats.success_rate || 0) > 90 ? '#52c41a' : '#ff4d4f' }} />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 20, minHeight: 124 }}>
            <Statistic title={<Text type="secondary">{t(locale, 'avgLatency')}</Text>} value={Math.round(stats.avg_latency_ms || 0)} suffix="ms" valueStyle={{ fontWeight: 700 }} prefix={<ClockCircleOutlined style={{ color: '#faad14' }} />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 20, minHeight: 124 }}>
            <Statistic title={<Text type="secondary">{t(locale, 'activePlatforms')}</Text>} value={stats.active_platforms || 0} suffix={`/ ${stats.total_platforms || 0}`} valueStyle={{ fontWeight: 700 }} prefix={<CloudServerOutlined style={{ color: '#722ed1' }} />} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ borderRadius: 20, minHeight: 124 }}>
            <Statistic title={<Text type="secondary">{t(locale, 'totalTokens')}</Text>} value={formatTokenCount((stats.total_token_input || 0) + (stats.total_token_output || 0))} prefix={<DollarOutlined style={{ color: '#13c2c2' }} />} valueStyle={{ fontWeight: 700 }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ borderRadius: 20, minHeight: 124 }}>
            <Statistic title={<Text type="secondary">{t(locale, 'inputTokens')}</Text>} value={formatTokenCount(stats.total_token_input || 0)} prefix={<ArrowDownOutlined style={{ color: '#1677ff' }} />} valueStyle={{ fontWeight: 700 }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ borderRadius: 20, minHeight: 124 }}>
            <Statistic title={<Text type="secondary">{t(locale, 'outputTokens')}</Text>} value={formatTokenCount(stats.total_token_output || 0)} prefix={<ArrowUpOutlined style={{ color: '#52c41a' }} />} valueStyle={{ fontWeight: 700 }} />
          </Card>
        </Col>
      </Row>

      {balances.length > 0 ? (
        <Card bordered={false} style={{ marginTop: 16, borderRadius: 20 }} title={<Title level={5} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><WalletOutlined style={{ color: '#faad14' }} />{locale === 'zh' ? '余额概览' : 'Balance Overview'}</Title>}>
          <Row gutter={[16, 16]}>
            {balances.map((item: any) => (
              <Col xs={24} sm={12} lg={8} key={item.platform_id || item.platform_name}>
                <Card size="small" bordered={false} style={{ borderRadius: 16, background: 'var(--ant-color-fill-alter)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text strong style={{ fontSize: 13 }}>{getPlatformDisplayName(item.platform_name)}</Text>
                    <Text style={{ fontSize: 18, fontWeight: 700, color: (item.balance ?? 0) > 0 ? '#52c41a' : '#ff4d4f' }}>
                      ${item.balance !== null && item.balance !== undefined ? Number(item.balance).toFixed(2) : '—'}
                    </Text>
                  </div>
                  {item.total !== null && item.total !== undefined && item.total > 0 ? (
                    <Progress percent={Math.round(((item.used ?? 0) / item.total) * 100)} size="small" status={(item.used ?? 0) / item.total > 0.9 ? 'exception' : 'active'} format={() => `${Number(item.used ?? 0).toFixed(2)} / ${Number(item.total).toFixed(2)}`} />
                  ) : null}
                </Card>
              </Col>
            ))}
          </Row>
        </Card>
      ) : null}

      <Card bordered={false} style={{ marginTop: 20, borderRadius: 20 }} title={<Title level={5} style={{ margin: 0 }}>{t(locale, 'proxyStatus')}</Title>} extra={<Text type="secondary">{stats.total_proxies || 0} {t(locale, 'total')}</Text>}>
        {proxies.length === 0 ? (
          <Empty description={t(locale, 'noProxies')} />
        ) : (
          <Row gutter={[16, 16]}>
            {proxies.map((proxy) => (
              <Col xs={24} sm={12} lg={8} key={proxy.id}>
                <Card size="small" bordered={false} style={{ borderRadius: 16, background: 'var(--ant-color-fill-alter)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Tag color="purple" style={{ fontSize: 13, padding: '2px 10px', borderRadius: 999, fontFamily: 'monospace' }}>{proxy.name}</Tag>
                    <Tag icon={<CheckCircleOutlined />} color="processing">Ready</Tag>
                  </div>
                  {proxy.stats && proxy.stats.total_requests > 0 ? (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--ant-color-border-secondary)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      <StatItem label={t(locale, 'proxyRequests')} value={String(proxy.stats.total_requests)} />
                      <StatItem label={t(locale, 'successRate')} value={`${proxy.stats.success_rate.toFixed(1)}%`} color={proxy.stats.success_rate > 90 ? '#52c41a' : '#ff4d4f'} />
                      <StatItem label={t(locale, 'avgLatency')} value={`${proxy.stats.avg_latency_ms.toFixed(0)}ms`} />
                      <StatItem label={t(locale, 'proxyTokens')} value={formatTokenCount(proxy.stats.total_token_input + proxy.stats.total_token_output)} />
                    </div>
                  ) : (
                    <div style={{ marginTop: 8 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>{t(locale, 'noRequests')}</Text>
                    </div>
                  )}
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Card>

      <Card bordered={false} style={{ marginTop: 20, borderRadius: 20 }} title={<Title level={5} style={{ margin: 0 }}>{t(locale, 'platformList')}</Title>}>
        {platforms.length === 0 ? (
          <Empty description={t(locale, 'noPlatforms')} />
        ) : (
          <Row gutter={[16, 16]}>
            {platforms.map((platform) => {
              const healthColor = platform.auto_disabled ? '#ff4d4f' : (platform.consecutive_fails && platform.consecutive_fails > 0 ? '#faad14' : '#52c41a')
              const healthIcon = platform.auto_disabled ? <CloseCircleOutlined /> : (platform.consecutive_fails && platform.consecutive_fails > 0 ? <WarningOutlined /> : <CheckCircleOutlined />)
              return (
                <Col xs={24} sm={12} lg={8} key={platform.id}>
                  <Card size="small" bordered={false} style={{ borderRadius: 16, background: 'var(--ant-color-fill-alter)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Badge color={healthColor} />
                        <Text strong>{getPlatformDisplayName(platform.name)}</Text>
                      </div>
                      <Tag icon={healthIcon} color={platform.auto_disabled ? 'error' : (platform.consecutive_fails && platform.consecutive_fails > 0 ? 'warning' : 'success')}>
                        {platform.auto_disabled ? (locale === 'zh' ? '禁用' : 'Disabled') : (platform.consecutive_fails && platform.consecutive_fails > 0 ? `${platform.consecutive_fails} fail` : (locale === 'zh' ? '正常' : 'Active'))}
                      </Tag>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {platform.base_url}
                    </div>
                    {platform.balance !== null && platform.balance !== undefined && Number(platform.balance) > 0 ? (
                      <div style={{ marginTop: 4 }}>
                        <Text style={{ fontSize: 12, color: '#52c41a' }}>${Number(platform.balance).toFixed(2)}</Text>
                      </div>
                    ) : null}
                    {platform.stats && platform.stats.total_requests > 0 ? (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--ant-color-border-secondary)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <StatItem label={t(locale, 'proxyRequests')} value={String(platform.stats.total_requests)} />
                        <StatItem label={t(locale, 'successRate')} value={`${platform.stats.success_rate.toFixed(1)}%`} color={platform.stats.success_rate > 90 ? '#52c41a' : '#ff4d4f'} />
                        <StatItem label={t(locale, 'avgLatency')} value={`${platform.stats.avg_latency_ms.toFixed(0)}ms`} />
                        <StatItem label={t(locale, 'proxyTokens')} value={formatTokenCount(platform.stats.total_token_input + platform.stats.total_token_output)} />
                      </div>
                    ) : (
                      <div style={{ marginTop: 6 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>{t(locale, 'noRequests')}</Text>
                      </div>
                    )}
                  </Card>
                </Col>
              )
            })}
          </Row>
        )}
      </Card>
    </div>
  )
}
