import type { Theme } from '@/lib/theme'
import type { Habit } from '@/lib/mockData'
import { SOURCE_META } from '@/lib/habitTemplates'
import { Stat } from './Stat'
import { LineChart } from './LineChart'
import { CumulativeChart } from './CumulativeChart'

interface Props {
  habit: Habit
  theme: Theme
}

function safeNum(s: (number | null)[]): number[] {
  return s.filter((v): v is number => v != null && !Number.isNaN(v) && v !== 0)
}

export function HabitAnalyticsCard({ habit: h, theme: t }: Props) {
  const sm = SOURCE_META[h.source]
  const series = h.series ?? []
  const numeric = safeNum(series)
  const max = numeric.length ? Math.max(...numeric) : 1
  const avg = numeric.length ? numeric.reduce((a, b) => a + b, 0) / numeric.length : 0

  const header = (
    <div
      style={{
        padding: '14px 18px',
        borderBottom: `1px solid ${t.ink12}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
      }}
    >
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.005em' }}>{h.label}</div>
        <div
          style={{
            fontFamily: t.mono,
            fontSize: 9,
            color: t.ink50,
            letterSpacing: '0.14em',
            marginTop: 3,
          }}
        >
          {h.type.toUpperCase()} · {sm?.label ?? 'MANUAL'}
          {sm?.auto ? ' · AUTO' : ''}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span
          style={{
            fontFamily: t.mono,
            fontSize: 9,
            color: h.streak > 0 ? t.accent : t.ink30,
            fontWeight: 700,
            letterSpacing: '0.14em',
          }}
        >
          ● {h.streak}d STRK
        </span>
        <span
          style={{
            fontFamily: t.mono,
            fontSize: 9,
            color: h.lagging ? t.accent : t.ink50,
            fontWeight: 700,
            letterSpacing: '0.14em',
          }}
        >
          {h.month}/{h.target} MO
        </span>
      </div>
    </div>
  )

  let body: React.ReactNode

  if (h.type === 'duration') {
    const targetMin = Number(h.goal.value) || 0
    const monthlyTotal = numeric.reduce((a, b) => a + b, 0)
    const monthlyTarget = targetMin * 22
    body = (
      <div style={{ padding: '14px 18px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <Stat
            theme={t}
            k="今日"
            v={`${h.today.value}m`}
            sub={`目標 ${targetMin}m`}
            on={Number(h.today.value) >= targetMin}
          />
          <Stat theme={t} k="月累計" v={`${monthlyTotal}m`} sub={`目標 ${monthlyTarget}m`} />
          <Stat theme={t} k="平均/日" v={`${Math.round(avg)}m`} sub={`max ${max}m`} />
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 2,
            height: 70,
            padding: '4px 0',
            borderTop: `1px solid ${t.ink06}`,
            borderBottom: `1px solid ${t.ink06}`,
            position: 'relative',
          }}
        >
          {series.map((v, i) => {
            const empty = v == null || v === 0
            const scale = Math.max(max, targetMin * 1.4)
            const hh = empty ? 4 : Math.max(4, ((v as number) / scale) * 65)
            const overTarget = !empty && (v as number) >= targetMin
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 65,
                  display: 'flex',
                  alignItems: 'flex-end',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: hh,
                    background: empty ? t.ink12 : overTarget ? t.ink : t.accent,
                  }}
                />
              </div>
            )
          })}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: (targetMin / Math.max(max, targetMin * 1.4)) * 65 + 4,
              borderTop: `1px dashed ${t.ink30}`,
            }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 4,
            fontFamily: t.mono,
            fontSize: 9,
            color: t.ink50,
            letterSpacing: '0.1em',
          }}
        >
          <span>30日前</span>
          <span>—— 目標 {targetMin}m ——</span>
          <span>今日</span>
        </div>
        {h.breakdown && (
          <div
            style={{
              marginTop: 14,
              padding: '10px 12px',
              background: t.paperWarm,
              borderLeft: `2px solid ${t.accent}`,
            }}
          >
            <div
              style={{
                fontFamily: t.mono,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.16em',
                color: t.accent,
                marginBottom: 8,
              }}
            >
              ● AI ALLOCATION (TOEIC 820 逆算)
            </div>
            <div style={{ display: 'flex', height: 12, border: `1px solid ${t.line}` }}>
              {h.breakdown.map((b, i) => (
                <div
                  key={i}
                  style={{ flex: b.v, background: b.c }}
                  title={`${b.l} ${b.v}m`}
                />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
              {h.breakdown.map((b) => (
                <div key={b.l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, background: b.c }} />
                  <span
                    style={{
                      fontFamily: t.mono,
                      fontSize: 10,
                      color: t.ink70,
                      letterSpacing: '0.06em',
                    }}
                  >
                    {b.l} {b.v}m
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  } else if (h.type === 'distance') {
    const totalKm = numeric.reduce((a, b) => a + b, 0).toFixed(1)
    body = (
      <div style={{ padding: '14px 18px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr 1fr',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <Stat
            theme={t}
            k="今日"
            v={`${h.today.value}km`}
            sub={`目標 ${h.goal.value}km`}
            on={Number(h.today.value) >= Number(h.goal.value)}
          />
          <Stat theme={t} k="ペース" v={h.pace ?? '—'} sub="平均" />
          <Stat theme={t} k="心拍" v={`${h.heart ?? '—'}`} sub="bpm avg" />
          <Stat theme={t} k="月累計" v={`${totalKm}km`} sub={`${h.month}回`} />
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 2,
            height: 70,
            padding: '4px 0',
            borderTop: `1px solid ${t.ink06}`,
            borderBottom: `1px solid ${t.ink06}`,
          }}
        >
          {series.map((v, i) => {
            const empty = v == null || v === 0
            const hh = empty ? 4 : Math.max(4, ((v as number) / max) * 65)
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: hh,
                  background: empty ? t.ink12 : t.ink,
                }}
              />
            )
          })}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 4,
            fontFamily: t.mono,
            fontSize: 9,
            color: t.ink50,
            letterSpacing: '0.1em',
          }}
        >
          <span>距離 (km) · Nike Run より自動取込</span>
          <span>今日</span>
        </div>
      </div>
    )
  } else if (h.type === 'count') {
    const goalValue = Number(h.goal.value) || 0
    const overCount = numeric.filter((v) => v >= goalValue).length
    body = (
      <div style={{ padding: '14px 18px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <Stat
            theme={t}
            k="今日"
            v={`${h.today.value}回`}
            sub={h.goal.splits ?? `≥ ${h.goal.value}`}
            on={Number(h.today.value) >= goalValue}
          />
          <Stat theme={t} k="平均" v={`${Math.round(avg)}回`} sub="セッションあたり" />
          <Stat theme={t} k="ベスト" v={`${max}回`} sub="今月" />
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 2,
            height: 70,
            padding: '4px 0',
            borderTop: `1px solid ${t.ink06}`,
            borderBottom: `1px solid ${t.ink06}`,
          }}
        >
          {series.map((v, i) => {
            const empty = v == null || v === 0
            const hh = empty ? 4 : Math.max(4, ((v as number) / max) * 65)
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: hh,
                  background: empty ? t.ink12 : (v as number) >= goalValue ? t.ink : t.accent,
                }}
              />
            )
          })}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 6,
            fontFamily: t.mono,
            fontSize: 9,
            color: t.ink50,
            letterSpacing: '0.1em',
          }}
        >
          <span>
            📷 写真証明あり: <strong style={{ color: t.accent }}>+50% XP</strong>
          </span>
          <span>達成率 {Math.round((overCount / 30) * 100)}%</span>
        </div>
      </div>
    )
  } else if (h.type === 'pages') {
    body = (
      <div style={{ padding: '14px 18px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <Stat
            theme={t}
            k="今日"
            v={`${h.today.value}p`}
            sub={`目標 ${h.goal.value}p`}
            on={Number(h.today.value) >= Number(h.goal.value)}
          />
          <Stat theme={t} k="月累計" v={`${numeric.reduce((a, b) => a + b, 0)}p`} sub="ページ" />
          <Stat theme={t} k="平均/日" v={`${Math.round(avg)}p`} />
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 2,
            height: 70,
            padding: '4px 0',
            borderTop: `1px solid ${t.ink06}`,
            borderBottom: `1px solid ${t.ink06}`,
          }}
        >
          {series.map((v, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: v == null || v === 0 ? 4 : Math.max(4, ((v as number) / max) * 65),
                background: v == null || v === 0 ? t.ink12 : t.ink,
              }}
            />
          ))}
        </div>
      </div>
    )
  } else if (h.type === 'score') {
    const remaining = Number(h.goal.value) - Number(h.today.value)
    body = (
      <div style={{ padding: '14px 18px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <Stat theme={t} k="現在" v={`${h.today.value}`} sub={`from ${h.goal.baseline}`} />
          <Stat theme={t} k="目標" v={`${h.goal.value}`} sub={h.goal.deadline} on />
          <Stat theme={t} k="残" v={`${remaining}`} sub="点" />
        </div>
        <LineChart
          theme={t}
          series={series}
          target={Number(h.goal.value)}
          baseline={h.goal.baseline}
        />
      </div>
    )
  } else if (h.type === 'weight') {
    const baseline = h.goal.baseline ?? 0
    const goal = Number(h.goal.value) || 0
    body = (
      <div style={{ padding: '14px 18px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <Stat theme={t} k="現在" v={`${h.today.value}kg`} />
          <Stat theme={t} k="目標" v={`${goal}kg`} sub={`-${(baseline - goal).toFixed(1)}`} />
          <Stat
            theme={t}
            k="変化"
            v={`${(Number(h.today.value) - baseline).toFixed(1)}kg`}
            sub={`from ${baseline}`}
          />
        </div>
        <LineChart theme={t} series={series} target={goal} baseline={baseline} inverted />
      </div>
    )
  } else if (h.type === 'time-target') {
    const goalStr = String(h.goal.value)
    const [hh, mm] = goalStr.split(':').map(Number)
    const targetHr = hh + mm / 60
    body = (
      <div style={{ padding: '14px 18px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <Stat
            theme={t}
            k="今日"
            v={String(h.today.value || '—')}
            sub={`目標 ≤ ${h.goal.value}`}
            on={h.today.done}
          />
          <Stat theme={t} k="平均" v="05:24" />
          <Stat theme={t} k="達成日" v={`${h.month}/${h.target}`} />
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 2,
            height: 60,
            padding: '4px 0',
            borderTop: `1px solid ${t.ink06}`,
            borderBottom: `1px solid ${t.ink06}`,
            position: 'relative',
          }}
        >
          {series.map((v, i) => {
            const empty = v == null
            const onTime = !empty && (v as number) <= targetHr
            const height = empty ? 4 : Math.max(6, (((v as number) - 4) / 4) * 50)
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height,
                  background: empty ? t.ink12 : onTime ? t.ink : t.accent,
                }}
              />
            )
          })}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: ((5.5 - 4) / 4) * 50 + 4,
              borderTop: `1px dashed ${t.accent}`,
            }}
          />
        </div>
        <div
          style={{
            marginTop: 6,
            fontFamily: t.mono,
            fontSize: 9,
            color: t.ink50,
            letterSpacing: '0.1em',
          }}
        >
          ⌚ Apple Watch より自動 · 棒の高さ = 起床時刻 (低いほど早い)
        </div>
      </div>
    )
  } else if (h.type === 'currency') {
    const total = numeric.reduce((a, b) => a + b, 0)
    body = (
      <div style={{ padding: '14px 18px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <Stat theme={t} k="今日" v={`¥${Number(h.today.value).toLocaleString()}`} />
          <Stat
            theme={t}
            k="月累計"
            v={`¥${total.toLocaleString()}`}
            sub={`目標 ¥${h.target.toLocaleString()}/月`}
          />
          <Stat theme={t} k="年目標" v={`¥${(Number(h.goal.value) / 10000).toFixed(0)}万`} />
        </div>
        <CumulativeChart theme={t} series={series} target={h.target} />
      </div>
    )
  } else {
    body = (
      <div style={{ padding: '14px 18px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <Stat theme={t} k="今日" v={h.today.done ? '✓ 完了' : '— 未'} on={h.today.done} />
          <Stat theme={t} k="月" v={`${h.month}/${h.target}`} />
          <Stat theme={t} k="達成率" v={`${Math.round((h.month / h.target) * 100)}%`} />
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(30, 1fr)',
            gap: 2,
          }}
        >
          {series.map((v, i) => (
            <div
              key={i}
              style={{
                aspectRatio: '1',
                background: v ? t.ink : t.ink12,
              }}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        background: t.paper,
        border: `1px solid ${t.line}`,
        breakInside: 'avoid',
      }}
    >
      {header}
      {body}
    </div>
  )
}
