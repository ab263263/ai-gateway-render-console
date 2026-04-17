import { useEffect, useState } from 'react'
import { Card, Col, Row, Statistic, Tag, Typography, Space } from 'antd'
import {
  CloudServerOutlined, RobotOutlined, ApiOutlined,
  CheckCircleOutlined, CloseCircleOutlined, ThunderboltOutlined,
  ClockCircleOutlined, SafetyCertificateOutlined,
} from '@ant-design/icons'
import { getOverview, listProxies, listPlatforms } from '../api'
import { useAppContext } from '../ThemeContext'
import { t } from '../i18n'
import { getPresetName, platformPresets } from '../presets'

const { Text, Title } = Typography

export default function Dashboard() {
  const [stats, setStats] = useState<any>({})
  const [proxies, setProxies] = useState<any[]>([])
  const [platforms, setPlatforms] = useState<any[]>([])
  const { locale } = useAppContext()

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      const [overview, proxyList, platformList] = await Promise.all([
        getOverview().catch(() => ({})),
        listProxies().catch(() => []),
        listPlatforms().catch(() => []),
      ])
      setStats(overview)
      setProxies(proxyList)
      setPlatforms(platformList)
    } catch {}
  }

  const getPlatformDisplayName = (name: string) => {
    const preset = platformPresets.find(p => p.name === name)
    return preset ? getPresetName(preset, locale) : name
  }

  return (
    <div>
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
              value={stats.avg_latency_ms || 0}
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

      {/* Proxy Status */}
      <Card
        bordered={false}
        style={{ marginTop: 20, borderRadius: 12 }}
        title={<Title level={5} style={{ margin: 0 }}>{t(locale, 'proxyStatus')}</Title>}
        extra={<Text type="secondary">{stats.active_proxies || 0} / {stats.total_proxies || 0} {t(locale, 'activeCount')}</Text>}
      >
        {proxies.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <ApiOutlined style={{ fontSize: 40, color: '#d9d9d9', marginBottom: 12 }} />
            <br />
            <Text type="secondary">{t(locale, 'noProxies')}</Text>
          </div>
        ) : (
          <Row gutter={[16, 16]}>
            {proxies.map((p: any) => (
              <Col xs={24} sm={12} lg={8} key={p.id}>
                <Card
                  size="small"
                  bordered={false}
                  style={{
                    borderRadius: 8,
                    background: p.status === 'Running' ? 'linear-gradient(135deg, #f6ffed 0%, #d9f7be 100%)' : undefined,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      <Text type="secondary" style={{ fontSize: 12 }}>:{p.listen_port}</Text>
                    </div>
                    <Tag color={p.status === 'Running' ? 'success' : 'default'} icon={p.status === 'Running' ? <CheckCircleOutlined /> : <CloseCircleOutlined />}>
                      {p.status === 'Running' ? t(locale, 'running') : t(locale, 'stopped')}
                    </Tag>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {(p.protocols || []).map((pt: string) => (
                      <Tag key={pt} style={{ fontSize: 11, borderRadius: 4 }}>{pt}</Tag>
                    ))}
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Card>

      {/* Platform List */}
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
            {platforms.map((p: any) => (
              <Col xs={24} sm={12} lg={6} key={p.id}>
                <Card size="small" bordered={false} hoverable style={{ borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text strong>{getPlatformDisplayName(p.name)}</Text>
                    <Tag>{p.type}</Tag>
                  </div>
                  <div style={{ fontSize: 12, color: '#999', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.base_url}
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Card>
    </div>
  )
}
