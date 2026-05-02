import { useEffect, useState, useCallback } from 'react'
import { Card, Col, Row, Statistic, Tag, Typography, Button, Tooltip, Badge, Progress } from 'antd'
import {
  CloudServerOutlined, ApiOutlined,
  CheckCircleOutlined, SafetyCertificateOutlined,
  ClockCircleOutlined, ReloadOutlined, DollarOutlined, ArrowUpOutlined, ArrowDownOutlined,
  ThunderboltOutlined, WalletOutlined, WarningOutlined, CloseCircleOutlined,
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
  const { locale, isDark } = useAppContext()

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

      // Fetch per-proxy stats
      const proxiesWithStats: ProxyWithStats[] = await Promise.all(
        proxyList.map(async (p: any) => {
          try {
            const pStats = await getProxyStats(p.id).catch(() => null)
            return { ...p, stats: pStats || undefined }
          } catch {
            return { ...p }
          }
        })
      )
      setProxies(proxiesWithStats)

      // Fetch per-platform stats
      const platformsWithStats: PlatformWithStats[] = await Promise.all(
        platformList.map(async (p: any) => {
          try {
            const pStats = await getPlatformStats(p.id).catch(() => null)
            return { ...p, stats: pStats || undefined }
          } catch {
            return { ...p }
          }
        })
      )
      setPlatforms(platformsWithStats)
    } catch {
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const getPlatformDisplayName = (name: string) => {
    const preset = platformPresets.find(p => p.name === name)
    return preset ? getPresetName(preset, locale) : name
  }

  const formatTokenCount = (count: number) => {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`
    return count.toString()
  }

  // Stat item component for inline display
  const StatItem = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <div>
      <Text type="secondary" style={{ fontSize: 11 }}>{label}</Text>
      <div style={{ fontWeight: 600, fontSize: 13, color }}>{value}</div>
    </div>
  )

  return (
    <div>
      {/* Header with refresh button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0 }}>{t(locale, 'dashboard')}</Title>
        <Tooltip title={t(locale, 'refresh')}>
          <Button
            icon={<ReloadOutlined />}
            onClick={loadData}
            loading={loading}
            type="text"
          />
        </Tooltip>
      </div>

      {/* Stats Row */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 12 }}>
            <Statistic
              title={<Text type="secondary">{t(locale, 'totalRequests')}</Text>}
              value={stats.total_requests || 0}
              prefix={<ThunderboltOutlined style={{ color: '#1677ff' }} />}
              valueStyle={{ fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 12 }}>
            <Statistic
              title={<Text type="secondary">{t(locale, 'successRate')}</Text>}
              value={stats.success_rate || 0}
              suffix="%"
              precision={1}
              valueStyle={{ fontWeight: 700, color: (stats.success_rate || 0) > 90 ? '#52c41a' : '#ff4d4f' }}
              prefix={<SafetyCertificateOutlined style={{ color: (stats.success_rate || 0) > 90 ? '#52c41a' : '#ff4d4f' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 12 }}>
            <Statistic
              title={<Text type="secondary">{t(locale, 'avgLatency')}</Text>}
              value={Math.round(stats.avg_latency_ms || 0)}
              suffix="ms"
              valueStyle={{ fontWeight: 700 }}
              prefix={<ClockCircleOutlined style={{ color: '#faad14' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 12 }}>
            <Statistic
              title={<Text type="secondary">{t(locale, 'activePlatforms')}</Text>}
              value={stats.active_platforms || 0}
              suffix={`/ ${stats.total_platforms || 0}`}
              valueStyle={{ fontWeight: 700 }}
              prefix={<CloudServerOutlined style={{ color: '#722ed1' }} />}
            />
          </Card>
        </Col>
      </Row>

      {/* Token Usage Row */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ borderRadius: 12 }}>
            <Statistic
              title={<Text type="secondary">{t(locale, 'totalTokens')}</Text>}
              value={formatTokenCount((stats.total_token_input || 0) + (stats.total_token_output || 0))}
              prefix={<DollarOutlined style={{ color: '#13c2c2' }} />}
              valueStyle={{ fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ borderRadius: 12 }}>
            <Statistic
              title={<Text type="secondary">{t(locale, 'inputTokens')}</Text>}
              value={formatTokenCount(stats.total_token_input || 0)}
              prefix={<ArrowDownOutlined style={{ color: '#1677ff' }} />}
              valueStyle={{ fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ borderRadius: 12 }}>
            <Statistic
              title={<Text type="secondary">{t(locale, 'outputTokens')}</Text>}
              value={formatTokenCount(stats.total_token_output || 0)}
              prefix={<ArrowUpOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ fontWeight: 700 }}
            />
          </Card>
        </Col>
      </Row>

      {/* Balance Summary Row */}
      {balances.length > 0 && (
        <Card bordered={false} style={{ marginTop: 16, borderRadius: 12 }}
          title={<Title level={5} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <WalletOutlined style={{ color: '#faad14' }} /> 余额概览
          </Title>}
        >
          <Row gutter={[16, 16]}>
            {balances.map((b: any) => (
              <Col xs={24} sm={12} lg={8} key={b.platform_id || b.platform_name}>
                <Card size="small" bordered={false} style={{ borderRadius: 8, background: isDark ? '#1a1a1a' : '#fafafa' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text strong style={{ fontSize: 13 }}>{b.platform_name}</Text>
                    <Text style={{ fontSize: 18, fontWeight: 700, color: (b.balance ?? 0) > 0 ? '#52c41a' : '#ff4d4f' }}>
                      ${b.balance !== null && b.balance !== undefined ? Number(b.balance).toFixed(2) : '—'}
                    </Text>
                  </div>
                  {b.total !== null && b.total !== undefined && b.total > 0 && (
                    <Progress
                      percent={Math.round(((b.used ?? 0) / b.total) * 100)}
                      size="small"
                      status={(b.used ?? 0) / b.total > 0.9 ? 'exception' : 'active'}
                      format={() => `${Number(b.used ?? 0).toFixed(2)} / ${Number(b.total).toFixed(2)}`}
                    />
                  )}
                </Card>
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {/* Virtual Model Status */}
      <Card
        bordered={false}
        style={{ marginTop: 20, borderRadius: 12 }}
        title={<Title level={5} style={{ margin: 0 }}>{t(locale, 'proxyStatus')}</Title>}
        extra={<Text type="secondary">{stats.total_proxies || 0} {t(locale, 'total')}</Text>}
      >
        {proxies.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <ApiOutlined style={{ fontSize: 40, color: '#d9d9d9', marginBottom: 12 }} />
            <br />
            <Text type="secondary">{t(locale, 'noProxies')}</Text>
          </div>
        ) : (
          <Row gutter={[16, 16]}>
            {proxies.map((p) => (
              <Col xs={24} sm={12} lg={8} key={p.id}>
                <Card
                  size="small"
                  bordered={false}
                  style={{
                    borderRadius: 8,
                    background: isDark ? '#1a1a1a' : undefined,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Tag color="purple" style={{ fontSize: 13, padding: '2px 10px', borderRadius: 4, fontFamily: 'monospace' }}>{p.name}</Tag>
                    <Tag icon={<CheckCircleOutlined />} color="processing">Ready</Tag>
                  </div>
                  {/* Per-proxy stats */}
                  {p.stats && p.stats.total_requests > 0 ? (
                    <div style={{
                      marginTop: 10,
                      paddingTop: 8,
                      borderTop: `1px solid ${isDark ? '#333' : '#f0f0f0'}`,
                      display: 'flex',
                      gap: 16,
                      flexWrap: 'wrap',
                    }}>
                      <StatItem label={t(locale, 'proxyRequests')} value={String(p.stats.total_requests)} />
                      <StatItem label={t(locale, 'successRate')} value={`${p.stats.success_rate.toFixed(1)}%`} color={p.stats.success_rate > 90 ? '#52c41a' : '#ff4d4f'} />
                      <StatItem label={t(locale, 'avgLatency')} value={`${p.stats.avg_latency_ms.toFixed(0)}ms`} />
                      <StatItem label={t(locale, 'proxyTokens')} value={formatTokenCount(p.stats.total_token_input + p.stats.total_token_output)} />
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

      {/* Platform List with Stats */}
      <Card
        bordered={false}
        style={{ marginTop: 20, borderRadius: 12 }}
        title={<Title level={5} style={{ margin: 0 }}>{t(locale, 'platformList')}</Title>}
      >
        {platforms.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <CloudServerOutlined style={{ fontSize: 40, color: '#d9d9d9', marginBottom: 12 }} />
            <br />
            <Text type="secondary">{t(locale, 'noPlatforms')}</Text>
          </div>
        ) : (
          <Row gutter={[16, 16]}>
            {platforms.map((p: any) => {
              const healthColor = p.auto_disabled ? '#ff4d4f' : (p.consecutive_fails > 0 ? '#faad14' : '#52c41a')
              const healthIcon = p.auto_disabled ? <CloseCircleOutlined /> : (p.consecutive_fails > 0 ? <WarningOutlined /> : <CheckCircleOutlined />)
              return (
              <Col xs={24} sm={12} lg={8} key={p.id}>
                <Card size="small" bordered={false} hoverable style={{ borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Badge color={healthColor} />
                      <Text strong>{getPlatformDisplayName(p.name)}</Text>
                    </div>
                    <Tag icon={healthIcon} color={p.auto_disabled ? 'error' : (p.consecutive_fails > 0 ? 'warning' : 'success')}>
                      {p.auto_disabled ? 'Disabled' : (p.consecutive_fails > 0 ? `${p.consecutive_fails} fail` : 'Active')}
                    </Tag>
                  </div>
                  <div style={{ fontSize: 12, color: '#999', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.base_url}
                  </div>
                  {/* Balance info if available */}
                  {p.balance !== null && p.balance !== undefined && Number(p.balance) > 0 && (
                    <div style={{ marginTop: 4 }}>
                      <Text style={{ fontSize: 12, color: '#52c41a' }}>${Number(p.balance).toFixed(2)}</Text>
                    </div>
                  )}
                  {/* Per-platform stats */}
                  {p.stats && p.stats.total_requests > 0 ? (
                    <div style={{
                      marginTop: 8,
                      paddingTop: 8,
                      borderTop: `1px solid ${isDark ? '#333' : '#f0f0f0'}`,
                      display: 'flex',
                      gap: 16,
                      flexWrap: 'wrap',
                    }}>
                      <StatItem label={t(locale, 'proxyRequests')} value={String(p.stats.total_requests)} />
                      <StatItem label={t(locale, 'successRate')} value={`${p.stats.success_rate.toFixed(1)}%`} color={p.stats.success_rate > 90 ? '#52c41a' : '#ff4d4f'} />
                      <StatItem label={t(locale, 'avgLatency')} value={`${p.stats.avg_latency_ms.toFixed(0)}ms`} />
                      <StatItem label={t(locale, 'proxyTokens')} value={formatTokenCount(p.stats.total_token_input + p.stats.total_token_output)} />
                    </div>
                  ) : (
                    <div style={{ marginTop: 6 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>{t(locale, 'noRequests')}</Text>
                    </div>
                  )}
                </Card>
              </Col>
            )})}
          </Row>
        )}
      </Card>
    </div>
  )
}
