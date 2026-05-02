import { useState } from 'react'
import type { Theme } from '@/lib/theme'
import { APP } from '@/lib/mockData'
import { MonoLabel } from '@/components/today/MonoLabel'

interface Props {
  theme: Theme
}

const NOTE_BODY: Record<string, { title: string; updated: string; body: React.ReactNode }> = {
  n1: {
    title: 'Habit Design MVPまでに必要なこと',
    updated: 'たったいま',
    body: (
      <>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 0 }}>マイルストーン</h3>
        <ul style={{ paddingLeft: 18, margin: '8px 0' }}>
          <li>Habit / Flow / Today の動線確定</li>
          <li>計測タイプ別 UI（boolean/count/duration/distance/pages/score/weight/currency）</li>
          <li>外部ソース連携（Apple Watch / Nike / Health / Strava / Linear）</li>
          <li>写真証明による XP ブースト機構</li>
        </ul>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 24 }}>残課題</h3>
        <ul style={{ paddingLeft: 18, margin: '8px 0' }}>
          <li>Memory 画面の編集 UI</li>
          <li>Calendar の week / month ビュー</li>
          <li>モバイル版（ハル / XP / Wizard）</li>
        </ul>
      </>
    ),
  },
  n2: {
    title: 'アイデア',
    updated: '1時間前',
    body: <p>新しい習慣テンプレートのアイデア集。</p>,
  },
  n3: {
    title: '2026/04/28',
    updated: '1時間前',
    body: <p>GW計画をたてる前に、現在地のリストアップ。</p>,
  },
  n4: {
    title: '2026/05/01',
    updated: '1時間前',
    body: <p>英語学習が結構楽しかった様子。</p>,
  },
  n5: {
    title: '英会話',
    updated: '21時間前',
    body: <p>英会話のメモ。</p>,
  },
  n6: {
    title: '2026/04/29',
    updated: '21時間前',
    body: <p>副業推進ブロックが取れず焦り。</p>,
  },
}

export default function NotesPage({ theme: t }: Props) {
  const a = APP
  const [activeId, setActiveId] = useState<string>('n1')
  const [query, setQuery] = useState('')

  const filtered = a.notes.filter((n) =>
    query.trim() === '' ? true : n.title.includes(query.trim()),
  )
  const pinned = filtered.filter((n) => n.pinned)
  const recent = filtered.filter((n) => !n.pinned)
  const active = NOTE_BODY[activeId] ?? NOTE_BODY.n1

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'grid',
        gridTemplateColumns: '280px 1fr',
        minHeight: 0,
      }}
    >
      {/* SIDEBAR */}
      <div
        style={{
          borderRight: `1px solid ${t.ink12}`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
        }}
      >
        <div
          style={{
            padding: '18px 18px 12px',
            borderBottom: `1px solid ${t.ink12}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700 }}>Notes</div>
          <button
            style={{
              padding: '6px 10px',
              fontFamily: t.mono,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              background: t.ink,
              color: t.paper,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            + NEW
          </button>
        </div>
        <div style={{ padding: '10px 12px' }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes..."
            style={{
              width: '100%',
              padding: '7px 10px',
              border: `1px solid ${t.ink12}`,
              background: t.paper,
              fontSize: 12,
              fontFamily: t.sans,
              outline: 'none',
              color: t.ink,
            }}
          />
        </div>
        {pinned.length > 0 && (
          <>
            <div style={{ padding: '8px 12px 4px' }}>
              <MonoLabel theme={t}>PINNED</MonoLabel>
            </div>
            {pinned.map((n) => {
              const active = activeId === n.id
              return (
                <button
                  key={n.id}
                  onClick={() => setActiveId(n.id)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 14px',
                    borderTop: `1px solid ${t.ink06}`,
                    cursor: 'pointer',
                    background: active ? t.paperWarm : 'transparent',
                    border: 'none',
                    borderTopStyle: 'solid',
                    borderTopWidth: 1,
                    borderTopColor: t.ink06,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.ink }}>{n.title}</div>
                  <div
                    style={{
                      fontFamily: t.mono,
                      fontSize: 9,
                      color: t.ink50,
                      marginTop: 2,
                      letterSpacing: '0.1em',
                    }}
                  >
                    {n.updated}
                  </div>
                </button>
              )
            })}
          </>
        )}
        {recent.length > 0 && (
          <>
            <div style={{ padding: '12px 12px 4px' }}>
              <MonoLabel theme={t}>RECENT</MonoLabel>
            </div>
            {recent.map((n) => {
              const active = activeId === n.id
              return (
                <button
                  key={n.id}
                  onClick={() => setActiveId(n.id)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 14px',
                    cursor: 'pointer',
                    background: active ? t.paperWarm : 'transparent',
                    border: 'none',
                    borderTopStyle: 'solid',
                    borderTopWidth: 1,
                    borderTopColor: t.ink06,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 500, color: t.ink }}>{n.title}</div>
                  <div
                    style={{
                      fontFamily: t.mono,
                      fontSize: 9,
                      color: t.ink50,
                      marginTop: 2,
                      letterSpacing: '0.1em',
                    }}
                  >
                    {n.updated}
                  </div>
                </button>
              )
            })}
          </>
        )}
      </div>

      {/* EDITOR */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
        <div
          style={{
            padding: '20px 32px 14px',
            borderBottom: `1px solid ${t.ink12}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 700 }}>{active.title}</div>
          <div
            style={{
              fontFamily: t.mono,
              fontSize: 10,
              color: t.ink50,
              letterSpacing: '0.12em',
            }}
          >
            UPDATED · {active.updated}
          </div>
        </div>
        <div
          style={{
            padding: '22px 32px',
            maxWidth: 720,
            fontSize: 14,
            lineHeight: 1.7,
            color: t.ink70,
          }}
        >
          {active.body}
        </div>
      </div>
    </div>
  )
}
