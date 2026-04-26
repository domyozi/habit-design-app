import { useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts'
import { fetchKpiLogs } from '@/lib/api'
import type { Kpi, KpiChartDataPoint, KpiChartResponse } from '@/types'

type Granularity = 'daily' | 'weekly' | 'monthly'

interface KpiChartProps {
  kpi: Kpi
}

const GRANULARITY_RANGE: Record<Granularity, string> = {
  daily: '30d',
  weekly: '12w',
  monthly: '6m',
}

const GRANULARITY_LABELS: Record<Granularity, string> = {
  daily: '日次',
  weekly: '週次',
  monthly: '月次',
}

export function KpiChart({ kpi }: KpiChartProps) {
  const [granularity, setGranularity] = useState<Granularity>('daily')
  const [chartData, setChartData] = useState<KpiChartResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void Promise.resolve().then(async () => {
      if (!active) return
      setLoading(true)
      setError(null)
      try {
        const res = await fetchKpiLogs(kpi.id, granularity, GRANULARITY_RANGE[granularity])
        if (active) setChartData(res.data)
      } catch {
        if (active) setError('データを取得できませんでした')
      } finally {
        if (active) setLoading(false)
      }
    })
    return () => { active = false }
  }, [kpi.id, granularity])

  const dataPoints: KpiChartDataPoint[] = chartData?.data_points ?? []
  const summary = chartData?.summary

  return (
    <div data-testid="kpi-chart" className="space-y-4">
      {/* 粒度タブ */}
      <div data-testid="kpi-chart-tabs" role="tablist" className="flex gap-2">
        {(['daily', 'weekly', 'monthly'] as Granularity[]).map((g) => (
          <button
            key={g}
            role="tab"
            aria-selected={granularity === g}
            data-testid={`kpi-chart-tab-${g}`}
            onClick={() => setGranularity(g)}
            className={`px-3 py-1 rounded ${
              granularity === g ? 'bg-blue-500 text-white' : 'bg-gray-100'
            }`}
          >
            {GRANULARITY_LABELS[g]}
          </button>
        ))}
      </div>

      {/* ローディング */}
      {loading && (
        <div data-testid="kpi-chart-loading" className="h-48 animate-pulse bg-gray-200 rounded" />
      )}

      {/* エラー */}
      {!loading && error && (
        <p data-testid="kpi-chart-error" className="text-red-500">
          {error}
        </p>
      )}

      {/* データなし */}
      {!loading && !error && dataPoints.length === 0 && (
        <p data-testid="kpi-chart-empty">記録がありません</p>
      )}

      {/* グラフ本体 */}
      {!loading && !error && dataPoints.length > 0 && (
        <div data-testid="kpi-chart-graph">
          {kpi.target_value !== undefined && (
            <p className="text-xs text-red-500 mb-1" data-testid="kpi-chart-target-label">
              目標: {kpi.target_value}{kpi.unit ? ` ${kpi.unit}` : ''}
            </p>
          )}
          <ResponsiveContainer width="100%" height={240}>
            {granularity === 'daily' ? (
              <LineChart data={dataPoints}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#3b82f6"
                  connectNulls={false}
                  dot={false}
                />
                {kpi.target_value !== undefined && (
                  <ReferenceLine
                    y={kpi.target_value}
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                    label={`目標: ${kpi.target_value}${kpi.unit ? ` ${kpi.unit}` : ''}`}
                  />
                )}
              </LineChart>
            ) : (
              <BarChart data={dataPoints}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" />
                {kpi.target_value !== undefined && (
                  <ReferenceLine
                    y={kpi.target_value}
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                    label={`目標: ${kpi.target_value}${kpi.unit ? ` ${kpi.unit}` : ''}`}
                  />
                )}
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}

      {/* サマリー統計 */}
      {!loading && !error && summary && (
        <div data-testid="kpi-chart-summary" className="grid grid-cols-4 gap-2">
          <div data-testid="kpi-chart-summary-avg" className="bg-gray-50 rounded p-2 text-center">
            <p className="text-xs text-gray-500">平均</p>
            <p className="font-bold">{summary.avg != null ? summary.avg.toFixed(1) : '—'}</p>
          </div>
          <div data-testid="kpi-chart-summary-max" className="bg-gray-50 rounded p-2 text-center">
            <p className="text-xs text-gray-500">最大</p>
            <p className="font-bold">{summary.max != null ? summary.max.toFixed(1) : '—'}</p>
          </div>
          <div data-testid="kpi-chart-summary-min" className="bg-gray-50 rounded p-2 text-center">
            <p className="text-xs text-gray-500">最小</p>
            <p className="font-bold">{summary.min != null ? summary.min.toFixed(1) : '—'}</p>
          </div>
          <div data-testid="kpi-chart-summary-latest" className="bg-gray-50 rounded p-2 text-center">
            <p className="text-xs text-gray-500">最新</p>
            <p className="font-bold">
              {dataPoints.length > 0
                ? (dataPoints[dataPoints.length - 1].value != null
                  ? dataPoints[dataPoints.length - 1].value!.toFixed(1)
                  : '—')
                : '—'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default KpiChart
