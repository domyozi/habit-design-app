# TASK-0019 開発コンテキストノート

## 対象タスク

- **タスクID**: TASK-0019
- **機能名**: 音声入力UI実装（Web Speech API + テキスト入力フォールバック）
- **要件名**: habit-design-app
- **フェーズ**: Phase 3 - フロントエンド実装
- **関連要件**: REQ-401, REQ-402, REQ-403, EDGE-003, NFR-201

## 技術スタック

- **フレームワーク**: React 18 + Vite
- **言語**: TypeScript（strict mode）
- **スタイリング**: Tailwind CSS v3
- **状態管理**: Zustand v4 / TanStack Query v5
- **HTTP**: axios
- **テスト**: Vitest + @testing-library/react
- **Visual Review**: Playwright
- **ブラウザAPI**: Web Speech API（`webkitSpeechRecognition` / `SpeechRecognition`）
- **アイコン**: lucide-react（`Mic`, `MicOff`）

## 開発ルール

- `frontend/` は Codex 管轄だが TDD スキルでは対象として扱う（note.md は参考）
- コンポーネントは `frontend/src/components/` 配下に配置
- カスタムフックは `frontend/src/hooks/` 配下に配置
- テストファイルは隣接する `__tests__/` 配下に置く
- `describe('ComponentName', () => { it('should ...', () => { }) })` 形式
- `prefers-reduced-motion` 対応を意識する
- パスエイリアス `@/` は `src/` にマッピング
- `npx tsc --noEmit`, `npm run lint`, `npm run test:visual` で検証

## 関連実装（既存コード）

既に雛形実装が存在する：

- `frontend/src/hooks/useVoiceInput.ts` ... Web Speech APIフック
- `frontend/src/components/dashboard/VoiceInputButton.tsx` ... 音声入力ボタン + フォールバック
- `frontend/src/components/dashboard/VoiceInputModal.tsx` ... 解析中・結果表示モーダル
- `frontend/src/hooks/__tests__/useVoiceInput.test.ts` ... フック単体テスト
- `frontend/src/components/dashboard/__tests__/VoiceInputButton.test.tsx`
- `frontend/src/components/dashboard/__tests__/VoiceInputModal.test.tsx`

## 設計文書

- `docs/spec/habit-design-app/requirements.md`
  - REQ-401（汎用音声→テキスト入力）
  - REQ-402（AIによる自動分類：journaling/daily_report/checklist/kpi_update）
  - REQ-403（チェックリスト判定時のステータス更新）
  - EDGE-003（AI判断不能時「どの操作ですか？」）
  - NFR-201（モバイルレスポンシブ）
- `docs/design/habit-design-app/architecture.md` §音声入力制約
  - Web Speech API は Chrome / Edge のみ対応
  - Firefox / Safari は未対応、テキスト入力にフォールバック
- `docs/design/habit-design-app/dataflow.md` §3 汎用音声入力 → AI自動分類
- `docs/design/habit-design-app/api-endpoints.md` §POST /voice-input
- `docs/design/habit-design-app/interfaces.ts`
  - `VoiceInputRequest { text, date }`
  - `VoiceInputResponse { type, updated_habits?, failed_habits?, journal_entry? }`
- `frontend/src/types/interfaces.ts`（フロント側コピー）

## データモデル

```ts
// VoiceInputRequest
{ text: string; date: string }

// VoiceInputResponse
{
  type: 'journaling' | 'daily_report' | 'checklist' | 'kpi_update' | 'unknown';
  updated_habits?: HabitLog[];
  failed_habits?: Array<{ habit_id: string; title: string }>;
  journal_entry?: JournalEntry;
}
```

## 注意事項

- 非対応ブラウザ検出は `'SpeechRecognition' in window || 'webkitSpeechRecognition' in window`
- `recognition.lang = 'ja-JP'`
- `recognition.continuous = false`, `recognition.interimResults = false`
- 録音中は `animate-pulse` + 赤色スタイル
- AI解析中はスピナー + 「AIが解析中...」表示
- `type === 'unknown'` の場合は手動選択UI（チェックリスト / ジャーナル / 日報）
- コンポーネント unmount 時には `recognition.stop()` を呼んでリソース開放
- モバイルでタップしやすいよう、ボタンは十分なサイズ（`h-12 w-12` 以上）
- Claude API に送信するテキストに個人情報を含めない（架橋責任はバックエンド側）
