// ── DocsPage ──────────────────────────────────────────────────────────────────
// Renders universe-sim/structure.md as a navigable documentation page.
// Layout: sticky ToC sidebar on the left, scrollable markdown content on the right.

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react'
// @ts-ignore — Vite raw import (requires server.fs.allow: ['..'] in vite.config.ts)
import rawMd from '../../../structure.md?raw'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TocEntry {
  id: string
  text: string
  level: 2 | 3
}

type Block =
  | { type: 'h1' | 'h2' | 'h3' | 'h4'; text: string; id: string }
  | { type: 'hr' }
  | { type: 'code'; lang: string; lines: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'blockquote'; lines: string[] }
  | { type: 'paragraph'; text: string }

// ── Utilities ─────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_[\]()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function parseToc(md: string): TocEntry[] {
  const entries: TocEntry[] = []
  for (const line of md.split('\n')) {
    const h2 = line.match(/^## (.+)$/)
    const h3 = line.match(/^### (.+)$/)
    if (h2) entries.push({ level: 2, text: h2[1].replace(/\*\*/g, ''), id: slugify(h2[1]) })
    else if (h3) entries.push({ level: 3, text: h3[1].replace(/\*\*/g, ''), id: slugify(h3[1]) })
  }
  return entries
}

// ── Markdown block parser ─────────────────────────────────────────────────────

function parseBlocks(md: string): Block[] {
  const lines = md.split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Blank line — skip
    if (line.trim() === '') { i++; continue }

    // H4 before H3/H2/H1 (most specific first)
    const h4m = line.match(/^#### (.+)$/)
    if (h4m) { blocks.push({ type: 'h4', text: h4m[1], id: slugify(h4m[1]) }); i++; continue }
    const h3m = line.match(/^### (.+)$/)
    if (h3m) { blocks.push({ type: 'h3', text: h3m[1], id: slugify(h3m[1]) }); i++; continue }
    const h2m = line.match(/^## (.+)$/)
    if (h2m) { blocks.push({ type: 'h2', text: h2m[1], id: slugify(h2m[1]) }); i++; continue }
    const h1m = line.match(/^# (.+)$/)
    if (h1m) { blocks.push({ type: 'h1', text: h1m[1], id: slugify(h1m[1]) }); i++; continue }

    // Horizontal rule
    if (line.match(/^---+$/)) { blocks.push({ type: 'hr' }); i++; continue }

    // Fenced code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      i++
      const codeLines: string[] = []
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // closing ```
      blocks.push({ type: 'code', lang, lines: codeLines })
      continue
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const bqLines: string[] = []
      while (i < lines.length && lines[i].startsWith('> ')) {
        bqLines.push(lines[i].slice(2))
        i++
      }
      blocks.push({ type: 'blockquote', lines: bqLines })
      continue
    }

    // Table
    if (line.startsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].trimStart().startsWith('|')) {
        tableLines.push(lines[i])
        i++
      }
      if (tableLines.length >= 2) {
        const parseRow = (row: string) =>
          row.split('|').filter(Boolean).map(s => s.trim())
        const headers = parseRow(tableLines[0])
        // skip separator row (index 1: |----|
        const rows = tableLines.slice(2).map(parseRow)
        blocks.push({ type: 'table', headers, rows })
      }
      continue
    }

    // Unordered list
    if (line.match(/^[ \t]*[-*+] /)) {
      const items: string[] = []
      while (i < lines.length && lines[i].match(/^[ \t]*[-*+] /)) {
        const indent = lines[i].match(/^([ \t]*)/)![1].length
        const text = lines[i].replace(/^[ \t]*[-*+] /, '')
        items.push(indent > 0 ? `\u00a0\u00a0\u00a0\u00a0${text}` : text)
        i++
      }
      blocks.push({ type: 'list', ordered: false, items })
      continue
    }

    // Ordered list
    if (line.match(/^\d+\. /)) {
      const items: string[] = []
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        items.push(lines[i].replace(/^\d+\. /, ''))
        i++
      }
      blocks.push({ type: 'list', ordered: true, items })
      continue
    }

    // Paragraph — accumulate consecutive non-block lines
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].match(/^#{1,4} /) &&
      !lines[i].startsWith('|') &&
      !lines[i].startsWith('```') &&
      !lines[i].startsWith('> ') &&
      !lines[i].match(/^[ \t]*[-*+] /) &&
      !lines[i].match(/^\d+\. /) &&
      !lines[i].match(/^---+$/)
    ) {
      paraLines.push(lines[i])
      i++
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', text: paraLines.join(' ') })
    }
  }

  return blocks
}

// ── Inline renderer ───────────────────────────────────────────────────────────

type InlineToken = { type: 'text' | 'bold' | 'code' | 'italic'; content: string }

function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = []
  let i = 0
  while (i < text.length) {
    // Bold **...**
    if (text[i] === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2)
      if (end !== -1) {
        tokens.push({ type: 'bold', content: text.slice(i + 2, end) })
        i = end + 2
        continue
      }
    }
    // Inline code `...`
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1)
      if (end !== -1) {
        tokens.push({ type: 'code', content: text.slice(i + 1, end) })
        i = end + 1
        continue
      }
    }
    // Italic *...*
    if (text[i] === '*' && text[i + 1] !== '*') {
      const end = text.indexOf('*', i + 1)
      if (end !== -1 && text[end + 1] !== '*') {
        tokens.push({ type: 'italic', content: text.slice(i + 1, end) })
        i = end + 1
        continue
      }
    }
    // Regular text — accumulate
    const last = tokens[tokens.length - 1]
    if (last?.type === 'text') last.content += text[i]
    else tokens.push({ type: 'text', content: text[i] })
    i++
  }
  return tokens
}

function Inline({ text }: { text: string }) {
  const tokens = useMemo(() => tokenizeInline(text), [text])
  return (
    <>
      {tokens.map((t, idx) => {
        if (t.type === 'bold')   return <strong key={idx} style={{ color: '#e8f4ff', fontWeight: 600 }}>{t.content}</strong>
        if (t.type === 'code')   return <code key={idx} style={INLINE_CODE}>{t.content}</code>
        if (t.type === 'italic') return <em key={idx} style={{ color: 'rgba(180,210,255,0.8)', fontStyle: 'italic' }}>{t.content}</em>
        return <React.Fragment key={idx}>{t.content}</React.Fragment>
      })}
    </>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const INLINE_CODE: React.CSSProperties = {
  background: 'rgba(0,180,255,0.1)',
  color: '#7dd3fc',
  padding: '1px 6px',
  borderRadius: 3,
  fontSize: '0.88em',
  fontFamily: 'inherit',
}

// ── Block renderer ────────────────────────────────────────────────────────────

function RenderBlock({ block, idx }: { block: Block; idx: number }) {
  switch (block.type) {

    case 'h1':
      return (
        <h1 id={block.id} key={idx} style={{
          fontSize: 20, fontWeight: 700, color: '#e8f4ff',
          marginTop: 32, marginBottom: 12,
          paddingBottom: 10,
          borderBottom: '1px solid rgba(0,180,255,0.2)',
          letterSpacing: 0.5,
        }}>
          <Inline text={block.text} />
        </h1>
      )

    case 'h2':
      return (
        <h2 id={block.id} key={idx} style={{
          fontSize: 15, fontWeight: 700, color: '#00d4ff',
          marginTop: 40, marginBottom: 10,
          paddingBottom: 8,
          borderBottom: '1px solid rgba(0,180,255,0.15)',
          letterSpacing: 1.5,
          textTransform: 'uppercase',
        }}>
          <Inline text={block.text} />
        </h2>
      )

    case 'h3':
      return (
        <h3 id={block.id} key={idx} style={{
          fontSize: 12, fontWeight: 700, color: 'rgba(150,210,255,0.9)',
          marginTop: 28, marginBottom: 8,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
        }}>
          <Inline text={block.text} />
        </h3>
      )

    case 'h4':
      return (
        <h4 id={block.id} key={idx} style={{
          fontSize: 11, fontWeight: 600, color: 'rgba(100,180,255,0.75)',
          marginTop: 20, marginBottom: 6,
          letterSpacing: 1,
          textTransform: 'uppercase',
        }}>
          <Inline text={block.text} />
        </h4>
      )

    case 'hr':
      return (
        <hr key={idx} style={{
          border: 'none',
          borderTop: '1px solid rgba(0,180,255,0.12)',
          margin: '28px 0',
        }} />
      )

    case 'code':
      return (
        <div key={idx} style={{
          background: 'rgba(0,10,30,0.7)',
          border: '1px solid rgba(0,180,255,0.12)',
          borderRadius: 5,
          padding: '14px 16px',
          margin: '12px 0',
          overflowX: 'auto',
        }}>
          {block.lang && (
            <div style={{
              fontSize: 9, letterSpacing: 2, color: 'rgba(0,180,255,0.35)',
              marginBottom: 8, textTransform: 'uppercase',
            }}>
              {block.lang}
            </div>
          )}
          <pre style={{
            margin: 0, fontSize: 11, lineHeight: 1.7,
            color: 'rgba(200,230,255,0.8)',
            whiteSpace: 'pre',
            fontFamily: 'inherit',
          }}>
            {block.lines.join('\n')}
          </pre>
        </div>
      )

    case 'table':
      return (
        <div key={idx} style={{ overflowX: 'auto', margin: '14px 0' }}>
          <table style={{
            borderCollapse: 'collapse',
            fontSize: 11, lineHeight: 1.6,
            minWidth: '100%',
          }}>
            <thead>
              <tr>
                {block.headers.map((h, hi) => (
                  <th key={hi} style={{
                    padding: '6px 14px',
                    textAlign: 'left',
                    color: '#00d4ff',
                    fontSize: 10,
                    letterSpacing: 1,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    background: 'rgba(0,40,80,0.4)',
                    border: '1px solid rgba(0,180,255,0.12)',
                    whiteSpace: 'nowrap',
                  }}>
                    <Inline text={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri} style={{
                  background: ri % 2 === 0 ? 'transparent' : 'rgba(0,30,60,0.2)',
                }}>
                  {row.map((cell, ci) => (
                    <td key={ci} style={{
                      padding: '5px 14px',
                      border: '1px solid rgba(0,180,255,0.08)',
                      color: 'rgba(190,220,255,0.75)',
                      verticalAlign: 'top',
                    }}>
                      <Inline text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )

    case 'list':
      return (
        <ul key={idx} style={{
          margin: '8px 0',
          paddingLeft: 0,
          listStyle: 'none',
        }}>
          {block.items.map((item, ii) => (
            <li key={ii} style={{
              display: 'flex',
              gap: 10,
              padding: '3px 0',
              fontSize: 12,
              color: 'rgba(180,210,255,0.72)',
              lineHeight: 1.7,
            }}>
              <span style={{
                color: 'rgba(0,180,255,0.5)',
                flexShrink: 0,
                marginTop: 1,
                fontSize: block.ordered ? 11 : 14,
              }}>
                {block.ordered ? `${ii + 1}.` : '·'}
              </span>
              <span><Inline text={item} /></span>
            </li>
          ))}
        </ul>
      )

    case 'blockquote':
      return (
        <div key={idx} style={{
          borderLeft: '2px solid rgba(0,180,255,0.3)',
          paddingLeft: 16,
          margin: '12px 0',
          background: 'rgba(0,50,100,0.12)',
          borderRadius: '0 4px 4px 0',
          padding: '10px 14px 10px 16px',
        }}>
          {block.lines.map((line, li) => (
            <p key={li} style={{
              margin: '4px 0',
              fontSize: 12,
              color: 'rgba(160,200,240,0.8)',
              lineHeight: 1.7,
              fontStyle: 'italic',
            }}>
              <Inline text={line} />
            </p>
          ))}
        </div>
      )

    case 'paragraph':
      return (
        <p key={idx} style={{
          margin: '8px 0',
          fontSize: 12,
          color: 'rgba(180,210,255,0.72)',
          lineHeight: 1.8,
        }}>
          <Inline text={block.text} />
        </p>
      )

    default:
      return null
  }
}

// ── Main component ────────────────────────────────────────────────────────────

export function DocsPage() {
  const [activeId, setActiveId]   = useState<string>('')
  const [search,   setSearch]     = useState('')
  const contentRef                = useRef<HTMLDivElement>(null)

  const toc    = useMemo(() => parseToc(rawMd),    [])
  const blocks = useMemo(() => parseBlocks(rawMd), [])

  // Track active section by scroll position
  useEffect(() => {
    const el = contentRef.current
    if (!el) return

    function onScroll() {
      const headings = el!.querySelectorAll('h2[id], h3[id]')
      let current = ''
      for (const h of Array.from(headings)) {
        const rect = h.getBoundingClientRect()
        const containerTop = el!.getBoundingClientRect().top
        if (rect.top - containerTop <= 24) current = h.id
      }
      setActiveId(current)
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Scroll to heading when ToC item clicked
  const scrollTo = useCallback((id: string) => {
    const el = contentRef.current?.querySelector(`#${CSS.escape(id)}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  // Filter ToC by search
  const filteredToc = useMemo(() => {
    if (!search) return toc
    const q = search.toLowerCase()
    return toc.filter(e => e.text.toLowerCase().includes(q))
  }, [toc, search])

  return (
    <div style={{
      display: 'flex',
      height: '100%',
      overflow: 'hidden',
      background: 'rgba(4,8,18,0.95)',
    }}>

      {/* ── Left ToC sidebar ──────────────────────────────────────────────── */}
      <div style={{
        width: 240,
        flexShrink: 0,
        borderRight: '1px solid rgba(0,180,255,0.1)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Search box */}
        <div style={{
          padding: '10px 12px 8px',
          borderBottom: '1px solid rgba(0,180,255,0.08)',
          flexShrink: 0,
        }}>
          <div style={{
            fontSize: 9, letterSpacing: 3,
            color: 'rgba(0,180,255,0.35)',
            marginBottom: 8,
          }}>
            ENGINEERING REFERENCE
          </div>
          <input
            type="text"
            placeholder="Filter sections..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%',
              background: 'rgba(0,20,50,0.5)',
              border: '1px solid rgba(0,180,255,0.15)',
              borderRadius: 3,
              padding: '5px 8px',
              fontSize: 11,
              color: 'rgba(200,230,255,0.8)',
              fontFamily: 'inherit',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* ToC entries */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {filteredToc.map(entry => {
            const isActive = activeId === entry.id
            return (
              <button
                key={entry.id}
                onClick={() => scrollTo(entry.id)}
                title={entry.text}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: entry.level === 2 ? '6px 14px' : '4px 14px 4px 26px',
                  background: isActive ? 'rgba(0,180,255,0.07)' : 'transparent',
                  border: 'none',
                  borderLeft: `2px solid ${isActive ? '#00d4ff' : 'transparent'}`,
                  color: isActive
                    ? '#00d4ff'
                    : entry.level === 2
                      ? 'rgba(160,200,255,0.65)'
                      : 'rgba(110,155,210,0.5)',
                  fontSize: entry.level === 2 ? 11 : 10,
                  fontFamily: 'inherit',
                  letterSpacing: entry.level === 2 ? 0.3 : 0,
                  fontWeight: entry.level === 2 ? 600 : 400,
                  cursor: 'pointer',
                  textAlign: 'left',
                  lineHeight: 1.4,
                  transition: 'all 0.1s',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                onMouseEnter={e => {
                  if (!isActive) e.currentTarget.style.color = 'rgba(200,230,255,0.85)'
                }}
                onMouseLeave={e => {
                  if (!isActive) e.currentTarget.style.color = entry.level === 2
                    ? 'rgba(160,200,255,0.65)'
                    : 'rgba(110,155,210,0.5)'
                }}
              >
                {entry.text}
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: '8px 14px',
          borderTop: '1px solid rgba(0,180,255,0.08)',
          fontSize: 9,
          color: 'rgba(0,180,255,0.25)',
          letterSpacing: 1,
          flexShrink: 0,
        }}>
          {toc.length} SECTIONS
        </div>
      </div>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div
        ref={contentRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '32px 48px 80px',
          minWidth: 0,
        }}
      >
        {blocks.map((block, idx) => (
          <RenderBlock key={idx} block={block} idx={idx} />
        ))}
      </div>

    </div>
  )
}
