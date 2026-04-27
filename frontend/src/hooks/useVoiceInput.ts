/**
 * useVoiceInput.ts
 * TASK-0019: 音声入力UI実装
 *
 * 機能:
 * - Web Speech API (SpeechRecognition / webkitSpeechRecognition) の有無を検出
 * - startListening / stopListening で音声認識を制御
 * - lang: 'ja-JP' で日本語認識
 * - 非対応ブラウザでは isSupported=false を返す
 *
 * 🔵 信頼性レベル: REQ-401・architecture.md 音声入力制約より
 */
import { useState, useRef, useCallback, useEffect } from 'react'

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

interface SpeechRecognitionInstance {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionResultList {
  readonly length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionResult {
  readonly length: number
  item(index: number): SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
  readonly isFinal: boolean
}

interface SpeechRecognitionAlternative {
  readonly transcript: string
  readonly confidence: number
}

interface SpeechRecognitionErrorEvent {
  error: string
}

const getSpeechRecognition = (): SpeechRecognitionConstructor | null => {
  if (typeof window === 'undefined') return null
  return (
    (window as unknown as Record<string, unknown>)['SpeechRecognition'] as SpeechRecognitionConstructor ||
    (window as unknown as Record<string, unknown>)['webkitSpeechRecognition'] as SpeechRecognitionConstructor ||
    null
  )
}

export function useVoiceInput() {
  const [transcript, setTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isSupported] = useState<boolean>(() => getSpeechRecognition() !== null)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    }
  }, [])

  const startListening = useCallback(() => {
    const SpeechRecognitionClass = getSpeechRecognition()
    if (!SpeechRecognitionClass) return

    const recognition = new SpeechRecognitionClass()
    recognition.lang = 'ja-JP'
    recognition.continuous = false
    recognition.interimResults = false

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const text = event.results[0]?.[0]?.transcript ?? ''
      setTranscript(text)
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognition.onerror = () => {
      setIsListening(false)
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setIsListening(false)
  }, [])

  return { transcript, isListening, isSupported, startListening, stopListening }
}
