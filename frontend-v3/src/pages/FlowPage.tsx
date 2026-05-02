import { useCallback, useEffect, useState } from 'react'
import type { Theme } from '@/lib/theme'
import { MonoLabel } from '@/components/today/MonoLabel'
import {
  listHabitSuggestions,
  listJournals,
  updateHabitSuggestion,
  upsertJournal,
} from '@/lib/api'
import type {
  BackendHabitSuggestion,
  BackendJournalEntry,
  JournalEntryType,
} from '@/types/api'

interface Props {
  theme: Theme
}

const MODES = ['DECLARE', 'REFLECT', 'BRAINSTORM', 'PLAN'] as const
type Mode = (typeof MODES)[number]

const MODE_TO_ENTRY_TYPE: Record<Mode, JournalEntryType> = {
  DECLARE: 'morning_journal',
  REFLECT: 'evening_notes',
  BRAINSTORM: 'journaling',
  PLAN: 'daily_report',
}

const ENTRY_TYPE_LABEL: Record<JournalEntryType, string> = {
  journaling: 'BRAINSTORM',
  daily_report: 'PLAN',
  checklist: 'CHECKLIST',
  kpi_update: 'KPI',
  evening_feedback: 'COACH',
  evening_notes: 'REFLECT',
  morning_journal: 'DECLARE',
  user_context_snapshot: 'CTX',
}

function formatTimestamp(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function FlowPage({ theme: t }: Props) {
  const [mode, setMode] = useState<Mode>('DECLARE')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [entries, setEntries] = useState<BackendJournalEntry[] | null>(null)
  const [suggestions, setSuggestions] = useState<BackendHabitSuggestion[] | null>(null)

  const loadAll = useCallback(async () => {
    try {
      const [j, s] = await Promise.all([
        listJournals(20),
        listHabitSuggestions('pending'),
      ])
      setEntries(j ?? [])
      setSuggestions(s ?? [])
    } catch (err) {
      console.error('[flow] load failed', err)
      setEntries(null)
      setSuggestions(null)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const isLive = entries !== null

  const handleSend = async () => {
    const content = draft.trim()
    if (!content) return
    setSending(true)
    setError(null)
    try {
      await upsertJournal({
        entry_type: MODE_TO_ENTRY_TYPE[mode],
        content,
        entry_date: todayStr(),
      })
      setDraft('')
      // Reload entries; AI suggestions arrive async (background task) so
      // schedule a follow-up reload too.
      await loadAll()
      window.setTimeout(loadAll, 5000)
    } catch (err) {
      console.error('[flow] send failed', err)
      setError(err instanceof Error ? err.message : '送信に失敗しました')
    } finally {
      setSending(false)
    }
  }

  const adoptSuggestion = async (id: string) => {
    try {
      await updateHabitSuggestion(id, { status: 'accepted' })
      setSuggestions((prev) => prev?.filter((s) => s.id !== id) ?? null)
    } catch (err) {
      console.error('[flow] adopt failed', err)
    }
  }
  const rejectSuggestion = async (id: string) => {
    try {
      await updateHabitSuggestion(id, { status: 'rejected' })
      setSuggestions((prev) => prev?.filter((s) => s.id !== id) ?? null)
    } catch (err) {
      console.error('[flow] reject failed', err)
    }
  }

  const habitSuggestions = (suggestions ?? []).filter((s) => s.kind === 'habit')
  const taskSuggestions = (suggestions ?? []).filter((s) => s.kind === 'task')

  // Sort entries oldest → newest so the latest sits at the bottom.
  const sortedEntries = (entries ?? [])
    .slice()
    .sort((a, b) => {
      const ax = a.created_at ?? a.entry_date
      const bx = b.created_at ?? b.entry_date
      return ax.localeCompare(bx)
    })

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
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.015em' }}>Flow</span>
              <span
                style={{
                  fontFamily: t.mono,
                  fontSize: 10,
                  color: t.accent,
                  letterSpacing: '0.16em',
                }}
              >
                ● {isLive ? `LIVE · ${sortedEntries.length}件` : 'MOCK · 履歴未取得'}
              </span>
            </div>
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
          {!isLive && (
            <div
              style={{
                fontFamily: t.mono,
                fontSize: 11,
                color: t.ink50,
                letterSpacing: '0.1em',
                padding: 12,
                border: `1px dashed ${t.ink12}`,
                background: t.paperWarm,
              }}
            >
              backend に接続できないため履歴未表示。下のコンポーザーで送ると LIVE になります。
            </div>
          )}
          {isLive && sortedEntries.length === 0 && (
            <div
              style={{
                fontFamily: t.mono,
                fontSize: 11,
                color: t.ink50,
                letterSpacing: '0.1em',
                padding: 12,
                border: `1px dashed ${t.ink12}`,
                background: t.paperWarm,
              }}
            >
              まだ独白がありません。コンポーザーから書いてください。
            </div>
          )}
          {sortedEntries.map((entry) => (
            <div
              key={entry.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '34px 1fr',
                gap: 14,
                maxWidth: 720,
                alignSelf: 'flex-end',
                marginLeft: 'auto',
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
                  background: t.ink,
                  fontFamily: t.mono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  color: t.paper,
                }}
              >
                ME
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
                      color: t.ink70,
                    }}
                  >
                    {ENTRY_TYPE_LABEL[entry.entry_type] ?? entry.entry_type.toUpperCase()}
                  </span>
                  <span style={{ fontFamily: t.mono, fontSize: 9, color: t.ink30 }}>
                    {entry.entry_date}
                    {entry.created_at ? ` · ${formatTimestamp(entry.created_at)}` : ''}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: t.ink,
                    whiteSpace: 'pre-wrap',
                    padding: '14px 16px',
                    border: `1px solid ${t.line}`,
                    background: t.paperWarm,
                  }}
                >
                  {entry.content}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Composer */}
        <div
          style={{
            borderTop: `1px solid ${t.line}`,
            padding: '14px 28px 18px',
            background: t.paper,
          }}
        >
          {error && (
            <div
              style={{
                marginBottom: 8,
                padding: '6px 10px',
                background: `${t.accent}14`,
                border: `1px solid ${t.accent}`,
                fontFamily: t.mono,
                fontSize: 10,
                color: t.accent,
              }}
            >
              {error}
            </div>
          )}
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
              placeholder={`今思っていること、宣言、振り返りを書く...　/  モード: ${mode}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  handleSend()
                }
              }}
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
                  ⌘⏎ SEND
                </span>
                <button
                  onClick={handleSend}
                  disabled={sending || !draft.trim()}
                  style={{
                    padding: '8px 16px',
                    background: t.ink,
                    color: t.paper,
                    border: `1px solid ${t.line}`,
                    fontFamily: t.mono,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.16em',
                    cursor: sending ? 'wait' : 'pointer',
                    opacity: sending || !draft.trim() ? 0.5 : 1,
                  }}
                >
                  {sending ? 'SENDING…' : 'SEND →'}
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
            Flow に書いた独白から AI が抽出した候補。SEND 後 5〜15 秒で反映されます。
          </div>
        </div>

        <div>
          <div style={{ marginBottom: 8 }}>
            <MonoLabel theme={t}>NEW TASKS · {taskSuggestions.length}</MonoLabel>
          </div>
          {taskSuggestions.length === 0 && (
            <div
              style={{
                fontFamily: t.mono,
                fontSize: 10,
                color: t.ink30,
                padding: '6px 0',
              }}
            >
              候補はありません
            </div>
          )}
          {taskSuggestions.map((tk) => (
            <div
              key={tk.id}
              style={{
                padding: '10px 12px',
                border: `1px solid ${t.ink12}`,
                background: t.paper,
                marginBottom: 6,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 500 }}>{tk.label}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span
                  style={{
                    fontFamily: t.mono,
                    fontSize: 9,
                    color: t.ink50,
                    letterSpacing: '0.14em',
                  }}
                >
                  {(tk.source ?? 'manual').toUpperCase()}
                </span>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    onClick={() => rejectSuggestion(tk.id)}
                    style={{
                      fontFamily: t.mono,
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: '0.14em',
                      color: t.ink50,
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    ✕ DISMISS
                  </button>
                  <button
                    onClick={() => adoptSuggestion(tk.id)}
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
            </div>
          ))}
        </div>

        <div>
          <div style={{ marginBottom: 8 }}>
            <MonoLabel theme={t}>HABIT SUGGESTIONS · {habitSuggestions.length}</MonoLabel>
          </div>
          {habitSuggestions.length === 0 && (
            <div
              style={{
                fontFamily: t.mono,
                fontSize: 10,
                color: t.ink30,
                padding: '6px 0',
              }}
            >
              候補はありません
            </div>
          )}
          {habitSuggestions.map((s) => (
            <div
              key={s.id}
              style={{
                padding: '10px 12px',
                border: `1px solid ${t.accent}`,
                background: t.paper,
                marginBottom: 6,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600 }}>{s.label}</div>
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
                  ● {(s.source ?? 'journal').toUpperCase()}
                </span>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    onClick={() => rejectSuggestion(s.id)}
                    style={{
                      fontFamily: t.mono,
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: '0.14em',
                      color: t.ink50,
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    ✕ DISMISS
                  </button>
                  <button
                    onClick={() => adoptSuggestion(s.id)}
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
          ))}
        </div>

        <div style={{ marginTop: 'auto', borderTop: `1px solid ${t.ink12}`, paddingTop: 12 }}>
          <button
            onClick={loadAll}
            style={{
              width: '100%',
              padding: '8px 10px',
              fontFamily: t.mono,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.18em',
              background: 'transparent',
              color: t.ink70,
              border: `1px solid ${t.ink12}`,
              cursor: 'pointer',
            }}
          >
            ↻ REFRESH
          </button>
        </div>
      </div>
    </div>
  )
}
