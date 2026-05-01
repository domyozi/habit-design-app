/**
 * VoiceInputModal.tsx Redフェーズ追加テスト
 * TASK-0019: 音声入力UI実装
 *
 * 追加テストケース:
 * - TC-1.15: type=journaling で「ジャーナルに保存しました」が表示される
 * - TC-1.16: type=daily_report で「日報を保存しました」が表示される
 * - TC-2.6: type=unknown のとき成功メッセージが表示されない
 * - TC-2.7: result=null かつ isAnalyzing=false では余分な UI が出ない
 * - TC-3.4: transcript='' のとき認識テキスト枠が表示されない
 * - TC-3.5: isAnalyzing=true かつ result あり でもスピナーが優先される
 * - TC-3.6: type=unknown の各ボタンで onSelectAction に正しい引数が渡る
 *
 * 🔵 信頼性レベル: REQ-402/403・EDGE-003・requirements.md より
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VoiceInputModal } from '@/components/dashboard/VoiceInputModal'

describe('VoiceInputModal — Redフェーズ追加テスト', () => {
  // ── TC-1.15 ──────────────────────────────────────────────────────────────
  it('type=journaling のとき「ジャーナルに保存しました」が表示される', () => {
    // 【テスト目的】: ジャーナリング判定時の成功メッセージが正しく表示されることを確認
    // 【テスト内容】: result.type='journaling' でレンダリングし、メッセージを検証
    // 【期待される動作】: 「ジャーナルに保存しました」のテキストが表示される
    // 🔵 信頼性レベル: REQ-402・requirements.md §2.2 より

    render(
      <VoiceInputModal
        transcript="今日はモヤモヤしたけど前向きに頑張れた"
        isAnalyzing={false}
        result={{ type: 'journaling' }}
        onClose={vi.fn()}
        onSelectAction={vi.fn()}
      />
    )

    // 【結果検証】: ジャーナル保存のメッセージが表示されることを確認
    // 【期待値確認】: REQ-402 の journaling 分岐メッセージと一致すること
    expect(screen.getByText('ジャーナルに保存しました')).toBeInTheDocument() // 【確認内容】: journaling 成功メッセージ 🔵
  })

  // ── TC-1.16 ──────────────────────────────────────────────────────────────
  it('type=daily_report のとき「日報を保存しました」が表示される', () => {
    // 【テスト目的】: 日報判定時の成功メッセージが正しく表示されることを確認
    // 【テスト内容】: result.type='daily_report' でレンダリングし、メッセージを検証
    // 【期待される動作】: 「日報を保存しました」のテキストが表示される
    // 🔵 信頼性レベル: REQ-402・requirements.md §2.2 より

    render(
      <VoiceInputModal
        transcript="今日やったのはコードレビュー、明日はデプロイ"
        isAnalyzing={false}
        result={{ type: 'daily_report' }}
        onClose={vi.fn()}
        onSelectAction={vi.fn()}
      />
    )

    // 【結果検証】: 日報保存のメッセージが表示されることを確認
    expect(screen.getByText('日報を保存しました')).toBeInTheDocument() // 【確認内容】: daily_report 成功メッセージ 🔵
  })

  // ── TC-2.6 ──────────────────────────────────────────────────────────────
  it('type=unknown のとき成功メッセージが表示されない（排他性の確認）', () => {
    // 【テスト目的】: EDGE-003 の手動選択 UI と成功メッセージが同時に出ないことを確認
    // 【テスト内容】: result.type='unknown' でレンダリングし、成功メッセージが無いことを検証
    // 【期待される動作】: 各種成功メッセージが表示されず、手動選択 UI のみ表示される
    // 🔵 信頼性レベル: EDGE-003・requirements.md §4.3 より

    render(
      <VoiceInputModal
        transcript="なんか入力した"
        isAnalyzing={false}
        result={{ type: 'unknown' }}
        onClose={vi.fn()}
        onSelectAction={vi.fn()}
      />
    )

    // 【結果検証】: 成功メッセージが出ていないことを確認
    // 【期待値確認】: unknown 分岐では成功メッセージが表示されないこと
    expect(screen.queryByText('習慣を更新しました')).not.toBeInTheDocument() // 【確認内容】: checklist メッセージなし 🔵
    expect(screen.queryByText('ジャーナルに保存しました')).not.toBeInTheDocument() // 【確認内容】: journaling メッセージなし 🔵
    expect(screen.queryByText('日報を保存しました')).not.toBeInTheDocument() // 【確認内容】: daily_report メッセージなし 🔵
    expect(screen.getByText(/どの操作ですか/)).toBeInTheDocument() // 【確認内容】: 手動選択 UI が表示される 🔵
  })

  // ── TC-2.7 ──────────────────────────────────────────────────────────────
  it('result=null かつ isAnalyzing=false の初期状態では余分な UI が出ない', () => {
    // 【テスト目的】: モーダルの初期状態で余分な UI ノイズが出ないことを確認
    // 【テスト内容】: transcript='' result=null isAnalyzing=false でレンダリングし、余分な要素がないか検証
    // 【期待される動作】: スピナー・結果メッセージ・手動選択 UI のいずれも表示されない
    // 🟡 信頼性レベル: 既存実装の条件分岐から合理的推測

    render(
      <VoiceInputModal
        transcript=""
        isAnalyzing={false}
        result={null}
        onClose={vi.fn()}
        onSelectAction={vi.fn()}
      />
    )

    // 【結果検証】: 余分な UI 要素が出ていないことを確認
    // 【期待値確認】: 初期表示でのクリーンな状態
    expect(screen.queryByText(/AIが解析中/)).not.toBeInTheDocument() // 【確認内容】: スピナーなし 🟡
    expect(screen.queryByText('習慣を更新しました')).not.toBeInTheDocument() // 【確認内容】: checklist メッセージなし 🟡
    expect(screen.queryByText(/どの操作ですか/)).not.toBeInTheDocument() // 【確認内容】: 手動選択 UI なし 🟡
  })

  // ── TC-3.4 ──────────────────────────────────────────────────────────────
  it('transcript=\'\' のとき認識テキスト表示枠が DOM に存在しない', () => {
    // 【テスト目的】: 認識テキストが空のとき余分な枠が表示されないことを確認
    // 【テスト内容】: transcript='' でレンダリングし、認識テキスト枠が DOM にないことを検証
    // 【期待される動作】: transcript が空文字のとき {transcript && <div>} が描画されない
    // 🔵 信頼性レベル: 既存実装の {transcript && ...} 分岐より

    const { container } = render(
      <VoiceInputModal
        transcript=""
        isAnalyzing={false}
        result={null}
        onClose={vi.fn()}
        onSelectAction={vi.fn()}
      />
    )

    // 【結果検証】: transcript 枠が描画されていないことを確認
    // 【期待値確認】: 意味のない空枠を出さないこと
    const transcriptBox = container.querySelector('[data-testid="transcript-box"]')
    // data-testid が無い場合は text で確認（空テキストの p タグが存在しないこと）
    const allParagraphs = container.querySelectorAll('p')
    const emptyParagraph = Array.from(allParagraphs).find(p => p.textContent === '')
    expect(emptyParagraph).toBeUndefined() // 【確認内容】: 空の p タグが存在しない 🔵
    // transcript box 自体が存在しないこと（{transcript && ...} 条件分岐）
    expect(transcriptBox).toBeNull() // 【確認内容】: data-testid="transcript-box" が存在しない（実装で追加要） 🔵
  })

  // ── TC-3.5 ──────────────────────────────────────────────────────────────
  it('isAnalyzing=true かつ result あり のときスピナーが優先され成功メッセージは出ない', () => {
    // 【テスト目的】: レスポンス到達直前のレース状態でも UI が混ざらないことを確認
    // 【テスト内容】: isAnalyzing=true かつ result が設定された状態でレンダリングし、スピナーが優先されることを検証
    // 【期待される動作】: 「AIが解析中...」が表示され、「習慣を更新しました」は出ない
    // 🔵 信頼性レベル: 既存実装 {result && !isAnalyzing && ...} 分岐より

    render(
      <VoiceInputModal
        transcript="朝ランニングした"
        isAnalyzing={true}
        result={{ type: 'checklist' }}
        onClose={vi.fn()}
        onSelectAction={vi.fn()}
      />
    )

    // 【結果検証】: スピナーのみ表示、成功メッセージは出ないことを確認
    // 【期待値確認】: 同時 state でも UI が混ざらないこと
    expect(screen.getByText(/AIが解析中/)).toBeInTheDocument() // 【確認内容】: スピナーが表示 🔵
    expect(screen.queryByText('習慣を更新しました')).not.toBeInTheDocument() // 【確認内容】: 成功メッセージは出ない 🔵
  })

  // ── TC-3.6 ──────────────────────────────────────────────────────────────
  it('type=unknown のとき各選択ボタンで onSelectAction に正しい引数が渡る', () => {
    // 【テスト目的】: EDGE-003 の 3 分岐（checklist / journaling / daily_report）が全て正しく動作することを確認
    // 【テスト内容】: result.type='unknown' で各ボタンをクリックし、onSelectAction の引数を検証
    // 【期待される動作】: 各ボタンで対応するアクション名がコールバックに渡る
    // 🔵 信頼性レベル: EDGE-003・requirements.md §4.3・既存実装より

    const onSelectAction = vi.fn()

    render(
      <VoiceInputModal
        transcript="なんか入力した"
        isAnalyzing={false}
        result={{ type: 'unknown' }}
        onClose={vi.fn()}
        onSelectAction={onSelectAction}
      />
    )

    // 【実際の処理実行】: 「チェックリスト」ボタンをクリック
    fireEvent.click(screen.getByRole('button', { name: /チェックリスト/ }))
    // 【結果検証】: checklist が渡ること
    expect(onSelectAction).toHaveBeenLastCalledWith('checklist') // 【確認内容】: checklist アクション 🔵

    // 【実際の処理実行】: 「ジャーナル」ボタンをクリック
    fireEvent.click(screen.getByRole('button', { name: /ジャーナル/ }))
    // 【結果検証】: journaling が渡ること
    expect(onSelectAction).toHaveBeenLastCalledWith('journaling') // 【確認内容】: journaling アクション 🔵

    // 【実際の処理実行】: 「日報」ボタンをクリック
    fireEvent.click(screen.getByRole('button', { name: /日報/ }))
    // 【結果検証】: daily_report が渡ること
    expect(onSelectAction).toHaveBeenLastCalledWith('daily_report') // 【確認内容】: daily_report アクション 🔵

    // 【最終確認】: 合計 3 回呼ばれたこと
    expect(onSelectAction).toHaveBeenCalledTimes(3) // 【確認内容】: 3 つのボタン全てが動作 🔵
  })
})
