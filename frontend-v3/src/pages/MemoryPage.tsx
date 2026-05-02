import { useEffect, useState } from 'react'
import type { Theme } from '@/lib/theme'
import { APP } from '@/lib/mockData'
import { MonoLabel } from '@/components/today/MonoLabel'
import { fetchUserContext, patchUserContext } from '@/lib/api'
import { useRemoteData } from '@/lib/useRemoteData'
import type { UserContextResponse } from '@/types/api'

interface Props {
  theme: Theme
}

const MOOD_COLOR: Record<string, string> = {
  focused: '#c45c2a',
  warm: '#b86a2e',
  steady: '#3a6d8a',
  tense: '#a34a2e',
  reflective: '#7a3d6e',
}

interface EditableTextProps {
  theme: Theme
  value: string
  multiline?: boolean
  size?: 'lg' | 'md'
  color?: string
  onSave: (next: string) => Promise<void>
}

function EditableText({ theme: t, value, multiline, size = 'lg', color, onSave }: EditableTextProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(value)
  }, [value])

  const fontSize = size === 'lg' ? 18 : 13
  const fontWeight = size === 'lg' ? 600 : 400
  const lineHeight = size === 'lg' ? 1.4 : 1.55

  if (editing) {
    const Tag = multiline ? 'textarea' : 'input'
    return (
      <Tag
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={async () => {
          if (draft === value) {
            setEditing(false)
            return
          }
          setSaving(true)
          try {
            await onSave(draft)
          } finally {
            setSaving(false)
            setEditing(false)
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !multiline && !e.shiftKey) {
            e.preventDefault()
            ;(e.target as HTMLElement).blur()
          }
          if (e.key === 'Escape') {
            setDraft(value)
            setEditing(false)
          }
        }}
        rows={multiline ? 3 : undefined}
        style={{
          fontFamily: t.sans,
          fontSize,
          fontWeight,
          lineHeight,
          color: color ?? t.ink,
          width: '100%',
          padding: '6px 8px',
          border: `1px solid ${t.accent}`,
          background: t.paper,
          outline: 'none',
          resize: 'none',
        }}
      />
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      title="クリックして編集"
      style={{
        textAlign: 'left',
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'text',
        fontFamily: t.sans,
        fontSize,
        fontWeight,
        lineHeight,
        color: color ?? t.ink,
        width: '100%',
        opacity: saving ? 0.5 : 1,
      }}
    >
      {value || '（空。クリックして追加）'}
    </button>
  )
}

interface EditableListProps {
  theme: Theme
  items: string[]
  numbered?: boolean
  onSave: (next: string[]) => Promise<void>
  placeholder: string
}

function EditableList({ theme: t, items, numbered, onSave, placeholder }: EditableListProps) {
  const [draft, setDraft] = useState(items)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [newItem, setNewItem] = useState('')

  useEffect(() => {
    setDraft(items)
  }, [items])

  const commit = async (next: string[]) => {
    setDraft(next)
    await onSave(next).catch((e) => {
      console.error('[memory list] save failed', e)
      setDraft(items)
    })
  }

  const updateAt = async (i: number, value: string) => {
    const next = [...draft]
    if (!value.trim()) {
      next.splice(i, 1)
    } else {
      next[i] = value.trim()
    }
    setEditingIdx(null)
    await commit(next)
  }

  const removeAt = async (i: number) => {
    const next = draft.filter((_, j) => j !== i)
    await commit(next)
  }

  const addNew = async () => {
    const value = newItem.trim()
    setAdding(false)
    setNewItem('')
    if (!value) return
    await commit([...draft, value])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
      {draft.map((p, i) => (
        <div
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: numbered ? '24px 1fr 22px' : '1fr 22px',
            gap: 10,
            alignItems: 'center',
            padding: '8px 0',
            borderTop: `1px solid ${t.ink06}`,
          }}
        >
          {numbered && (
            <span
              style={{
                fontFamily: t.mono,
                fontSize: 10,
                color: t.ink30,
                fontWeight: 700,
              }}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
          )}
          {editingIdx === i ? (
            <input
              autoFocus
              defaultValue={p}
              onBlur={(e) => updateAt(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') setEditingIdx(null)
              }}
              style={{
                fontFamily: t.sans,
                fontSize: 13,
                color: t.ink,
                padding: '4px 8px',
                border: `1px solid ${t.accent}`,
                background: t.paper,
                outline: 'none',
                width: '100%',
              }}
            />
          ) : (
            <button
              onClick={() => setEditingIdx(i)}
              style={{
                fontSize: 13,
                color: t.ink70,
                lineHeight: 1.55,
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'text',
                textAlign: 'left',
              }}
            >
              {p}
            </button>
          )}
          <button
            onClick={() => removeAt(i)}
            title="削除"
            style={{
              width: 20,
              height: 20,
              background: 'transparent',
              border: `1px solid ${t.ink12}`,
              color: t.ink50,
              fontFamily: t.mono,
              fontSize: 10,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            ✕
          </button>
        </div>
      ))}
      {adding ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: numbered ? '24px 1fr 22px' : '1fr 22px',
            gap: 10,
            alignItems: 'center',
            padding: '8px 0',
            borderTop: `1px solid ${t.ink06}`,
          }}
        >
          {numbered && (
            <span style={{ fontFamily: t.mono, fontSize: 10, color: t.accent, fontWeight: 700 }}>
              {String(draft.length + 1).padStart(2, '0')}
            </span>
          )}
          <input
            autoFocus
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onBlur={addNew}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') {
                setAdding(false)
                setNewItem('')
              }
            }}
            placeholder={placeholder}
            style={{
              fontFamily: t.sans,
              fontSize: 13,
              color: t.ink,
              padding: '4px 8px',
              border: `1px solid ${t.accent}`,
              background: t.paper,
              outline: 'none',
              width: '100%',
            }}
          />
          <div />
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          style={{
            alignSelf: 'flex-start',
            marginTop: 4,
            padding: '4px 10px',
            fontFamily: t.mono,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.16em',
            background: 'transparent',
            color: t.accent,
            border: `1px solid ${t.ink12}`,
            cursor: 'pointer',
          }}
        >
          + ADD
        </button>
      )}
    </div>
  )
}

interface KeywordsEditorProps {
  theme: Theme
  items: string[]
  onSave: (next: string[]) => Promise<void>
}

function KeywordsEditor({ theme: t, items, onSave }: KeywordsEditorProps) {
  const [draft, setDraft] = useState(items)
  const [adding, setAdding] = useState(false)
  const [newItem, setNewItem] = useState('')

  useEffect(() => setDraft(items), [items])

  const commit = async (next: string[]) => {
    setDraft(next)
    await onSave(next).catch(() => setDraft(items))
  }

  const removeAt = (i: number) => commit(draft.filter((_, j) => j !== i))
  const addNew = () => {
    const value = newItem.trim()
    setAdding(false)
    setNewItem('')
    if (value) commit([...draft, value])
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
      {draft.map((k, i) => (
        <span
          key={`${k}-${i}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 10px',
            fontFamily: t.mono,
            fontSize: 11,
            letterSpacing: '0.04em',
            border: `1px solid ${t.line}`,
            background: t.paperWarm,
            color: t.ink70,
          }}
        >
          {k}
          <button
            onClick={() => removeAt(i)}
            title="削除"
            style={{
              background: 'transparent',
              border: 'none',
              color: t.ink30,
              fontFamily: t.mono,
              fontSize: 11,
              cursor: 'pointer',
              padding: 0,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </span>
      ))}
      {adding ? (
        <input
          autoFocus
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onBlur={addNew}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') {
              setAdding(false)
              setNewItem('')
            }
          }}
          placeholder="新しいキーワード"
          style={{
            fontFamily: t.mono,
            fontSize: 11,
            color: t.ink,
            padding: '5px 10px',
            border: `1px solid ${t.accent}`,
            background: t.paper,
            outline: 'none',
            minWidth: 140,
          }}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          style={{
            padding: '5px 10px',
            fontFamily: t.mono,
            fontSize: 11,
            color: t.accent,
            background: 'transparent',
            border: `1px dashed ${t.ink12}`,
            cursor: 'pointer',
            letterSpacing: '0.06em',
          }}
        >
          + ADD
        </button>
      )}
    </div>
  )
}

export default function MemoryPage({ theme: t }: Props) {
  const a = APP
  const remoteCtx = useRemoteData(fetchUserContext, [])
  const [ctx, setCtx] = useState<UserContextResponse | null>(null)

  useEffect(() => {
    if (remoteCtx.data) setCtx(remoteCtx.data)
  }, [remoteCtx.data])

  const isLive = !!ctx
  const isMock = !isLive && !remoteCtx.loading

  const identity = ctx?.identity ?? a.memory.identity
  const goal = ctx?.goal_summary ?? a.memory.goal
  const patterns = ctx?.patterns?.length ? ctx.patterns : a.memory.patterns
  const keywords = ctx?.values_keywords?.length ? ctx.values_keywords : a.memory.keywords

  const save = async (patch: Partial<UserContextResponse>) => {
    try {
      const updated = await patchUserContext(patch)
      setCtx(updated)
    } catch (err) {
      console.error('[user-context] patch failed', err)
      throw err
    }
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'grid',
        gridTemplateColumns: '1fr 1.2fr',
        minHeight: 0,
      }}
    >
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
            padding: '20px 24px 14px',
            borderBottom: `1px solid ${t.ink12}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
          }}
        >
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.015em' }}>Memory</div>
            <div
              style={{
                fontFamily: t.mono,
                fontSize: 10,
                color: t.ink50,
                marginTop: 2,
                letterSpacing: '0.14em',
              }}
            >
              あなたについて AI が覚えていること · クリックで編集
            </div>
          </div>
          <span
            style={{
              fontFamily: t.mono,
              fontSize: 10,
              color: t.accent,
              letterSpacing: '0.16em',
            }}
          >
            ● {isMock ? 'MOCK · 編集不可' : 'LIVE'}
          </span>
        </div>
        <div
          style={{
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
            opacity: isMock ? 0.7 : 1,
            pointerEvents: isMock ? 'none' : undefined,
          }}
        >
          <div>
            <MonoLabel theme={t}>IDENTITY</MonoLabel>
            <div style={{ marginTop: 8 }}>
              <EditableText
                theme={t}
                value={identity}
                multiline
                size="lg"
                onSave={(v) => save({ identity: v })}
              />
            </div>
          </div>
          <div>
            <MonoLabel theme={t}>NORTH STAR</MonoLabel>
            <div style={{ marginTop: 8 }}>
              <EditableText
                theme={t}
                value={goal}
                multiline
                size="lg"
                color={t.accent}
                onSave={(v) => save({ goal_summary: v })}
              />
            </div>
          </div>
          <div>
            <MonoLabel theme={t}>OBSERVED PATTERNS</MonoLabel>
            <EditableList
              theme={t}
              items={patterns}
              numbered
              placeholder="新しいパターンを書く"
              onSave={(next) => save({ patterns: next })}
            />
          </div>
          <div>
            <MonoLabel theme={t}>KEYWORDS</MonoLabel>
            <KeywordsEditor
              theme={t}
              items={keywords}
              onSave={(next) => save({ values_keywords: next })}
            />
          </div>
        </div>
      </div>

      {/* RIGHT — Diary feed (mock for now) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
          background: t.paperWarm,
        }}
      >
        <div style={{ padding: '20px 24px 14px', borderBottom: `1px solid ${t.ink12}` }}>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>
            Diary · AI feedback
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
            これまでの対話で AI から受けたフィードバック
          </div>
        </div>
        <div style={{ padding: '14px 24px 24px' }}>
          {a.diary.map((d, i) => {
            const moodColor = MOOD_COLOR[d.mood] ?? t.ink70
            return (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 1fr',
                  gap: 16,
                  padding: '16px 0',
                  borderTop: i === 0 ? 'none' : `1px solid ${t.ink12}`,
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: t.mono,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                    }}
                  >
                    {d.date}
                  </div>
                  <div
                    style={{
                      fontFamily: t.mono,
                      fontSize: 9,
                      color: moodColor,
                      letterSpacing: '0.16em',
                      marginTop: 4,
                      fontWeight: 700,
                    }}
                  >
                    ● {(d.mood || '').toUpperCase()}
                  </div>
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: t.ink }}>{d.summary}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
