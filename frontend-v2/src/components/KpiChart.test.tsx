import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KpiChart } from './KpiChart'
import * as api from '../lib/api'
import type { Kpi, KpiChartApiResponse, KpiChartSummary } from '../types'

vi.mock('../lib/api', () => ({
  fetchKpiLogs: vi.fn(),
}))

const mockKpi: Kpi = {
  id: 'kpi-1',
  user_id: 'user-1',
  goal_id: 'goal-1',
  title: '体重',
  metric_type: 'numeric',
  unit: 'kg',
  tracking_frequency: 'daily',
  display_order: 0,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const mockDataPoints = [
  { date: '2026-04-13', value: 74.0 },
  { date: '2026-04-14', value: 74.5 },
]

const mockSummary = { avg: 72.3, max: 80.0, min: 65.0, latest_value: 74.5 }

const makeResponse = (granularity: 'daily' | 'weekly' | 'monthly', dataPoints = mockDataPoints, summary: KpiChartSummary = mockSummary): KpiChartApiResponse => ({
  success: true,
  data: {
    kpi_id: 'kpi-1',
    granularity,
    data_points: dataPoints,
    summary,
  },
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.fetchKpiLogs).mockResolvedValue(makeResponse('daily'))
})

// TC1: 「週次」タブで fetchKpiLogs が weekly で呼ばれる
test('週次タブをクリックすると weekly で再取得される', async () => {
  vi.mocked(api.fetchKpiLogs).mockResolvedValue(makeResponse('weekly', [], {}))
  render(<KpiChart kpi={mockKpi} />)
  await userEvent.click(screen.getByTestId('kpi-chart-tab-weekly'))
  expect(api.fetchKpiLogs).toHaveBeenCalledWith('kpi-1', 'weekly', '12w')
})

// TC2: データ 0 件で「記録がありません」
test('データ 0 件で「記録がありません」が表示される', async () => {
  vi.mocked(api.fetchKpiLogs).mockResolvedValue(makeResponse('daily', [], {}))
  render(<KpiChart kpi={mockKpi} />)
  expect(await screen.findByTestId('kpi-chart-empty')).toHaveTextContent('記録がありません')
})

// TC3: target_value 設定時に目標ラベルが表示される
test('target_value 設定時に目標ラベルが表示される', async () => {
  render(<KpiChart kpi={{ ...mockKpi, target_value: 70 }} />)
  await screen.findByTestId('kpi-chart-graph')
  expect(screen.getByText(/目標: 70/)).toBeInTheDocument()
})

// TC4: ローディング中にスケルトンが表示される
test('ローディング中はスケルトンが表示される', () => {
  vi.mocked(api.fetchKpiLogs).mockReturnValue(new Promise(() => {}))
  render(<KpiChart kpi={mockKpi} />)
  expect(screen.getByTestId('kpi-chart-loading')).toBeInTheDocument()
})

// TC5: API エラー時にエラーメッセージが表示される
test('API エラー時にエラーメッセージが表示される', async () => {
  vi.mocked(api.fetchKpiLogs).mockRejectedValue(new Error('Network error'))
  render(<KpiChart kpi={mockKpi} />)
  expect(await screen.findByTestId('kpi-chart-error')).toHaveTextContent(
    'データを取得できませんでした'
  )
})

// TC6: サマリーセクションに統計値が表示される
test('サマリーカードに統計値が表示される', async () => {
  render(<KpiChart kpi={mockKpi} />)
  await screen.findByTestId('kpi-chart-summary')
  expect(screen.getByTestId('kpi-chart-summary-avg')).toHaveTextContent('72.3')
  expect(screen.getByTestId('kpi-chart-summary-max')).toHaveTextContent('80.0')
  expect(screen.getByTestId('kpi-chart-summary-min')).toHaveTextContent('65.0')
  expect(screen.getByTestId('kpi-chart-summary-latest')).toHaveTextContent('74.5')
})
