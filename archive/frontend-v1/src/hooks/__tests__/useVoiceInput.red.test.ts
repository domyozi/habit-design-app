/**
 * useVoiceInput.ts Redフェーズ追加テスト
 * TASK-0019: 音声入力UI実装
 *
 * 追加テストケース（未実装機能の検証）:
 * - TC-1.2: startListening で lang/continuous/interimResults が正しく設定される
 * - TC-1.3: onresult 発火で transcript が更新される
 * - TC-1.4: onend 発火で isListening=false に戻る
 * - TC-2.2: onerror 発火で isListening=false に戻る
 * - TC-2.3: unmount 時に recognition.stop() が呼ばれる
 * - TC-3.1: 空の認識結果でも transcript='' で安定する
 *
 * 🔵 信頼性レベル: REQ-401・architecture.md 音声入力制約・note.md 注意事項より
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVoiceInput } from '@/hooks/useVoiceInput'

// ── ヘルパー: MockSpeechRecognition ────────────────────────────────────────
type MockInstance = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  onresult: ((event: { results: unknown[][] }) => void) | null
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
}

let mockInstance: MockInstance

function createMockSR() {
  const MockSR = function (this: MockInstance) {
    this.lang = ''
    this.continuous = false
    this.interimResults = false
    this.start = vi.fn()
    this.stop = vi.fn()
    this.onresult = null
    this.onend = null
    this.onerror = null
    mockInstance = this
  }
  return MockSR
}

describe('useVoiceInput — Redフェーズ追加テスト', () => {
  beforeEach(() => {
    // 【テスト前準備】: 各テストで新しいモックインスタンスが生成されるよう初期化
    // 【環境初期化】: 前テストのスタブが残らないよう毎回クリア
    vi.stubGlobal('SpeechRecognition', undefined)
    vi.stubGlobal('webkitSpeechRecognition', undefined)
  })

  afterEach(() => {
    // 【テスト後処理】: グローバルのスタブを全て解除して次テストの影響を排除
    vi.unstubAllGlobals()
  })

  // ── TC-1.2 ──────────────────────────────────────────────────────────────
  it('startListening 呼び出し時に lang=ja-JP, continuous=false, interimResults=false が設定される', () => {
    // 【テスト目的】: Web Speech API の初期化パラメータが仕様通りに設定されることを確認
    // 【テスト内容】: startListening() を呼んだ後にモックインスタンスの設定値を検証
    // 【期待される動作】: lang='ja-JP', continuous=false, interimResults=false が設定される
    // 🔵 信頼性レベル: note.md 注意事項「recognition.lang = 'ja-JP'」より

    // 【テストデータ準備】: webkitSpeechRecognition をモックでスタブする
    // 【初期条件設定】: Chrome 相当の対応ブラウザをシミュレート
    vi.stubGlobal('webkitSpeechRecognition', createMockSR())

    const { result } = renderHook(() => useVoiceInput())

    // 【実際の処理実行】: startListening を呼び出す
    // 【処理内容】: 新しい SpeechRecognition インスタンスが生成され設定される
    act(() => {
      result.current.startListening()
    })

    // 【結果検証】: 各設定値が正しいことを確認
    // 【期待値確認】: note.md で明記された設定値と一致すること
    expect(mockInstance.lang).toBe('ja-JP') // 【確認内容】: 日本語認識が設定されている 🔵
    expect(mockInstance.continuous).toBe(false) // 【確認内容】: 連続認識がオフ 🔵
    expect(mockInstance.interimResults).toBe(false) // 【確認内容】: 中間結果がオフ 🔵
    expect(mockInstance.start).toHaveBeenCalledTimes(1) // 【確認内容】: start() が1回だけ呼ばれた 🔵
  })

  // ── TC-1.3 ──────────────────────────────────────────────────────────────
  it('onresult イベント発火で transcript が認識テキストに更新される', () => {
    // 【テスト目的】: 音声認識結果が transcript state に正しく反映されることを確認
    // 【テスト内容】: onresult イベントに認識結果を渡し、transcript が更新されることを検証
    // 【期待される動作】: results[0][0].transcript の値が transcript state に入る
    // 🔵 信頼性レベル: REQ-401・既存実装 event.results[0]?.[0]?.transcript より

    // 【テストデータ準備】: 認識結果を模倣したオブジェクトを用意
    vi.stubGlobal('webkitSpeechRecognition', createMockSR())

    const { result } = renderHook(() => useVoiceInput())

    // 【初期条件設定】: startListening を呼んで onresult ハンドラを登録する
    act(() => {
      result.current.startListening()
    })

    // 【実際の処理実行】: onresult イベントを手動発火させる
    // 【処理内容】: 日本語音声入力の典型的な認識結果オブジェクトを渡す
    act(() => {
      if (mockInstance.onresult) {
        mockInstance.onresult({
          results: [[{ transcript: '今日は早起き達成', confidence: 0.95 }]],
        })
      }
    })

    // 【結果検証】: transcript state が更新されていることを確認
    // 【期待値確認】: onresult ハンドラが results[0][0].transcript を取り出していること
    expect(result.current.transcript).toBe('今日は早起き達成') // 【確認内容】: 認識テキストが state に反映 🔵
  })

  // ── TC-1.4 ──────────────────────────────────────────────────────────────
  it('onend イベント発火で isListening が false に戻る', () => {
    // 【テスト目的】: 音声認識終了後に録音フラグが正しくリセットされることを確認
    // 【テスト内容】: startListening 後に onend を手動発火させ、isListening が false になる
    // 【期待される動作】: 認識セッション終了後は isListening=false に戻る
    // 🔵 信頼性レベル: 既存実装 recognition.onend ハンドラより

    vi.stubGlobal('webkitSpeechRecognition', createMockSR())

    const { result } = renderHook(() => useVoiceInput())

    // 【初期条件設定】: 録音を開始して isListening=true の状態にする
    act(() => {
      result.current.startListening()
    })
    expect(result.current.isListening).toBe(true) // 前提確認

    // 【実際の処理実行】: onend イベントを手動発火
    // 【処理内容】: 認識エンジンが自動終了したケースを模倣
    act(() => {
      if (mockInstance.onend) {
        mockInstance.onend()
      }
    })

    // 【結果検証】: isListening が false になっていることを確認
    // 【期待値確認】: 認識終了後はボタンが録音状態から抜けること
    expect(result.current.isListening).toBe(false) // 【確認内容】: onend 後に録音フラグがリセット 🔵
  })

  // ── TC-2.2 ──────────────────────────────────────────────────────────────
  it('onerror イベント発火（not-allowed）で isListening が false にリセットされる', () => {
    // 【テスト目的】: マイク権限拒否などのエラー時に録音フラグがリセットされることを確認
    // 【テスト内容】: startListening 後に onerror を発火し、isListening が false に戻るか検証
    // 【期待される動作】: エラー後もUIがロックされず、ボタンが再度押せる状態になる
    // 🟡 信頼性レベル: requirements.md §4.3（マイク権限拒否）より

    vi.stubGlobal('webkitSpeechRecognition', createMockSR())

    const { result } = renderHook(() => useVoiceInput())

    // 【初期条件設定】: 録音を開始する
    act(() => {
      result.current.startListening()
    })
    expect(result.current.isListening).toBe(true) // 前提確認

    // 【実際の処理実行】: onerror イベントを手動発火（権限拒否エラー）
    // 【処理内容】: ブラウザがマイクアクセスを拒否したケースを模倣
    act(() => {
      if (mockInstance.onerror) {
        mockInstance.onerror({ error: 'not-allowed' })
      }
    })

    // 【結果検証】: エラー後に isListening が false になっていること
    // 【期待値確認】: エラーリカバリー後にユーザーが操作を続けられること
    expect(result.current.isListening).toBe(false) // 【確認内容】: エラー後に録音フラグがリセット 🟡
  })

  // ── TC-2.3 ──────────────────────────────────────────────────────────────
  it('録音中に unmount されると recognition.stop() が呼ばれる', () => {
    // 【テスト目的】: コンポーネント unmount 時にマイクリソースが確実に解放されることを確認
    // 【テスト内容】: startListening 後に unmount し、mockStop が呼ばれることを検証
    // 【期待される動作】: メモリ・権限リークなしにクリーンアップされる
    // 🔵 信頼性レベル: note.md 注意事項「recognition.stop() を呼んでリソース開放」より

    vi.stubGlobal('webkitSpeechRecognition', createMockSR())

    const { result, unmount } = renderHook(() => useVoiceInput())

    // 【初期条件設定】: 録音を開始する
    act(() => {
      result.current.startListening()
    })

    // 【実際の処理実行】: コンポーネントを unmount する
    // 【処理内容】: ページ遷移やモーダルクローズを模倣
    act(() => {
      unmount()
    })

    // 【結果検証】: stop() が呼ばれてリソースが解放されたことを確認
    // 【期待値確認】: useEffect のクリーンアップで stop() が必ず呼ばれること
    expect(mockInstance.stop).toHaveBeenCalled() // 【確認内容】: unmount 時に stop() が呼ばれた 🔵
  })

  // ── TC-3.1 ──────────────────────────────────────────────────────────────
  it('onresult の results が空配列でも transcript が空文字のまま安定する', () => {
    // 【テスト目的】: 無音や極端に短い発話で results が空の場合でも例外が起きないことを確認
    // 【テスト内容】: onresult に空配列を渡し、transcript が空文字を維持し例外が出ないことを検証
    // 【期待される動作】: オプショナルチェーン（??.）が正しく機能し transcript='' を維持
    // 🟡 信頼性レベル: 既存実装 event.results[0]?.[0]?.transcript ?? '' の挙動から推測

    vi.stubGlobal('webkitSpeechRecognition', createMockSR())

    const { result } = renderHook(() => useVoiceInput())

    act(() => {
      result.current.startListening()
    })

    // 【実際の処理実行】: 空の results 配列で onresult を発火
    // 【処理内容】: 無音状態での認識結果を模倣
    act(() => {
      if (mockInstance.onresult) {
        mockInstance.onresult({ results: [[]] })
      }
    })

    // 【結果検証】: transcript が空文字のままであることを確認
    // 【期待値確認】: nullish coalescing により '' が維持される
    expect(result.current.transcript).toBe('') // 【確認内容】: 空結果でも transcript='' で安定 🟡
  })
})
