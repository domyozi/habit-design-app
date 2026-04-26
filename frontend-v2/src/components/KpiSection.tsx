import { useEffect, useState } from 'react'
import { fetchKpisToday } from '../lib/api'
import type { KpiWithTodayStatus } from '../types'
import { KpiLogInput } from './KpiLogInput'

export function KpiSection() {
  const [kpis, setKpis] = useState<KpiWithTodayStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchKpisToday()
      .then((res) => setKpis(res.data))
      .catch(() => setError('KPIデータの取得に失敗しました'))
      .finally(() => setLoading(false))
  }, [])

  const handleLog = (kpiId: string, value: number) => {
    setKpis((prev) =>
      prev.map((k) =>
        k.id === kpiId
          ? { ...k, today_completed: true, today_value: value }
          : k
      )
    )
  }

  if (loading) return <div data-testid="kpi-section-loading">読み込み中...</div>
  if (error) return <div data-testid="kpi-section-error">{error}</div>

  const allCompleted = kpis.length > 0 && kpis.every((k) => k.today_completed)

  return (
    <section data-testid="kpi-section">
      <h2 className="text-lg font-bold mb-3">今日のKPI</h2>
      {allCompleted ? (
        <p data-testid="kpi-all-completed">本日のKPI入力完了</p>
      ) : (
        <ul className="space-y-3">
          {kpis
            .filter((k) => !k.today_completed)
            .map((kpi) => (
              <li key={kpi.id}>
                <KpiLogInput kpi={kpi} onLog={handleLog} />
              </li>
            ))}
        </ul>
      )}
    </section>
  )
}

export default KpiSection
