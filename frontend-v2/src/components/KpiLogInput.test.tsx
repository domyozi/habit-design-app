import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KpiLogInput } from './KpiLogInput'
import { KpiSection } from './KpiSection'
import * as api from '../lib/api'
import type { KpiWithTodayStatus, KpiLog } from '../types'

vi.mock('../lib/api', () => ({
  fetchKpisToday: vi.fn(),
  upsertKpiLog: vi.fn(),
}))

const mockKpiLog: KpiLog = {
  id: 'log-1',
  kpi_id: 'kpi-1',
  user_id: 'user-1',
  log_date: '2026-04-15',
  value: 1,
  input_method: 'manual',
  created_at: '2026-04-15T00:00:00Z',
}

const numericKpi: KpiWithTodayStatus = {
  id: 'kpi-1',
  user_id: 'user-1',
  goal_id: 'goal-1',
  title: '体重',
  metric_type: 'numeric',
  unit: 'kg',
  tracking_frequency: 'daily',
  display_order: 0,
  is_active: true,
  today_completed: false,
  today_value: null,
  connected_habits: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const percentageKpi: KpiWithTodayStatus = {
  ...numericKpi,
  id: 'kpi-1',
  title: '達成率',
  metric_type: 'percentage',
  unit: undefined,
}

const binaryKpi: KpiWithTodayStatus = {
  ...numericKpi,
  id: 'kpi-1',
  title: 'タスク完了',
  metric_type: 'binary',
  unit: undefined,
}

beforeEach(() => {
  vi.clearAllMocks()
})

// TC1: KpiSection - 未記録 KPI 一覧が表示される
describe('KpiSection', () => {
  test('fetchKpisToday が 2 件返すと 2 件の KpiLogInput が表示される', async () => {
    const kpi2 = { ...numericKpi, id: 'kpi-2', title: 'ランニング距離' }
    vi.mocked(api.fetchKpisToday).mockResolvedValue({
      success: true,
      data: [numericKpi, kpi2],
    })

    render(<KpiSection />)
    expect(screen.getByTestId('kpi-section-loading')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByTestId('kpi-section')).toBeInTheDocument()
    })
    expect(screen.getByTestId('kpi-log-input-kpi-1')).toBeInTheDocument()
    expect(screen.getByTestId('kpi-log-input-kpi-2')).toBeInTheDocument()
  })

  test('API エラー時はエラーメッセージが表示される', async () => {
    vi.mocked(api.fetchKpisToday).mockRejectedValue(new Error('Network error'))
    render(<KpiSection />)
    await waitFor(() => {
      expect(screen.getByTestId('kpi-section-error')).toBeInTheDocument()
    })
  })
})

// TC2: numeric KPI の入力フィールドと単位が表示される
describe('KpiLogInput', () => {
  test('numeric: 入力フィールドと単位が表示される', () => {
    render(<KpiLogInput kpi={numericKpi} onLog={vi.fn()} />)
    expect(screen.getByTestId('kpi-numeric-input-kpi-1')).toBeInTheDocument()
    expect(screen.getByText('kg')).toBeInTheDocument()
  })

  // TC3: percentage KPI で 0〜100 範囲外にエラーメッセージ
  test('percentage: 101 入力でエラーメッセージと disabled ボタン', async () => {
    render(<KpiLogInput kpi={percentageKpi} onLog={vi.fn()} />)
    const input = screen.getByTestId('kpi-percentage-input-kpi-1')
    await userEvent.type(input, '101')
    expect(screen.getByTestId('kpi-percentage-error-kpi-1')).toHaveTextContent(
      '0〜100の値を入力してください'
    )
    expect(screen.getByTestId('kpi-submit-button-kpi-1')).toBeDisabled()
  })

  // TC4: binary KPI がチェックで即時記録される
  test('binary: チェックボックスをクリックすると upsertKpiLog が呼ばれる', async () => {
    vi.mocked(api.upsertKpiLog).mockResolvedValue({ success: true, data: mockKpiLog })
    const mockOnLog = vi.fn()
    render(<KpiLogInput kpi={binaryKpi} onLog={mockOnLog} />)
    await userEvent.click(screen.getByTestId('kpi-binary-checkbox-kpi-1'))
    await waitFor(() => {
      expect(api.upsertKpiLog).toHaveBeenCalledWith('kpi-1', expect.objectContaining({ value: 1 }))
    })
    expect(mockOnLog).toHaveBeenCalledWith('kpi-1', 1)
  })

  // TC5: 楽観的更新 – ボタン押下後 API レスポンス前に「記録済み」状態になる
  test('numeric: API 完了前に楽観的更新が反映される', async () => {
    let resolve!: (v: { success: boolean; data: KpiLog }) => void
    vi.mocked(api.upsertKpiLog).mockReturnValue(
      new Promise((res) => { resolve = res })
    )
    render(<KpiLogInput kpi={numericKpi} onLog={vi.fn()} />)
    await userEvent.type(screen.getByTestId('kpi-numeric-input-kpi-1'), '74.5')
    await userEvent.click(screen.getByTestId('kpi-submit-button-kpi-1'))
    // API 未完了の時点で「記録済み」表示が出ること
    expect(screen.getByTestId('kpi-log-completed-kpi-1')).toBeInTheDocument()
    resolve({ success: true, data: mockKpiLog })
  })

  // TC6: 既記録 KPI に「編集」ボタンが表示される
  test('記録済み KPI には記録値と編集ボタンが表示される', () => {
    render(<KpiLogInput kpi={{ ...numericKpi, today_completed: true, today_value: 74.5 }} onLog={vi.fn()} />)
    expect(screen.getByTestId('kpi-log-value-kpi-1')).toHaveTextContent('74.5')
    expect(screen.getByTestId('kpi-edit-button-kpi-1')).toBeInTheDocument()
  })

  // TC7: API 失敗時に楽観的更新がロールバックされる
  test('API 失敗時に楽観的更新がロールバックされる', async () => {
    vi.mocked(api.upsertKpiLog).mockRejectedValue(new Error('Network error'))
    render(<KpiLogInput kpi={numericKpi} onLog={vi.fn()} />)
    await userEvent.type(screen.getByTestId('kpi-numeric-input-kpi-1'), '74.5')
    await userEvent.click(screen.getByTestId('kpi-submit-button-kpi-1'))
    await screen.findByTestId('kpi-error-kpi-1')
    expect(screen.queryByTestId('kpi-log-completed-kpi-1')).not.toBeInTheDocument()
    expect(screen.getByTestId('kpi-error-kpi-1')).toHaveTextContent('記録に失敗しました')
  })
})
