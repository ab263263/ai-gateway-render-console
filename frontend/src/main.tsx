import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { ConfigProvider, theme as antTheme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import { AppProvider, useAppContext, getSurfaceTheme } from './ThemeContext'
import App from './App'
import { initConfig } from './api'

initConfig()

function ThemedApp() {
  const { isDark, locale } = useAppContext()
  const surface = getSurfaceTheme(isDark)

  return (
    <ConfigProvider
      locale={locale === 'zh' ? zhCN : enUS}
      theme={{
        algorithm: isDark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
        token: {
          colorPrimary: surface.brand,
          colorSuccess: surface.success,
          colorWarning: surface.warning,
          colorError: surface.danger,
          colorBgBase: surface.appBg,
          colorBgContainer: surface.cardBg,
          colorBgElevated: surface.panelBgElevated,
          colorBorder: surface.cardBorder,
          colorBorderSecondary: surface.strongBorder,
          colorText: surface.textPrimary,
          colorTextSecondary: surface.textSecondary,
          borderRadius: 16,
          borderRadiusLG: 20,
          boxShadow: surface.shadow,
          fontFamily: '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
        },
        components: {
          Layout: {
            colorBgBody: surface.appBg,
            colorBgLayout: surface.appBg,
            colorBgContainer: surface.panelBg,
            colorBgElevated: surface.panelBgElevated,
          },
          Card: {
            borderRadiusLG: 20,
            colorBorderSecondary: surface.cardBorder,
          },
          Button: {
            borderRadius: 12,
            controlHeight: 40,
          },
          Input: {
            borderRadius: 12,
            controlHeight: 40,
          },
          InputNumber: {
            borderRadius: 12,
            controlHeight: 40,
          },
          Select: {
            borderRadius: 12,
            controlHeight: 40,
          },
          Table: {
            borderColor: surface.cardBorder,
            headerBg: isDark ? '#0f172a' : '#f8fafc',
            rowHoverBg: surface.brandSoft,
          },
          Modal: {
            borderRadiusLG: 20,
          },
          Drawer: {
            colorBgElevated: surface.panelBgElevated,
            footerPaddingBlock: 16,
            footerPaddingInline: 20,
          },
          Collapse: {
            headerBg: surface.panelBgElevated,
            contentBg: surface.cardBg,
            borderRadiusLG: 16,
            colorBorder: surface.cardBorder,
          },
          Alert: {
            borderRadiusLG: 16,
            withDescriptionPadding: 16,
          },
          Statistic: {
            contentFontSize: 28,
          },
          Tag: {
            borderRadiusSM: 999,
          },
          Descriptions: {
            itemPaddingBottom: 12,
            colonMarginRight: 12,
            colonMarginLeft: 4,
          },
          Segmented: {
            trackBg: surface.navRailBg,
            itemSelectedBg: surface.cardBg,
            itemSelectedColor: surface.brand,
          },
          Switch: {
            colorPrimary: surface.brand,
            colorPrimaryHover: surface.brand,
          },
          Tabs: {
            itemSelectedColor: surface.brand,
            inkBarColor: surface.brand,
          },
        },
      }}
    >
      <HashRouter>
        <App />
      </HashRouter>
    </ConfigProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProvider>
      <ThemedApp />
    </AppProvider>
  </React.StrictMode>,
)
