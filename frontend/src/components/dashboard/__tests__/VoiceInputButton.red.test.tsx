/**
 * VoiceInputButton.tsx Redフェーズ追加テスト
 * TASK-0019: 音声入力UI実装
 *
 * 追加テストケース:
 * - TC-1.6: 非録音状態で bg-emerald-500 クラスが付いている
 * - TC-1.7: 録音中に bg-red-500 クラスが付いている
 * - TC-1.9: isListening=true のとき onStopListening が呼ばれる
 * - TC-1.10: フォールバック送信で trim 済みテキストが渡る
 * - TC-1.11: Enter キーでもフォールバック送信できる
 * - TC-2.4: 非対応ブラウザで onStartListening は呼ばれない（フォールバックのみ）
 * - TC-2.5: フォールバックで空白のみのテキストは onTranscript が呼ばれない
 *
 * 🔵 信頼性レベル: REQ-401・NFR-201・architecture.md 音声入力制約より
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VoiceInputButton } from '@/components/dashboard/VoiceInputButton'

describe('VoiceInputButton — Redフェーズ追加テスト', () => {
  // ── TC-1.6 ──────────────────────────────────────────────────────────────
  it('非録音状態のとき bg-emerald-500 クラスがボタンに付いている', () => {
    // 【テスト目的】: デフォルト状態（待機中）のボタンが緑色であることを確認
    // 【テスト内容】: isListening=false でレンダリングし、ボタンのクラスを検証
    // 【期待される動作】: bg-emerald-500 が含まれ animate-pulse は含まれない
    // 🔵 信頼性レベル: requirements.md §3.7・既存実装より

    // 【テストデータ準備】: 非録音・対応ブラウザの状態
    render(
      <VoiceInputButton
        isSupported={true}
        isListening={false}
        onStartListening={vi.fn()}
        onStopListening={vi.fn()}
        onTranscript={vi.fn()}
      />
    )

    // 【実際の処理実行】: aria-label で音声入力ボタンを取得
    const button = screen.getByRole('button', { name: /音声入力/ })

    // 【結果検証】: クラス属性の確認
    // 【期待値確認】: 緑色スタイルで待機中を示すこと
    expect(button.className).toContain('bg-emerald-500') // 【確認内容】: 緑色ベーススタイル 🔵
    expect(button.className).not.toContain('animate-pulse') // 【確認内容】: パルスアニメーションなし 🔵
    expect(button.className).not.toContain('bg-red-500') // 【確認内容】: 赤色スタイルなし 🔵
  })

  // ── TC-1.7 ──────────────────────────────────────────────────────────────
  it('録音中のとき bg-red-500 と animate-pulse クラスがボタンに付いている', () => {
    // 【テスト目的】: 録音状態の視覚フィードバックが正しく適用されることを確認
    // 【テスト内容】: isListening=true でレンダリングし、ボタンのクラスを検証
    // 【期待される動作】: bg-red-500 と animate-pulse が含まれ、bg-emerald-500 は含まれない
    // 🔵 信頼性レベル: TASK-0019 §UI/UX要件より

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

    // 【結果検証】: 録音中スタイルの確認
    // 【期待値確認】: 赤色＋パルスでユーザーに録音中を強く通知
    expect(button.className).toContain('bg-red-500') // 【確認内容】: 赤色スタイルが適用 🔵
    expect(button.className).toContain('animate-pulse') // 【確認内容】: パルスアニメーション 🔵
    expect(button.className).not.toContain('bg-emerald-500') // 【確認内容】: 緑色スタイルなし 🔵
  })

  // ── TC-1.9 ──────────────────────────────────────────────────────────────
  it('録音中にボタンをクリックすると onStopListening が呼ばれ onStartListening は呼ばれない', () => {
    // 【テスト目的】: 録音停止のコールバックが正しく呼ばれることを確認
    // 【テスト内容】: isListening=true でクリックし、各コールバックの呼び出し回数を検証
    // 【期待される動作】: onStopListening のみが 1 回呼ばれる
    // 🔵 信頼性レベル: 既存実装ハンドラ分岐より

    const onStart = vi.fn()
    const onStop = vi.fn()

    render(
      <VoiceInputButton
        isSupported={true}
        isListening={true}
        onStartListening={onStart}
        onStopListening={onStop}
        onTranscript={vi.fn()}
      />
    )

    // 【実際の処理実行】: 録音中にボタンをクリック
    fireEvent.click(screen.getByRole('button', { name: /音声入力/ }))

    // 【結果検証】: コールバックの呼び出し状況を確認
    // 【期待値確認】: トグル動作（停止）が正しく動作すること
    expect(onStop).toHaveBeenCalledTimes(1) // 【確認内容】: onStopListening が1回呼ばれた 🔵
    expect(onStart).toHaveBeenCalledTimes(0) // 【確認内容】: onStartListening は呼ばれない 🔵
  })

  // ── TC-1.10 ──────────────────────────────────────────────────────────────
  it('フォールバック送信で両端のスペースが trim されたテキストが onTranscript に渡る', async () => {
    // 【テスト目的】: フォールバックテキスト入力が trim されて渡ることを確認
    // 【テスト内容】: 両端にスペースがある入力を「送信」し、trim 済みのコールバック引数を検証
    // 【期待される動作】: onTranscript('今日はジャーナル') が 1 回呼ばれる
    // 🔵 信頼性レベル: requirements.md §2.2・既存実装 fallbackText.trim() より

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

    // 【初期条件設定】: ボタンをクリックしてフォールバックフォームを表示
    fireEvent.click(screen.getByRole('button', { name: /音声入力/ }))

    // 【実際の処理実行】: 両端スペース付きテキストを入力して送信
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '  今日はジャーナル  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: /送信/ }))

    // 【結果検証】: trim されたテキストが渡ることを確認
    // 【期待値確認】: trim() が適用されて余白が除去されること
    expect(onTranscript).toHaveBeenCalledTimes(1) // 【確認内容】: onTranscript が 1 回呼ばれた 🔵
    expect(onTranscript).toHaveBeenCalledWith('今日はジャーナル') // 【確認内容】: trim 済みテキストが渡る 🔵
  })

  // ── TC-1.11 ──────────────────────────────────────────────────────────────
  it('フォールバック入力で Enter キーを押すと onTranscript が呼ばれる', async () => {
    // 【テスト目的】: モバイルソフトキーボードの Enter でも送信できることを確認
    // 【テスト内容】: フォールバックフォームで Enter キーを押し、onTranscript が呼ばれるか検証
    // 【期待される動作】: onTranscript('筋トレ達成') が呼ばれる
    // 🔵 信頼性レベル: 既存実装 onKeyDown Enter ハンドラより

    const onTranscript = vi.fn()
    const user = userEvent.setup()

    render(
      <VoiceInputButton
        isSupported={false}
        isListening={false}
        onStartListening={vi.fn()}
        onStopListening={vi.fn()}
        onTranscript={onTranscript}
      />
    )

    // 【初期条件設定】: フォールバックフォームを表示
    await user.click(screen.getByRole('button', { name: /音声入力/ }))

    // 【実際の処理実行】: テキスト入力後に Enter キーを押す
    await user.type(screen.getByRole('textbox'), '筋トレ達成{Enter}')

    // 【結果検証】: Enter キーでの送信が機能することを確認
    // 【期待値確認】: NFR-201 モバイルキーボード互換の確認
    expect(onTranscript).toHaveBeenCalledWith('筋トレ達成') // 【確認内容】: Enter でも送信できる 🔵
  })

  // ── TC-2.4 ──────────────────────────────────────────────────────────────
  it('非対応ブラウザでボタンをクリックしても onStartListening は呼ばれない', () => {
    // 【テスト目的】: 非対応ブラウザで音声認識が開始されないことを確認
    // 【テスト内容】: isSupported=false でクリックし、onStartListening が呼ばれないことを検証
    // 【期待される動作】: フォールバックフォームが表示されるだけで録音は開始されない
    // 🔵 信頼性レベル: architecture.md §音声入力制約より

    const onStart = vi.fn()

    render(
      <VoiceInputButton
        isSupported={false}
        isListening={false}
        onStartListening={onStart}
        onStopListening={vi.fn()}
        onTranscript={vi.fn()}
      />
    )

    // 【実際の処理実行】: 非対応ブラウザでボタンをクリック
    fireEvent.click(screen.getByRole('button', { name: /音声入力/ }))

    // 【結果検証】: onStartListening が呼ばれないことを確認
    // 【期待値確認】: Firefox/Safari ユーザーが録音開始しようとしてもクラッシュしない
    expect(onStart).toHaveBeenCalledTimes(0) // 【確認内容】: 非対応時は録音開始コールバックが呼ばれない 🔵
    expect(screen.getByRole('textbox')).toBeInTheDocument() // 【確認内容】: フォールバックフォームが表示される 🔵
  })

  // ── TC-2.5 ──────────────────────────────────────────────────────────────
  it('フォールバックで空白のみのテキストを送信しても onTranscript は呼ばれない', () => {
    // 【テスト目的】: 空白のみの入力が API 呼び出しを引き起こさないことを確認
    // 【テスト内容】: スペースのみのテキストで送信し、onTranscript が呼ばれないことを検証
    // 【期待される動作】: onTranscript は 0 回。フォームは開いたまま。
    // 🟡 信頼性レベル: requirements.md §4.3「認識結果が空文字」を援用・既存実装 trim() ガードより

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

    // 【初期条件設定】: フォールバックフォームを表示
    fireEvent.click(screen.getByRole('button', { name: /音声入力/ }))

    // 【実際の処理実行】: スペースのみを入力して送信ボタンをクリック
    // 【処理内容】: 空白のみの不正入力を送信しようとする
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: /送信/ }))

    // 【結果検証】: コールバックが呼ばれず、フォームが残っていることを確認
    // 【期待値確認】: 不正な空入力が API コストを発生させないこと
    expect(onTranscript).toHaveBeenCalledTimes(0) // 【確認内容】: 空白テキストは onTranscript を呼ばない 🟡
    expect(screen.getByRole('textbox')).toBeInTheDocument() // 【確認内容】: フォームが閉じていない 🟡
  })
})
