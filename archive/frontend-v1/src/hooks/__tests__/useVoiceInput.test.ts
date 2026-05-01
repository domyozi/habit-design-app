/**
 * useVoiceInput.ts テスト
 * TASK-0019: 音声入力UI実装
 *
 * テストケース:
 * 1. Web Speech API非対応時 isSupported=false
 * 2. webkitSpeechRecognition がある場合 isSupported=true
 * 3. startListening で isListening=true になる
 * 4. stopListening で isListening=false になる
 *
 * 🔵 信頼性レベル: REQ-401・architecture.md 音声入力制約より
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVoiceInput } from '@/hooks/useVoiceInput'

describe('useVoiceInput', () => {
  beforeEach(() => {
    // jsdom にはデフォルトで SpeechRecognition がない
    vi.stubGlobal('SpeechRecognition', undefined)
    vi.stubGlobal('webkitSpeechRecognition', undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /**
   * テストケース1: Web Speech API非対応時 isSupported=false
   * Given: SpeechRecognition が window に存在しない
   * When: useVoiceInput を呼び出す
   * Then: isSupported が false になる
   * 🔵 architecture.md 音声入力制約より
   */
  it('Web Speech API非対応時 isSupported=false', () => {
    const { result } = renderHook(() => useVoiceInput())
    expect(result.current.isSupported).toBe(false)
  })

  /**
   * テストケース2: webkitSpeechRecognition がある場合 isSupported=true
   * Given: webkitSpeechRecognition が window に存在する
   * When: useVoiceInput を呼び出す
   * Then: isSupported が true になる
   * 🔵 REQ-401 より
   */
  it('webkitSpeechRecognition がある場合 isSupported=true', () => {
    function MockSR(this: Record<string, unknown>) {
      this.lang = ''
      this.continuous = false
      this.interimResults = false
      this.start = vi.fn()
      this.stop = vi.fn()
      this.onresult = null
      this.onend = null
      this.onerror = null
    }
    vi.stubGlobal('webkitSpeechRecognition', MockSR)

    const { result } = renderHook(() => useVoiceInput())
    expect(result.current.isSupported).toBe(true)
  })

  /**
   * テストケース3: startListening で isListening=true になる
   * Given: webkitSpeechRecognition が利用可能
   * When: startListening を呼び出す
   * Then: isListening が true になる
   * 🔵 REQ-401 より
   */
  it('startListening で isListening=true になる', () => {
    const mockStart = vi.fn()
    function MockSR(this: Record<string, unknown>) {
      this.lang = ''
      this.continuous = false
      this.interimResults = false
      this.start = mockStart
      this.stop = vi.fn()
      this.onresult = null
      this.onend = null
      this.onerror = null
    }
    vi.stubGlobal('webkitSpeechRecognition', MockSR)

    const { result } = renderHook(() => useVoiceInput())

    act(() => {
      result.current.startListening()
    })

    expect(result.current.isListening).toBe(true)
    expect(mockStart).toHaveBeenCalled()
  })

  /**
   * テストケース4: stopListening で isListening=false になる
   * Given: isListening=true の状態
   * When: stopListening を呼び出す
   * Then: isListening が false になる
   * 🔵 REQ-401 より
   */
  it('stopListening で isListening=false になる', () => {
    const mockStop = vi.fn()
    function MockSR(this: Record<string, unknown>) {
      this.lang = ''
      this.continuous = false
      this.interimResults = false
      this.start = vi.fn()
      this.stop = mockStop
      this.onresult = null
      this.onend = null
      this.onerror = null
    }
    vi.stubGlobal('webkitSpeechRecognition', MockSR)

    const { result } = renderHook(() => useVoiceInput())

    act(() => { result.current.startListening() })
    expect(result.current.isListening).toBe(true)

    act(() => { result.current.stopListening() })
    expect(result.current.isListening).toBe(false)
  })
})
