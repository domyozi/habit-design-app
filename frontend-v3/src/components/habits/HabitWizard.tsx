import { useState } from 'react'
import type { Theme } from '@/lib/theme'
import { TEMPLATES, SOURCE_META, type HabitTemplate } from '@/lib/habitTemplates'
import type { HabitSource } from '@/lib/mockData'
import { MonoLabel } from '@/components/today/MonoLabel'
import { createHabit } from '@/lib/api'

interface Props {
  theme: Theme
  open: boolean
  onClose: () => void
  onCreated?: () => void
}

type Step = 1 | 2 | 3

export function HabitWizard({ theme: t, open, onClose, onCreated }: Props) {
  const [step, setStep] = useState<Step>(1)
  const [template, setTemplate] = useState<HabitTemplate | null>(null)
  const [habitName, setHabitName] = useState('')
  const [goalValue, setGoalValue] = useState<string>('')
  const [source, setSource] = useState<HabitSource>('manual')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const reset = () => {
    setStep(1)
    setTemplate(null)
    setHabitName('')
    setGoalValue('')
    setSource('manual')
    setError(null)
    setCreating(false)
  }
  const handleClose = () => {
    reset()
    onClose()
  }
  const handleSelectTemplate = (tpl: HabitTemplate) => {
    setTemplate(tpl)
    setHabitName(tpl.exampleHabits[0] ?? '')
    setGoalValue(String(tpl.defaultGoal ?? ''))
    setSource(tpl.defaultSource)
    setStep(2)
  }
  const handleCreate = async () => {
    if (!template) return
    setError(null)
    setCreating(true)
    try {
      const isTime = template.metricType === 'time_before' || template.metricType === 'time_after'
      const numeric = goalValue.trim() === '' ? undefined : Number(goalValue)
      await createHabit({
        title: habitName.trim(),
        metric_type: template.metricType,
        target_value: !isTime && numeric !== undefined && !Number.isNaN(numeric) ? numeric : undefined,
        target_time: isTime ? goalValue : undefined,
        unit: template.unit,
        proof_type: template.defaultProof,
        source_kind: source,
      })
      onCreated?.()
      handleClose()
    } catch (err) {
      console.error('[wizard] create failed', err)
      setError(err instanceof Error ? err.message : '作成に失敗しました')
      setCreating(false)
    }
  }

  const validSources: HabitSource[] = template
    ? template.id === 'distance'
      ? ['nike-run', 'strava', 'manual']
      : template.id === 'time-target'
        ? ['apple-watch', 'manual']
        : template.id === 'weight'
          ? ['health-app', 'manual']
          : template.id === 'count' || template.id === 'pages' || template.id === 'score'
            ? ['photo', 'manual']
            : ['manual']
    : ['manual']

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(11,12,11,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 720,
          maxWidth: '92vw',
          maxHeight: '88vh',
          background: t.paper,
          color: t.ink,
          fontFamily: t.sans,
          border: `1px solid ${t.line}`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '18px 22px',
            borderBottom: `1px solid ${t.ink12}`,
          }}
        >
          <div>
            <MonoLabel theme={t}>NEW HABIT · STEP {step} / 3</MonoLabel>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>
              {step === 1 ? '計測タイプを選ぶ' : step === 2 ? '目標を設定する' : '記録ソースを選ぶ'}
            </div>
          </div>
          <button
            onClick={handleClose}
            style={{
              fontFamily: t.mono,
              fontSize: 11,
              fontWeight: 700,
              color: t.ink70,
              background: 'transparent',
              border: `1px solid ${t.ink12}`,
              padding: '6px 10px',
              cursor: 'pointer',
              letterSpacing: '0.14em',
            }}
          >
            CLOSE ✕
          </button>
        </div>

        {/* Step body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 22px' }}>
          {step === 1 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 8,
              }}
            >
              {TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => handleSelectTemplate(tpl)}
                  style={{
                    textAlign: 'left',
                    padding: '14px 14px',
                    border: `1px solid ${t.ink12}`,
                    background: t.paper,
                    cursor: 'pointer',
                    display: 'grid',
                    gridTemplateColumns: '32px 1fr',
                    gap: 12,
                    alignItems: 'flex-start',
                  }}
                >
                  <span style={{ fontFamily: t.mono, fontSize: 22 }}>{tpl.glyph}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{tpl.label}</div>
                    <div style={{ fontSize: 11, color: t.ink70, marginTop: 4 }}>
                      {tpl.description}
                    </div>
                    <div
                      style={{
                        fontFamily: t.mono,
                        fontSize: 9,
                        color: t.ink50,
                        marginTop: 6,
                        letterSpacing: '0.1em',
                      }}
                    >
                      例: {tpl.exampleHabits.slice(0, 3).join(' · ')}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {step === 2 && template && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{
                  padding: '12px 14px',
                  background: t.paperWarm,
                  borderLeft: `2px solid ${t.accent}`,
                  fontSize: 12,
                  color: t.ink70,
                }}
              >
                {template.glyph} {template.label} · {template.description}
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <MonoLabel theme={t}>HABIT 名</MonoLabel>
                <input
                  value={habitName}
                  onChange={(e) => setHabitName(e.target.value)}
                  placeholder={template.exampleHabits[0]}
                  style={{
                    padding: '10px 12px',
                    border: `1px solid ${t.line}`,
                    fontFamily: t.sans,
                    fontSize: 14,
                    background: t.paper,
                    color: t.ink,
                    outline: 'none',
                  }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <MonoLabel theme={t}>
                  目標 {template.goalKind === 'gte' ? '(≥)' : template.goalKind === 'lte' ? '(≤)' : template.goalKind === 'before' ? '(より早く)' : '(やる)'}
                </MonoLabel>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    value={goalValue}
                    onChange={(e) => setGoalValue(e.target.value)}
                    placeholder={String(template.defaultGoal ?? '')}
                    disabled={template.goalKind === 'done'}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      border: `1px solid ${t.line}`,
                      fontFamily: t.mono,
                      fontSize: 14,
                      background: template.goalKind === 'done' ? t.paperWarm : t.paper,
                      color: t.ink,
                      outline: 'none',
                    }}
                  />
                  {template.unit && (
                    <span
                      style={{
                        fontFamily: t.mono,
                        fontSize: 12,
                        color: t.ink70,
                      }}
                    >
                      {template.unit}
                    </span>
                  )}
                </div>
              </label>
            </div>
          )}

          {step === 3 && template && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: t.ink70, marginBottom: 4 }}>
                記録方法を選んでください。<strong>自動取込</strong> なら手間ゼロで状態が更新されます。
              </div>
              {validSources.map((sid) => {
                const sm = SOURCE_META[sid]
                const active = source === sid
                return (
                  <button
                    key={sid}
                    onClick={() => setSource(sid)}
                    style={{
                      textAlign: 'left',
                      padding: '12px 14px',
                      border: `1px solid ${active ? t.accent : t.ink12}`,
                      background: active ? `${t.accent}10` : t.paper,
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {sm.glyph} {sm.label}
                      </div>
                      <div
                        style={{
                          fontFamily: t.mono,
                          fontSize: 9,
                          color: t.ink50,
                          letterSpacing: '0.12em',
                          marginTop: 4,
                        }}
                      >
                        {sm.description}
                      </div>
                    </div>
                    {sm.auto && (
                      <span
                        style={{
                          fontFamily: t.mono,
                          fontSize: 9,
                          fontWeight: 700,
                          background: t.ink,
                          color: t.paper,
                          padding: '3px 6px',
                          letterSpacing: '0.14em',
                        }}
                      >
                        AUTO
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 22px',
            borderTop: `1px solid ${t.ink12}`,
            background: t.paperWarm,
          }}
        >
          <button
            onClick={() => (step > 1 ? setStep((step - 1) as Step) : handleClose())}
            style={{
              padding: '8px 14px',
              fontFamily: t.mono,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              background: 'transparent',
              color: t.ink70,
              border: `1px solid ${t.ink12}`,
              cursor: 'pointer',
            }}
          >
            ← {step === 1 ? 'CLOSE' : 'BACK'}
          </button>
          {step < 3 ? (
            <button
              onClick={() => setStep((step + 1) as Step)}
              disabled={step === 2 && !habitName.trim()}
              style={{
                padding: '8px 18px',
                fontFamily: t.mono,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.14em',
                background: t.ink,
                color: t.paper,
                border: `1px solid ${t.line}`,
                cursor: step === 2 && !habitName.trim() ? 'not-allowed' : 'pointer',
                opacity: step === 2 && !habitName.trim() ? 0.5 : 1,
              }}
            >
              NEXT →
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {error && (
                <span
                  style={{
                    fontFamily: t.mono,
                    fontSize: 10,
                    color: t.accent,
                    letterSpacing: '0.1em',
                    maxWidth: 300,
                  }}
                >
                  {error}
                </span>
              )}
              <button
                onClick={handleCreate}
                disabled={creating}
                style={{
                  padding: '8px 18px',
                  fontFamily: t.mono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  background: t.accent,
                  color: t.paper,
                  border: `1px solid ${t.accent}`,
                  cursor: creating ? 'wait' : 'pointer',
                  opacity: creating ? 0.6 : 1,
                }}
              >
                {creating ? 'CREATING…' : 'CREATE HABIT'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
