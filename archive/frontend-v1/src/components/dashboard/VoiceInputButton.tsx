/**
 * 音声入力ボタンコンポーネント
 * TASK-0019: 音声入力UI実装
 *
 * 機能:
 * - Web Speech API 対応ブラウザ: マイクボタンで音声認識開始/停止
 * - 非対応ブラウザ（Firefox/Safari）: テキスト入力フォールバック
 * - 録音中: animate-pulse + 赤色スタイル
 *
 * 🔵 信頼性レベル: REQ-401・NFR-201・architecture.md 音声入力制約より
 */
import { useState } from 'react'
import { Mic, MicOff } from 'lucide-react'

interface VoiceInputButtonProps {
  isSupported: boolean
  isListening: boolean
  onStartListening: () => void
  onStopListening: () => void
  onTranscript: (text: string) => void
}

export const VoiceInputButton = ({
  isSupported,
  isListening,
  onStartListening,
  onStopListening,
  onTranscript,
}: VoiceInputButtonProps) => {
  const [showFallback, setShowFallback] = useState(false)
  const [fallbackText, setFallbackText] = useState('')

  const handleClick = () => {
    if (!isSupported) {
      setShowFallback(true)
      return
    }
    if (isListening) {
      onStopListening()
    } else {
      onStartListening()
    }
  }

  const handleFallbackSubmit = () => {
    if (fallbackText.trim()) {
      onTranscript(fallbackText.trim())
      setFallbackText('')
      setShowFallback(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        aria-label="音声入力"
        className={[
          'flex h-12 w-12 items-center justify-center rounded-full transition-colors',
          isListening
            ? 'animate-pulse bg-red-500 text-white hover:bg-red-600'
            : 'bg-emerald-500 text-white hover:bg-emerald-600',
        ].join(' ')}
      >
        {isListening ? (
          <MicOff className="h-5 w-5" />
        ) : (
          <Mic className="h-5 w-5" />
        )}
      </button>

      {showFallback && (
        <div className="flex gap-2">
          <input
            type="text"
            value={fallbackText}
            onChange={e => setFallbackText(e.target.value)}
            placeholder="テキストを入力してください"
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
            onKeyDown={e => e.key === 'Enter' && handleFallbackSubmit()}
          />
          <button
            type="button"
            onClick={handleFallbackSubmit}
            className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
          >
            送信
          </button>
        </div>
      )}
    </div>
  )
}
