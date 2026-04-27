/**
 * VoiceInputModal.tsx テスト
 * TASK-0019: 音声入力UI実装
 *
 * テストケース:
 * 1. 認識テキストが表示される
 * 2. AI解析中にスピナーが表示される
 * 3. type=unknown のとき「どの操作ですか？」選択UIが表示される（EDGE-003）
 * 4. type=checklist のとき結果メッセージが表示される
 * 5. 閉じるボタンで onClose が呼ばれる
 *
 * 🔵 信頼性レベル: REQ-402/403・EDGE-003 より
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VoiceInputModal } from '@/components/dashboard/VoiceInputModal'

describe('VoiceInputModal', () => {
  /**
   * テストケース1: 認識テキストが表示される
   * Given: transcript='朝ランニングした'
   * When: VoiceInputModal をレンダリングする
   * Then: '朝ランニングした' が表示される
   * 🔵 REQ-402 より
   */
  it('認識テキストが表示される', () => {
    render(
      <VoiceInputModal
        transcript="朝ランニングした"
        isAnalyzing={false}
        result={null}
        onClose={vi.fn()}
        onSelectAction={vi.fn()}
      />
    )

    expect(screen.getByText('朝ランニングした')).toBeInTheDocument()
  })

  /**
   * テストケース2: isAnalyzing=true のときスピナーが表示される
   * Given: isAnalyzing=true
   * When: VoiceInputModal をレンダリングする
   * Then: 「AIが解析中...」テキストが表示される
   * 🔵 REQ-402 より
   */
  it('isAnalyzing=true のとき「AIが解析中...」が表示される', () => {
    render(
      <VoiceInputModal
        transcript="朝ランニングした"
        isAnalyzing={true}
        result={null}
        onClose={vi.fn()}
        onSelectAction={vi.fn()}
      />
    )

    expect(screen.getByText(/AIが解析中/)).toBeInTheDocument()
  })

  /**
   * テストケース3: type=unknown のとき「どの操作ですか？」選択UIが表示される
   * Given: result.type='unknown'
   * When: VoiceInputModal をレンダリングする
   * Then: 「どの操作ですか？」選択肢が表示される
   * 🔵 EDGE-003 より
   */
  it('type=unknown のとき「どの操作ですか？」選択UIが表示される', () => {
    render(
      <VoiceInputModal
        transcript="なんか入力した"
        isAnalyzing={false}
        result={{ type: 'unknown' }}
        onClose={vi.fn()}
        onSelectAction={vi.fn()}
      />
    )

    expect(screen.getByText(/どの操作ですか/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /チェックリスト/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ジャーナル/ })).toBeInTheDocument()
  })

  /**
   * テストケース4: type=checklist のとき結果メッセージが表示される
   * Given: result.type='checklist'
   * When: VoiceInputModal をレンダリングする
   * Then: 「習慣を更新しました」メッセージが表示される
   * 🔵 REQ-403 より
   */
  it('type=checklist のとき「習慣を更新しました」が表示される', () => {
    render(
      <VoiceInputModal
        transcript="朝ランニングした"
        isAnalyzing={false}
        result={{ type: 'checklist', message: '習慣を更新しました' }}
        onClose={vi.fn()}
        onSelectAction={vi.fn()}
      />
    )

    expect(screen.getByText(/習慣を更新しました/)).toBeInTheDocument()
  })

  /**
   * テストケース5: 閉じるボタンで onClose が呼ばれる
   * Given: VoiceInputModal が表示されている
   * When: 閉じるボタンをクリックする
   * Then: onClose が呼ばれる
   * 🔵 REQ-402 より
   */
  it('閉じるボタンで onClose が呼ばれる', () => {
    const onClose = vi.fn()
    render(
      <VoiceInputModal
        transcript=""
        isAnalyzing={false}
        result={null}
        onClose={onClose}
        onSelectAction={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /閉じる/ }))
    expect(onClose).toHaveBeenCalled()
  })
})
