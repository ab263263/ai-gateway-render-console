import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

type Props = {
  content: string
}

export default function MarkdownMessage({ content }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre({ children }) {
          return <div style={{ margin: '12px 0' }}>{children}</div>
        },
        code(props) {
          const { children, className, ...rest } = props
          const match = /language-(\w+)/.exec(className || '')
          const code = String(children).replace(/\n$/, '')

          if (match) {
            return (
              <SyntaxHighlighter
                {...rest as any}
                PreTag="div"
                language={match[1]}
                style={oneDark as any}
                customStyle={{
                  margin: 0,
                  borderRadius: 14,
                  padding: '14px 16px',
                  fontSize: 12,
                  lineHeight: 1.65,
                }}
              >
                {code}
              </SyntaxHighlighter>
            )
          }

          return (
            <code
              {...rest}
              style={{
                background: 'rgba(148, 163, 184, 0.14)',
                borderRadius: 8,
                padding: '2px 6px',
                fontSize: 12,
                fontFamily: 'Consolas, Monaco, monospace',
              }}
            >
              {code}
            </code>
          )
        },
        p({ children }) {
          return <p style={{ margin: '0 0 12px', lineHeight: 1.8 }}>{children}</p>
        },
        ul({ children }) {
          return <ul style={{ paddingLeft: 20, margin: '0 0 12px' }}>{children}</ul>
        },
        ol({ children }) {
          return <ol style={{ paddingLeft: 20, margin: '0 0 12px' }}>{children}</ol>
        },
        table({ children }) {
          return (
            <div style={{ overflowX: 'auto', margin: '12px 0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>{children}</table>
            </div>
          )
        },
        th({ children }) {
          return <th style={{ textAlign: 'left', borderBottom: '1px solid rgba(148,163,184,0.25)', padding: '8px 10px' }}>{children}</th>
        },
        td({ children }) {
          return <td style={{ borderBottom: '1px solid rgba(148,163,184,0.16)', padding: '8px 10px', verticalAlign: 'top' }}>{children}</td>
        },
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
