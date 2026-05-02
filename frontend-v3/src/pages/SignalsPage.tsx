import type { Theme } from '@/lib/theme'
import { APP } from '@/lib/mockData'
import { SOURCE_META } from '@/lib/habitTemplates'
import { MonoLabel } from '@/components/today/MonoLabel'
import { HabitAnalyticsCard } from '@/components/signals/HabitAnalyticsCard'

interface Props {
  theme: Theme
}

const INSIGHTS = [
  {
    title: '体重 ↘ × 有酸素 ↗',
    body: '有酸素5km以上の翌日、体重は平均-0.18kg。月3回以上維持できると目標68kg到達は8月中旬予測。',
    tag: 'CAUSAL',
  },
  {
    title: 'TOEIC 進捗ペース',
    body: '+25点/月 維持中。820達成は予定通り 9/30 で射程内。語彙Partの伸びが牽引。',
    tag: 'ON-TRACK',
  },
  {
    title: '英語が抜ける曜日',
    body: '木・金が頻発。週後半の朝会後にスケジュールずれ。Calendar に固定枠を提案します。',
    tag: 'RISK',
  },
]

export default function SignalsPage({ theme: t }: Props) {
  const a = APP
  const autoCount = a.habits.filter((h) => SOURCE_META[h.source]?.auto).length
  const atRisk = a.habits.filter((h) => h.lagging).length
  const coreHabits = a.habits.filter((h) => h.cat === 'core')

  const kpis = [
    { k: 'STREAK', v: a.user.streak, sub: '連続日数' },
    { k: 'HABITS · LIVE', v: a.habits.length, sub: ' ' },
    { k: 'COMPLETION · 30D', v: '72%', sub: '+8 vs last' },
    { k: 'AUTO-TRACKED', v: `${autoCount}/${a.habits.length}`, sub: '自動取込' },
    { k: 'AT-RISK', v: atRisk, sub: '英語' },
  ]

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
      }}
    >
      <div style={{ padding: '20px 24px 14px', borderBottom: `1px solid ${t.ink12}` }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.015em' }}>Signals</div>
        <div
          style={{
            fontFamily: t.mono,
            fontSize: 10,
            color: t.ink50,
            marginTop: 2,
            letterSpacing: '0.14em',
          }}
        >
          習慣ごとの逆算と進捗 · 計測タイプに応じた最適なグラフ
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          borderBottom: `1px solid ${t.ink12}`,
          background: t.paperWarm,
        }}
      >
        {kpis.map((s, i) => (
          <div
            key={s.k}
            style={{
              padding: '14px 18px',
              borderRight: i < 4 ? `1px solid ${t.ink12}` : 'none',
            }}
          >
            <div
              style={{
                fontFamily: t.mono,
                fontSize: 9,
                color: t.ink50,
                letterSpacing: '0.16em',
              }}
            >
              {s.k}
            </div>
            <div
              style={{
                fontFamily: t.mono,
                fontSize: 28,
                fontWeight: 300,
                marginTop: 4,
                letterSpacing: '-0.02em',
              }}
            >
              {s.v}
            </div>
            <div
              style={{
                fontFamily: t.mono,
                fontSize: 9,
                color: t.ink30,
                letterSpacing: '0.14em',
              }}
            >
              {s.sub}
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: 22 }}>
        <div style={{ marginBottom: 12 }}>
          <MonoLabel theme={t}>PER-HABIT ANALYTICS · 計測タイプ別</MonoLabel>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {coreHabits.map((h) => (
            <HabitAnalyticsCard key={h.id} habit={h} theme={t} />
          ))}
        </div>
      </div>

      <div style={{ padding: '0 22px 24px' }}>
        <div style={{ borderTop: `1px solid ${t.line}`, paddingTop: 14, marginBottom: 12 }}>
          <MonoLabel theme={t} color={t.accent}>
            AI INSIGHTS · 横断パターン
          </MonoLabel>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
          }}
        >
          {INSIGHTS.map((ins, i) => (
            <div
              key={i}
              style={{
                padding: '14px 16px',
                border: `1px solid ${t.line}`,
                background: t.paper,
              }}
            >
              <div
                style={{
                  fontFamily: t.mono,
                  fontSize: 9,
                  color: t.accent,
                  fontWeight: 700,
                  letterSpacing: '0.16em',
                  marginBottom: 6,
                }}
              >
                ● {ins.tag}
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  marginBottom: 6,
                  lineHeight: 1.3,
                }}
              >
                {ins.title}
              </div>
              <div style={{ fontSize: 11, color: t.ink70, lineHeight: 1.55 }}>{ins.body}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
