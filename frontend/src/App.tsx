import { useState, useEffect } from 'react'
import { Layout, Typography, theme, Dropdown, Button, Modal, Grid } from 'antd'
import {
  DashboardOutlined,
  CloudServerOutlined,
  ApiOutlined,
  SunOutlined,
  MoonOutlined,
  DesktopOutlined,
  GlobalOutlined,
  BookOutlined,
  GithubOutlined,
  KeyOutlined,
  RobotOutlined,
  FileTextOutlined,
  GiftOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Platforms from './pages/Platforms'
import Proxies from './pages/Proxies'
import ApiKeys from './pages/ApiKeys'
import Settings from './pages/Settings'
import Models from './pages/Models'
import ChatTest from './pages/ChatTest'
import Logs from './pages/Logs'
import Checkin from './pages/Checkin'
import { useAppContext, getSurfaceTheme } from './ThemeContext'
import { t, type Locale, type ThemeMode } from './i18n'

const { Content } = Layout
const { Title, Text, Paragraph } = Typography

const TAB_ITEMS = [
  { key: '/', icon: <DashboardOutlined />, label: 'dashboard' },
  { key: '/platforms', icon: <CloudServerOutlined />, label: 'platforms' },
  { key: '/models', icon: <RobotOutlined />, label: 'models' },
  { key: '/proxies', icon: <ApiOutlined />, label: 'proxies' },
  { key: '/chat-test', icon: <ApiOutlined />, label: 'chatTest' },
  { key: '/api-keys', icon: <KeyOutlined />, label: 'apiKeys' },
  { key: '/checkin', icon: <GiftOutlined />, label: 'checkin' },
  { key: '/logs', icon: <FileTextOutlined />, label: 'requestLogs' },
  { key: '/settings', icon: <SettingOutlined />, label: 'settings' },
]

function NavChip({
  item,
  active,
  mobile,
  onClick,
  locale,
  brand,
  brandSoft,
  textPrimary,
  textSecondary,
}: {
  item: (typeof TAB_ITEMS)[number]
  active: boolean
  mobile?: boolean
  onClick: () => void
  locale: Locale
  brand: string
  brandSoft: string
  textPrimary: string
  textSecondary: string
}) {
  return (
    <button
      onClick={onClick}
      style={{
        appearance: 'none',
        border: 'none',
        background: active ? brandSoft : 'transparent',
        color: active ? brand : textSecondary,
        minWidth: mobile ? 0 : 96,
        flex: mobile ? 1 : 'unset',
        height: mobile ? 58 : 42,
        borderRadius: 14,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: mobile ? 'column' : 'row',
        gap: mobile ? 4 : 8,
        padding: mobile ? '6px 4px' : '0 14px',
        fontWeight: active ? 700 : 500,
        fontSize: mobile ? 11 : 13,
        transition: 'all .2s ease',
        boxShadow: active ? 'inset 0 0 0 1px rgba(255,255,255,0.04)' : 'none',
      }}
      aria-current={active ? 'page' : undefined}
    >
      <span style={{ fontSize: mobile ? 16 : 15, color: active ? brand : textPrimary }}>{item.icon}</span>
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: mobile ? 54 : 120 }}>
        {t(locale, item.label as any)}
      </span>
    </button>
  )
}

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const { token } = theme.useToken()
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.lg
  const { themeMode, setThemeMode, isDark, locale, setLocale } = useAppContext()
  const surface = getSurfaceTheme(isDark)
  const [docOpen, setDocOpen] = useState(false)

  useEffect(() => {
    const style = document.createElement('style')
    style.id = 'message-left'
    style.textContent = `
      .ant-message {
        top: auto !important;
        bottom: 24px !important;
        left: 24px !important;
        transform: none !important;
      }
    `
    document.head.appendChild(style)
    return () => {
      document.getElementById('message-left')?.remove()
    }
  }, [])

  const themeIcon = themeMode === 'dark' ? <MoonOutlined /> : themeMode === 'light' ? <SunOutlined /> : <DesktopOutlined />

  return (
    <Layout style={{ minHeight: '100vh', background: surface.appBg }}>
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          backdropFilter: 'blur(16px)',
          background: surface.navBg,
          borderBottom: `1px solid ${surface.cardBorder}`,
        }}
      >
        <div
          style={{
            maxWidth: 1440,
            margin: '0 auto',
            padding: isMobile ? '14px 16px 12px' : '14px 24px',
            display: 'flex',
            alignItems: isMobile ? 'flex-start' : 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexDirection: isMobile ? 'column' : 'row',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: surface.brandSoft,
                boxShadow: surface.shadowSoft,
                flexShrink: 0,
              }}
            >
              <img src="./logo.png" alt="AI Gateway" style={{ width: 24, height: 24 }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: surface.textPrimary, lineHeight: '20px' }}>AI Gateway</div>
              <div style={{ fontSize: 12, color: surface.textSecondary, lineHeight: '18px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {t(locale, 'appSubtitle')} · v1.5.0
              </div>
            </div>
          </div>

          {!isMobile && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: 6,
                borderRadius: 18,
                background: surface.navRailBg,
                border: `1px solid ${surface.cardBorder}`,
                boxShadow: surface.shadowSoft,
                overflowX: 'auto',
              }}
            >
              {TAB_ITEMS.map((item) => (
                <NavChip
                  key={item.key}
                  item={item}
                  active={location.pathname === item.key}
                  onClick={() => navigate(item.key)}
                  locale={locale}
                  brand={surface.brand}
                  brandSoft={surface.brandSoft}
                  textPrimary={surface.textPrimary}
                  textSecondary={surface.textSecondary}
                />
              ))}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, alignSelf: isMobile ? 'stretch' : 'auto', width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'space-between' : 'flex-end' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Button type="text" icon={<BookOutlined />} onClick={() => setDocOpen(true)} />
              <Dropdown
                menu={{
                  items: [
                    { key: 'light', icon: <SunOutlined />, label: t(locale, 'themeLight'), disabled: themeMode === 'light' },
                    { key: 'dark', icon: <MoonOutlined />, label: t(locale, 'themeDark'), disabled: themeMode === 'dark' },
                    { key: 'system', icon: <DesktopOutlined />, label: t(locale, 'themeSystem'), disabled: themeMode === 'system' },
                  ],
                  onClick: ({ key }) => setThemeMode(key as ThemeMode),
                }}
              >
                <Button type="text" icon={themeIcon} />
              </Dropdown>
              <Dropdown
                menu={{
                  items: [
                    { key: 'zh', label: '中文', disabled: locale === 'zh' },
                    { key: 'en', label: 'EN', disabled: locale === 'en' },
                  ],
                  onClick: ({ key }) => setLocale(key as Locale),
                }}
              >
                <Button type="text" icon={<GlobalOutlined />} />
              </Dropdown>
              <Button type="text" icon={<GithubOutlined />} onClick={() => window.open('https://github.com/keiskeies/ai-gateway', '_blank')} />
            </div>
          </div>
        </div>
      </div>

      <Content
        style={{
          flex: 1,
          padding: isMobile ? '16px 16px 96px' : '24px',
          background: surface.appBg,
        }}
      >
        <div style={{ maxWidth: 1440, margin: '0 auto' }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/platforms" element={<Platforms />} />
            <Route path="/models" element={<Models />} />
            <Route path="/proxies" element={<Proxies />} />
            <Route path="/chat-test" element={<ChatTest />} />
            <Route path="/api-keys" element={<ApiKeys />} />
            <Route path="/checkin" element={<Checkin />} />
            <Route path="/logs" element={<Logs />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </div>
      </Content>

      {isMobile && (
        <div
          style={{
            position: 'fixed',
            left: 12,
            right: 12,
            bottom: 12,
            zIndex: 30,
            padding: 8,
            borderRadius: 22,
            border: `1px solid ${surface.cardBorder}`,
            background: surface.navBg,
            backdropFilter: 'blur(18px)',
            boxShadow: surface.shadow,
            display: 'flex',
            gap: 4,
          }}
        >
          {TAB_ITEMS.map((item) => (
            <NavChip
              key={item.key}
              item={item}
              mobile
              active={location.pathname === item.key}
              onClick={() => navigate(item.key)}
              locale={locale}
              brand={surface.brand}
              brandSoft={surface.brandSoft}
              textPrimary={surface.textPrimary}
              textSecondary={surface.textSecondary}
            />
          ))}
        </div>
      )}

      <Modal title={t(locale, 'documentation')} open={docOpen} onCancel={() => setDocOpen(false)} footer={null} width={isMobile ? 'calc(100vw - 24px)' : 760}>
        {locale === 'zh' ? <DocZh /> : <DocEn />}
      </Modal>
    </Layout>
  )
}

function DocZh() {
  const { token } = theme.useToken()
  const codeStyle: React.CSSProperties = {
    background: token.colorBgContainer,
    border: `1px solid ${token.colorBorderSecondary}`,
    borderRadius: 12,
    padding: '10px 12px',
    fontSize: 13,
    fontFamily: 'monospace',
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    lineHeight: 1.6,
    marginTop: 8,
    marginBottom: 12,
  }
  return (
    <div style={{ lineHeight: 1.8 }}>
      <Title level={4}>AI Gateway 使用帮助</Title>
      <Paragraph>
        <Text strong>AI Gateway</Text> 是一个跨平台 AI 接口聚合与负载均衡工具，支持 OpenAI、Anthropic、Ollama 等多种 AI 平台的统一接入。
      </Paragraph>
      <Title level={5}>1. 添加 AI 平台</Title>
      <Paragraph>先配置上游平台的 API 地址、API Key，以及需要的签到和健康检查信息。</Paragraph>
      <Title level={5}>2. 添加模型</Title>
      <Paragraph>按平台导入或手动配置模型，统一整理模型参数和能力标签。</Paragraph>
      <Title level={5}>3. 聊天测试与操练场</Title>
      <Paragraph>在聊天测试页可以做平台探针、批量巡检，也可以直接模拟请求验证模型表现。</Paragraph>
      <Title level={5}>4. 虚拟大模型</Title>
      <Paragraph>把多个后端模型组合成一个对外可调用的统一模型入口。</Paragraph>
      <Title level={5}>5. API 调用方式</Title>
      <div style={codeStyle}>{`POST http://localhost:1994/v1/chat/completions
Content-Type: application/json
Authorization: Bearer <your-api-key>

{
  "model": "qc480",
  "messages": [{"role": "user", "content": "Hello"}],
  "max_tokens": 100
}`}</div>
    </div>
  )
}

function DocEn() {
  const { token } = theme.useToken()
  const codeStyle: React.CSSProperties = {
    background: token.colorBgContainer,
    border: `1px solid ${token.colorBorderSecondary}`,
    borderRadius: 12,
    padding: '10px 12px',
    fontSize: 13,
    fontFamily: 'monospace',
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    lineHeight: 1.6,
    marginTop: 8,
    marginBottom: 12,
  }
  return (
    <div style={{ lineHeight: 1.8 }}>
      <Title level={4}>AI Gateway Help</Title>
      <Paragraph>
        <Text strong>AI Gateway</Text> aggregates multiple AI providers behind one admin UI and one unified API.
      </Paragraph>
      <Title level={5}>1. Add platforms</Title>
      <Paragraph>Configure upstream API URLs, API keys, and optional health-check or check-in settings.</Paragraph>
      <Title level={5}>2. Add models</Title>
      <Paragraph>Import or manually add models per platform, then normalize their capabilities.</Paragraph>
      <Title level={5}>3. Playground and diagnostics</Title>
      <Paragraph>Use Chat Test for diagnostics, probing, and live request verification.</Paragraph>
      <Title level={5}>4. Virtual models</Title>
      <Paragraph>Create unified public model IDs backed by one or more upstream models.</Paragraph>
      <Title level={5}>5. API example</Title>
      <div style={codeStyle}>{`POST http://localhost:1994/v1/chat/completions
Content-Type: application/json
Authorization: Bearer <your-api-key>

{
  "model": "qc480",
  "messages": [{"role": "user", "content": "Hello"}],
  "max_tokens": 100
}`}</div>
    </div>
  )
}
