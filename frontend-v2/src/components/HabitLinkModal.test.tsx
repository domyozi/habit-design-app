import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { HabitLinkModal } from './HabitLinkModal'
import * as api from '../lib/api'

describe('HabitLinkModal', () => {
  const habits = [
    { id: 'habit-1', title: '朝のランニング' },
    { id: 'habit-2', title: '読書30分' },
  ]

  const baseProps = {
    kpiId: 'kpi-1',
    kpiTitle: 'テスト KPI',
    availableHabits: habits,
    onSuccess: vi.fn(),
    onClose: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ダイアログが表示される
  test('ダイアログが表示され、習慣一覧がチェックボックスで表示される', () => {
    render(<HabitLinkModal {...baseProps} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('朝のランニング')).toBeInTheDocument()
    expect(screen.getByLabelText('読書30分')).toBeInTheDocument()
  })

  // TC5: 習慣選択後保存で onSuccess が呼ばれる
  test('習慣を選択して保存すると onSuccess が呼ばれる', async () => {
    vi.spyOn(api, 'linkKpiHabits').mockResolvedValue({
      success: true,
      data: { kpi_id: 'kpi-1', habit_ids: ['habit-1'] },
    })

    render(<HabitLinkModal {...baseProps} />)

    // 「朝のランニング」を選択
    fireEvent.click(screen.getByLabelText('朝のランニング'))

    // 保存
    fireEvent.click(screen.getByText('保存'))

    await waitFor(() => {
      expect(baseProps.onSuccess).toHaveBeenCalledWith(['habit-1'])
    })
  })

  // キャンセルで onClose が呼ばれる
  test('キャンセルをクリックすると onClose が呼ばれる', () => {
    render(<HabitLinkModal {...baseProps} />)
    fireEvent.click(screen.getByText('キャンセル'))
    expect(baseProps.onClose).toHaveBeenCalledTimes(1)
  })

  // initialSelectedIds で初期選択状態が設定される
  test('initialSelectedIds が指定されていると、その習慣が初期チェック済み', () => {
    render(<HabitLinkModal {...baseProps} initialSelectedIds={['habit-2']} />)
    const checkbox = screen.getByLabelText('読書30分') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })
})
