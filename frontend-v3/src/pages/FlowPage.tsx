import { useState } from 'react'
import type { Theme } from '@/lib/theme'
import { APP } from '@/lib/mockData'
import { MonoLabel } from '@/components/today/MonoLabel'

interface Props {
  theme: Theme
}

const MODES = ['DECLARE', 'REFLECT', 'BRAINSTORM', 'PLAN'] as const
type Mode = (typeof MODES)[number]

export default function FlowPage({ theme: t }: Props) {
  const a = APP
  const [mode, setMode] = useState<Mode>('DECLARE')
  const [draft, setDraft] = useState('')

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'grid',
        gridTemplateColumns: '1fr 320px',
        minHeight: 0,
      }}
    >
      {/* MAIN: conversation */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          borderRight: `1px solid ${t.ink12}`,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 28px 14px',
            borderBottom: `1px solid ${t.ink12}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.015em' }}>Flow</div>
            <div
              style={{
                fontFamily: t.mono,
                fontSize: 10,
                color: t.ink50,
                marginTop: 2,
                letterSpacing: '0.14em',
              }}
            >
              AI 対話型ジャーナル · 宣言と振り返りを1か所で
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {MODES.map((m) => {
              const active = m === mode
              return (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  style={{
                    padding: '5px 10px',
                    fontFamily: t.mono,
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: '0.14em',
                    color: active ? t.paper : t.ink70,
                    background: active ? t.ink : 'transparent',
                    border: `1px solid ${t.line}`,
                    cursor: 'pointer',
                  }}
                >
                  {m}
                </button>
              )
            })}
          </div>
        </div>

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '24px 28px',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          {a.flowMessages.map((msg, i) => {
            const isAi = msg.role === 'ai'
            return (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '34px 1fr',
                  gap: 14,
                  maxWidth: 720,
                  alignSelf: isAi ? 'flex-start' : 'flex-end',
                  marginLeft: isAi ? 0 : 'auto',
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    border: `1.5px solid ${t.line}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isAi ? t.paperWarm : t.ink,
                    fontFamily: t.mono,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    color: isAi ? t.ink : t.paper,
                  }}
                >
                  {isAi ? <div style={{ width: 8, height: 8, background: t.accent }} /> : 'ME'}
                </div>
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 10,
                      marginBottom: 6,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: t.mono,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.16em',
                        color: isAi ? t.accent : t.ink70,
                      }}
                    >
                      {isAi ? 'COACH' : 'ME'}
                    </span>
                    <span style={{ fontFamily: t.mono, fontSize: 9, color: t.ink30 }}>
                      {msg.t}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      lineHeight: 1.6,
                      color: t.ink,
                      whiteSpace: 'pre-wrap',
                      padding: '14px 16px',
                      border: `1px solid ${isAi ? t.ink12 : t.line}`,
                      background: isAi ? t.paper : t.paperWarm,
                    }}
                  >
                    {msg.text}
                  </div>
                  {msg.actions && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      {msg.actions.map((act, j) => (
                        <button
                          key={j}
                          style={{
                            padding: '8px 14px',
                            cursor: 'pointer',
                            fontFamily: t.mono,
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: '0.14em',
                            background: act.kind === 'adopt' ? t.accent : 'transparent',
                            color: act.kind === 'adopt' ? t.paper : t.ink70,
                            border: `1px solid ${act.kind === 'adopt' ? t.accent : t.ink12}`,
                          }}
                        >
                          {act.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Composer */}
        <div
          style={{
            borderTop: `1px solid ${t.line}`,
            padding: '14px 28px 18px',
            background: t.paper,
          }}
        >
          <div
            style={{
              border: `1.5px solid ${t.line}`,
              padding: '12px 14px',
              background: t.paper,
            }}
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="今思っていること、宣言、振り返りを書く...　/  音声入力は ⌘ + Space"
              style={{
                width: '100%',
                minHeight: 56,
                border: 'none',
                outline: 'none',
                resize: 'none',
                fontFamily: t.sans,
                fontSize: 14,
                lineHeight: 1.55,
                background: 'transparent',
                color: t.ink,
              }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 8,
                paddingTop: 8,
                borderTop: `1px solid ${t.ink06}`,
              }}
            >
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { l: '🎙', tip: 'voice' },
                  { l: '＋ task', tip: 'task' },
                  { l: '＋ habit', tip: 'habit' },
                  { l: '＃ tag', tip: 'tag' },
                ].map((b) => (
                  <button
                    key={b.l}
                    style={{
                      padding: '5px 10px',
                      cursor: 'pointer',
                      fontFamily: t.mono,
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: '0.1em',
                      background: 'transparent',
                      color: t.ink70,
                      border: `1px solid ${t.ink12}`,
                    }}
                  >
                    {b.l}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    fontFamily: t.mono,
                    fontSize: 9,
                    color: t.ink30,
                    letterSpacing: '0.14em',
                  }}
                >
                  ⏎ SEND · ⇧⏎ NEW LINE
                </span>
                <button
                  style={{
                    padding: '8px 16px',
                    background: t.ink,
                    color: t.paper,
                    border: `1px solid ${t.line}`,
                    fontFamily: t.mono,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.16em',
                    cursor: 'pointer',
                  }}
                >
                  SEND →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SIDE: AI extractions */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          padding: '20px',
          overflow: 'auto',
          background: t.paperWarm,
        }}
      >
        <div>
          <MonoLabel theme={t} color={t.accent}>
            AI EXTRACTIONS
          </MonoLabel>
          <div style={{ fontSize: 11, color: t.ink50, marginTop: 4 }}>
            この対話から抽出された候補。ワンタップで反映できます。
          </div>
        </div>

        <div>
          <div style={{ marginBottom: 8 }}>
            <MonoLabel theme={t}>NEW TASKS · 2</MonoLabel>
          </div>
          {[
            { l: '英語学習を 08:00–08:25 に固定', est: 25, due: 'today' },
            { l: 'GW計画を手書きで整理', est: 30, due: 'today' },
          ].map((tk, i) => (
            <div
              key={i}
              style={{
                padding: '10px 12px',
                border: `1px solid ${t.ink12}`,
                background: t.paper,
                marginBottom: 6,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 500 }}>{tk.l}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span
                  style={{
                    fontFamily: t.mono,
                    fontSize: 9,
                    color: t.ink50,
                    letterSpacing: '0.14em',
                  }}
                >
                  {tk.est}M · {tk.due.toUpperCase()}
                </span>
                <button
                  style={{
                    fontFamily: t.mono,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.14em',
                    color: t.accent,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  + ADD
                </button>
              </div>
            </div>
          ))}
        </div>

        <div>
          <div style={{ marginBottom: 8 }}>
            <MonoLabel theme={t}>HABIT SUGGESTIONS · 1</MonoLabel>
          </div>
          <div style={{ padding: '10px 12px', border: `1px solid ${t.accent}`, background: t.paper }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>英語を朝の固定枠に</div>
            <div style={{ fontSize: 11, color: t.ink50, marginTop: 4, lineHeight: 1.45 }}>
              3日連続で抜けた事実 + 朝の方が達成率68%高いパターン
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <span
                style={{
                  fontFamily: t.mono,
                  fontSize: 9,
                  color: t.accent,
                  letterSpacing: '0.14em',
                  fontWeight: 700,
                }}
              >
                ● 92% CONFIDENCE
              </span>
              <button
                style={{
                  fontFamily: t.mono,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  color: t.accent,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                + ADOPT
              </button>
            </div>
          </div>
        </div>

        <div>
          <div style={{ marginBottom: 8 }}>
            <MonoLabel theme={t}>TAGS DETECTED</MonoLabel>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {['提案書', 'GW', '英語', '副業', '朝固定枠'].map((tag) => (
              <span
                key={tag}
                style={{
                  padding: '3px 8px',
                  fontFamily: t.mono,
                  fontSize: 9,
                  letterSpacing: '0.1em',
                  border: `1px solid ${t.ink12}`,
                  background: t.paper,
                  color: t.ink70,
                }}
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 'auto', borderTop: `1px solid ${t.ink12}`, paddingTop: 12 }}>
          <MonoLabel theme={t}>SENT TO</MonoLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
            {[
              { app: 'Notion', count: 2 },
              { app: 'Linear', count: 1 },
              { app: 'Calendar', count: 2 },
            ].map((s) => (
              <div
                key={s.app}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontFamily: t.mono,
                  fontSize: 10,
                  color: t.ink70,
                }}
              >
                <span>↗ {s.app}</span>
                <span>{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
