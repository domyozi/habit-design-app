/**
 * VoiceInputButton.tsx テスト
 * TASK-0019: 音声入力UI実装
 *
 * テストケース:
 * 1. isSupported=false のとき、クリックでテキスト入力フォームが表示される
 * 2. isSupported=true のとき、クリックで onStartListening が呼ばれる
 * 3. isListening=true のとき、ボタンに animate-pulse クラスが付く
 * 4. テキスト入力フォームで onTranscript が呼ばれる
 *
 * 🔵 信頼性レベル: REQ-401・architecture.md 音声入力制約より
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VoiceInputButton } from '@/components/dashboard/VoiceInputButton'

describe('VoiceInputButton', () => {
  /**
   * テストケース1: 非対応ブラウザではテキスト入力フォールバックが表示される
   * Given: isSupported=false
   * When: マイクボタンをクリックする
   * Then: テキスト入力フォームが表示される
   * 🔵 architecture.md 音声入力制約より
   */
  it('isSupported=false のときクリックでテキスト入力フォームが表示される', () => {
    render(
      <VoiceInputButton
        isSupported={false}
        isListening={false}
        onStartListening={vi.fn()}
        onStopListening={vi.fn()}
        onTranscript={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /音声入力/ }))
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  /**
   * テストケース2: isSupported=true のとき onStartListening が呼ばれる
   * Given: isSupported=true, isListening=false
   * When: マイクボタンをクリックする
   * Then: onStartListening が呼ばれる
   * 🔵 REQ-401 より
   */
  it('isSupported=true のときクリックで onStartListening が呼ばれる', () => {
    const onStart = vi.fn()
    render(
      <VoiceInputButton
        isSupported={true}
        isListening={false}
        onStartListening={onStart}
        onStopListening={vi.fn()}
        onTranscript={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /音声入力/ }))
    expect(onStart).toHaveBeenCalled()
  })

  /**
   * テストケース3: isListening=true のときボタンに animate-pulse クラスが付く
   * Given: isListening=true
   * When: コンポーネントをレンダリングする
   * Then: ボタンに animate-pulse クラスがある
   * 🔵 REQ-401 より
   */
  it('isListening=true のときボタンに animate-pulse クラスが付く', () => {
    render(
      <VoiceInputButton
        isSupported={true}
        isListening={true}
        onStartListening={vi.fn()}
        onStopListening={vi.fn()}
        onTranscript={vi.fn()}
      />
    )

    const button = screen.getByRole('button', { name: /音声入力/ })
    expect(button.className).toContain('animate-pulse')
  })

  /**
   * テストケース4: テキスト入力フォームでテキスト送信すると onTranscript が呼ばれる
   * Given: isSupported=false でフォームが表示されている
   * When: テキストを入力して送信する
   * Then: onTranscript が入力テキストで呼ばれる
   * 🔵 architecture.md 音声入力制約より
   */
  it('テキスト入力フォームで送信すると onTranscript が呼ばれる', () => {
    const onTranscript = vi.fn()
    render(
      <VoiceInputButton
        isSupported={false}
        isListening={false}
        onStartListening={vi.fn()}
        onStopListening={vi.fn()}
        onTranscript={onTranscript}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /音声入力/ }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '朝ランニングした' } })
    fireEvent.click(screen.getByRole('button', { name: /送信/ }))

    expect(onTranscript).toHaveBeenCalledWith('朝ランニングした')
  })
})
