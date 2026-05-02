import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Theme } from '@/lib/theme'
import { APP } from '@/lib/mockData'
import { MonoLabel } from '@/components/today/MonoLabel'
import {
  fetchHabits,
  fetchPrimaryTarget,
  updateHabitLog,
  upsertPrimaryTarget,
} from '@/lib/api'
import { useRemoteData } from '@/lib/useRemoteData'
import type { BackendHabit, PrimaryTargetResponse } from '@/types/api'

interface Props {
  theme: Theme
}

const todayDateStr = () => new Date().toISOString().slice(0, 10)

export default function TodayPage({ theme: t }: Props) {
  const navigate = useNavigate()
  const a = APP
  const hour = t.hour

  // ── Primary target (LIVE) ──
  const remotePT = useRemoteData(fetchPrimaryTarget, [])
  const [editing, setEditing] = useState(false)
  const [draftPT, setDraftPT] = useState('')
  const [savedPT, setSavedPT] = useState<PrimaryTargetResponse | null>(null)
  const [savingPT, setSavingPT] = useState(false)

  useEffect(() => {
    if (remotePT.data) setSavedPT(remotePT.data)
  }, [remotePT.data])

  const ptValue = savedPT?.value ?? remotePT.data?.value ?? a.primaryTarget.value
  // After a successful PUT we have savedPT even if the initial GET failed.
  const isMockPT = !savedPT && !remotePT.data && !remotePT.loading
  const ptAnchor = a.primaryTarget.anchor
  const ptMinutes = a.primaryTarget.minutes

  const beginEditPT = () => {
    setDraftPT(ptValue)
    setEditing(true)
  }
  const savePT = async () => {
    const value = draftPT.trim()
    if (!value || value === ptValue) {
      setEditing(false)
      return
    }
    setSavingPT(true)
    try {
      const updated = await upsertPrimaryTarget({ value, set_date: todayDateStr() })
      setSavedPT(updated)
    } catch (err) {
      console.error('[primary-target] save failed', err)
    } finally {
      setSavingPT(false)
      setEditing(false)
    }
  }

  // ── Habits (LIVE) ──
  const remoteHabits = useRemoteData(fetchHabits, [])
  const liveHabits = remoteHabits.data?.data ?? null
  const isMockHabits = !liveHabits && !remoteHabits.loading

  // Local view of today's completion to support optimistic updates.
  const [completedById, setCompletedById] = useState<Record<string, boolean>>({})
  useEffect(() => {
    if (!liveHabits) return
    const initial: Record<string, boolean> = {}
    for (const h of liveHabits) {
      const today = (h as BackendHabit & { today_log?: { completed: boolean } | null }).today_log
      initial[h.id] = today?.completed ?? false
    }
    setCompletedById(initial)
  }, [liveHabits])

  const toggleHabit = async (habit: BackendHabit) => {
    const next = !completedById[habit.id]
    setCompletedById((prev) => ({ ...prev, [habit.id]: next }))
    try {
      await updateHabitLog(habit.id, {
        date: todayDateStr(),
        completed: next,
        input_method: 'manual',
      })
    } catch (err) {
      // revert
      console.error('[habit-log] toggle failed', err)
      setCompletedById((prev) => ({ ...prev, [habit.id]: !next }))
    }
  }

  // Display data: prefer live, otherwise mock.
  const todayHabitsView = useMemo(() => {
    if (liveHabits) {
      return liveHabits.map((h) => ({
        id: h.id,
        label: h.title,
        completed: completedById[h.id] ?? false,
      }))
    }
    return a.habits.slice(0, 6).map((h) => ({
      id: h.id,
      label: h.label,
      completed: h.today.done,
    }))
  }, [liveHabits, completedById, a.habits])

  const monthlyView = useMemo(() => {
    if (liveHabits) {
      // For a LIVE preview without per-day aggregation yet, fall back to streak/0 placeholders.
      return liveHabits.slice(0, 5).map((h) => ({
        id: h.id,
        label: h.title,
        month: h.current_streak,
        target: 31,
        best: h.longest_streak,
      }))
    }
    return a.habits.slice(0, 5).map((h) => ({
      id: h.id,
      label: h.label,
      month: h.month,
      target: h.target,
      best: h.best,
    }))
  }, [liveHabits, a.habits])

  const doneToday = todayHabitsView.filter((h) => h.completed).length
  const totalToday = todayHabitsView.length

  const ctaLine =
    t.phase === 'dawn' || t.phase === 'morning'
      ? '朝の固定枠で英語と提案書を進めましょう。'
      : t.phase === 'evening' || t.phase === 'night'
        ? '今日の gap を書き残し、明日を組みます。'
        : 'primary target を進める時間です。'

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'grid',
        gridTemplateColumns: '1.3fr 1fr 0.95fr',
        gridTemplateRows: 'auto 1fr',
        minHeight: 0,
      }}
    >
      {/* CELL 1 — Primary target HERO + tasks */}
      <div
        style={{
          gridRow: '1 / 3',
          padding: '24px 22px',
          borderRight: `1px solid ${t.ink12}`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 12,
          }}
        >
          <MonoLabel theme={t}>PRIMARY TARGET · THE ONE THING</MonoLabel>
          <span
            style={{
              fontFamily: t.mono,
              fontSize: 10,
              color: t.accent,
              letterSpacing: '0.16em',
            }}
          >
            ● {savingPT ? 'SAVING…' : isMockPT ? 'MOCK' : 'LIVE'}
          </span>
        </div>

        {editing ? (
          <textarea
            autoFocus
            value={draftPT}
            onChange={(e) => setDraftPT(e.target.value)}
            onBlur={savePT}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                savePT()
              }
              if (e.key === 'Escape') setEditing(false)
            }}
            style={{
              fontSize: 34,
              fontWeight: 600,
              letterSpacing: '-0.025em',
              lineHeight: 1.1,
              fontFamily: t.sans,
              color: t.ink,
              border: `1px solid ${t.accent}`,
              outline: 'none',
              resize: 'none',
              padding: '6px 8px',
              background: t.paper,
              minHeight: 72,
              width: '100%',
            }}
          />
        ) : (
          <button
            onClick={beginEditPT}
            title="クリックして編集"
            style={{
              textAlign: 'left',
              fontSize: 34,
              fontWeight: 600,
              letterSpacing: '-0.025em',
              lineHeight: 1.1,
              color: t.ink,
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'text',
            }}
          >
            {ptValue}
          </button>
        )}
        <div
          style={{
            fontFamily: t.mono,
            fontSize: 11,
            color: t.ink50,
            marginTop: 12,
            letterSpacing: '0.04em',
          }}
        >
          ANCHOR → {ptAnchor} · {ptMinutes}M
        </div>

        {/* Time budget gauge */}
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <MonoLabel theme={t}>Time budget · 09:00–11:00</MonoLabel>
            <span style={{ fontFamily: t.mono, fontSize: 11, color: t.ink70 }}>
              0 / {ptMinutes}m
            </span>
          </div>
          <div style={{ height: 28, border: `1px solid ${t.line}`, position: 'relative', display: 'flex' }}>
            {Array.from({ length: 24 }).map((_, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  borderRight: i === 23 ? 'none' : `1px solid ${t.ink06}`,
                  background: i >= 9 && i < 11 ? `${t.accent}20` : 'transparent',
                }}
              />
            ))}
            <div
              style={{
                position: 'absolute',
                left: `${(hour / 24) * 100}%`,
                top: -3,
                bottom: -3,
                width: 2,
                background: t.accent,
              }}
            />
          </div>
        </div>

        {/* Today's tasks (mock until task-edit lands) */}
        <div style={{ marginTop: 24, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <MonoLabel theme={t}>TODAY'S TASKS · {a.tasks.length}</MonoLabel>
            <span
              style={{
                fontFamily: t.mono,
                fontSize: 9,
                color: t.ink30,
                letterSpacing: '0.14em',
              }}
            >
              EST {a.tasks.reduce((s, x) => s + x.est, 0)}M
            </span>
          </div>
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
            {a.tasks.map((task, i) => (
              <div
                key={task.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '20px 1fr auto auto',
                  alignItems: 'center',
                  gap: 12,
                  padding: '11px 0',
                  borderTop: i === 0 ? `1px solid ${t.line}` : `1px solid ${t.ink06}`,
                  borderBottom: i === a.tasks.length - 1 ? `1px solid ${t.line}` : 'none',
                }}
              >
                <div
                  style={{
                    width: 14,
                    height: 14,
                    border: `1.5px solid ${t.line}`,
                    background: task.done ? t.line : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {task.done && <span style={{ color: t.paper, fontSize: 10, fontWeight: 900 }}>✓</span>}
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: task.done ? t.ink30 : t.ink }}>
                  {task.label}
                </div>
                <div style={{ fontFamily: t.mono, fontSize: 10, color: t.ink30, letterSpacing: '0.1em' }}>
                  {task.est}M
                </div>
                <div
                  style={{
                    fontFamily: t.mono,
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: '0.14em',
                    color: t.ink50,
                    padding: '2px 8px',
                    border: `1px solid ${t.ink12}`,
                  }}
                >
                  OPEN
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CELL 2 — Gap snapshot */}
      <div
        style={{
          gridRow: '1 / 2',
          padding: '24px 22px',
          borderRight: `1px solid ${t.ink12}`,
          borderBottom: `1px solid ${t.ink12}`,
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <MonoLabel theme={t}>GAP SNAPSHOT · 24H</MonoLabel>
        </div>
        <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.3 }}>
          英語ブロックが <span style={{ color: t.accent }}>3 日連続</span> で未着手。
          <br />
          GW中に固定枠を確保したいところです。
        </div>
        <div
          style={{
            marginTop: 16,
            padding: '12px 14px',
            background: t.paperWarm,
            borderLeft: `2px solid ${t.accent}`,
            fontSize: 12,
            lineHeight: 1.5,
            color: t.ink70,
          }}
        >
          「テレビボード取り付けが残タスク。GWの計画は手書きで整理を」
          <div
            style={{
              fontFamily: t.mono,
              fontSize: 9,
              color: t.ink50,
              marginTop: 6,
              letterSpacing: '0.12em',
            }}
          >
            ← YESTERDAY · 5/1 EVENING NOTE
          </div>
        </div>
      </div>

      {/* CELL 4 — Active window CTA + Today habits */}
      <div
        style={{
          gridColumn: '2 / 3',
          padding: '20px 22px',
          background: t.paperWarm,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          borderRight: `1px solid ${t.ink12}`,
          minHeight: 0,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <MonoLabel theme={t}>ACTIVE WINDOW · {t.cta.toUpperCase()}</MonoLabel>
          <span
            style={{
              fontFamily: t.mono,
              fontSize: 9,
              color: t.accent,
              letterSpacing: '0.16em',
            }}
          >
            ● {isMockHabits ? 'MOCK' : 'LIVE'}
          </span>
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.25 }}>
          {t.greeting}。<br />
          {ctaLine}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3,1fr)',
            gap: 1,
            background: t.line,
            border: `1px solid ${t.line}`,
          }}
        >
          {[
            { k: 'DONE', v: doneToday, sub: 'habits' },
            { k: 'OPEN', v: Math.max(0, totalToday - doneToday), sub: 'habits' },
            { k: 'STREAK', v: a.user.streak, sub: 'days' },
          ].map((s) => (
            <div key={s.k} style={{ background: t.paper, padding: '10px 12px' }}>
              <div style={{ fontFamily: t.mono, fontSize: 9, color: t.ink50, letterSpacing: '0.16em' }}>
                {s.k}
              </div>
              <div style={{ fontFamily: t.mono, fontSize: 24, fontWeight: 300, marginTop: 2, letterSpacing: '-0.02em' }}>
                {s.v}
              </div>
              <div style={{ fontFamily: t.mono, fontSize: 9, color: t.ink30, letterSpacing: '0.14em' }}>
                {s.sub}
              </div>
            </div>
          ))}
        </div>

        {/* Today habits checkboxes */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            minHeight: 0,
            overflow: 'auto',
            paddingTop: 4,
          }}
        >
          <div style={{ marginBottom: 4 }}>
            <MonoLabel theme={t}>TODAY · TAP TO TOGGLE</MonoLabel>
          </div>
          {todayHabitsView.length === 0 && (
            <div style={{ fontFamily: t.mono, fontSize: 10, color: t.ink30, padding: '8px 0' }}>
              habits がまだありません
            </div>
          )}
          {todayHabitsView.map((h) => {
            const done = h.completed
            return (
              <button
                key={h.id}
                onClick={() => {
                  if (!liveHabits) return // mock: read-only
                  const real = liveHabits.find((x) => x.id === h.id)
                  if (real) toggleHabit(real)
                }}
                disabled={!liveHabits}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '20px 1fr',
                  alignItems: 'center',
                  gap: 10,
                  padding: '7px 8px',
                  background: done ? t.paperWarm : 'transparent',
                  border: `1px solid ${done ? t.ink12 : 'transparent'}`,
                  cursor: liveHabits ? 'pointer' : 'default',
                  textAlign: 'left',
                  fontFamily: t.sans,
                }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    border: `1.5px solid ${t.line}`,
                    background: done ? t.line : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: t.paper,
                    fontSize: 10,
                    fontWeight: 900,
                  }}
                >
                  {done ? '✓' : ''}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    color: done ? t.ink50 : t.ink,
                    textDecoration: done ? 'line-through' : 'none',
                  }}
                >
                  {h.label}
                </span>
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
          <button
            onClick={() => navigate('/flow')}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: `1px solid ${t.line}`,
              background: t.ink,
              color: t.paper,
              fontFamily: t.mono,
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: '0.18em',
              cursor: 'pointer',
            }}
          >
            OPEN FLOW →
          </button>
          <button
            style={{
              padding: '12px 14px',
              border: `1px solid ${t.line}`,
              background: t.paper,
              color: t.ink,
              fontFamily: t.mono,
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: '0.18em',
              cursor: 'pointer',
            }}
          >
            ⌘K
          </button>
        </div>
      </div>

      {/* CELL 3 — Monthly + Coach */}
      <div
        style={{
          gridRow: '1 / 3',
          padding: '24px 22px',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          overflow: 'auto',
        }}
      >
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <MonoLabel theme={t}>MONTHLY · {String(a.date.m).padStart(2, '0')}</MonoLabel>
            <span style={{ fontFamily: t.mono, fontSize: 9, color: t.ink30 }}>
              D{a.date.d} / 31
            </span>
          </div>
          <div style={{ fontSize: 12, color: t.ink70, marginTop: 6 }}>
            {liveHabits ? `登録 ${liveHabits.length} 件・ストリーク基準` : '英語だけ遅れ。その他は想定線上。'}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {monthlyView.map((h) => {
            const pct = h.target > 0 ? h.month / h.target : 0
            const lag = pct < 0.4
            return (
              <div key={h.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{h.label}</span>
                  <span style={{ fontFamily: t.mono, fontSize: 10, color: t.ink70 }}>
                    {h.month}
                    <span style={{ color: t.ink30 }}> / {h.target}</span>
                  </span>
                </div>
                <div
                  style={{
                    position: 'relative',
                    height: 10,
                    border: `1px solid ${t.ink12}`,
                    background: t.paperWarm,
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${Math.min(pct, 1) * 100}%`,
                      background: lag ? t.accent : t.ink,
                    }}
                  />
                  {h.best > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        left: `${Math.min(h.best / Math.max(h.target, 1), 1) * 100}%`,
                        top: -2,
                        bottom: -2,
                        width: 1,
                        background: t.ink,
                      }}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ marginTop: 'auto', borderTop: `1px solid ${t.line}`, paddingTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <MonoLabel theme={t}>COACH · LIVE</MonoLabel>
            <span
              style={{
                fontFamily: t.mono,
                fontSize: 9,
                color: t.accent,
                letterSpacing: '0.14em',
              }}
            >
              ● 5 INSIGHTS
            </span>
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.55, color: t.ink70 }}>
            朝の core 5 のうち英語だけ未着手。午前中に45分ブロックを置けば今日の primary target と両立できます。
          </div>
        </div>
      </div>
    </div>
  )
}
