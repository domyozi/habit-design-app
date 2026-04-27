# TASK-0019: 音声入力UI実装 - TDD開発ノート

**タスクID**: TASK-0019  
**機能名**: voice-input-ui  
**要件名**: 音声入力UI実装（Web Speech API + テキスト入力フォールバック）  
**信頼性レベル**: 🔵 (100%)  
**生成日**: 2026-04-15

---

## 1. 技術スタック

### フロントエンド
- **フレームワーク**: React 18 + Vite + TypeScript
- **スタイリング**: Tailwind CSS v3
- **テスト**: Vitest + React Testing Library + Playwright
- **HTTP**: axios + TanStack Query
- **アイコン**: lucide-react (`Mic` アイコン使用)
- **フォーム**: React Hook Form

### Web Speech API
- **ブラウザ対応**: Chrome/Edge のみ (`webkitSpeechRecognition` / `SpeechRecognition`)
- **非対応ブラウザ**: Firefox/Safari → テキスト入力フォールバック
- **言語設定**: `ja-JP` (日本語)

### バックエンド
- **フロントエンド連携**: FastAPI POST `/api/voice-input`
- **AI分類**: Claude API (anthropic SDK)
- **認証**: Supabase JWT

**参照元**: 
- `docs/design/habit-design-app/architecture.md`
- `docs/spec/habit-design-app/requirements.md`
- `frontend/CLAUDE.md`
- `backend/CLAUDE.md`

---

## 2. 開発ルール

### フロントエンド開発規約
- **テスト命名**: `describe('ComponentName', () => { it('should ...', () => {...}) })`
- **パスエイリアス**: `@/` → `src/`
- **ディレクトリ構成**:
  - UIコンポーネント: `frontend/src/components/dashboard/`
  - カスタムフック: `frontend/src/hooks/`
  - テスト: `__tests__/` サブディレクトリ（コンポーネント同階層）
- **型定義**: `frontend/src/types/interfaces.ts`

### テスト実行コマンド
```bash
# ユニットテスト
npm run test

# ユニットテスト（Watch モード）
npm run test:watch

# Visual review（Playwright）
npm run test:visual

# Visual review baseline 更新
npm run test:visual:update
```

### API実装前ルール
**実装前に必ず読む**:
- `docs/design/habit-design-app/api-endpoints.md`
- `docs/design/habit-design-app/interfaces.ts`
- `docs/design/habit-design-app/dataflow.md`
- `docs/spec/habit-design-app/requirements.md`

### Web Speech API 実装ルール
- **サポート判定**: `'webkitSpeechRecognition' in window || 'SpeechRecognition' in window`
- **言語**: `recognizer.lang = 'ja-JP'`
- **連続認識**: `recognizer.continuous = true`
- **暫定結果表示**: `recognizer.interimResults = true`
- **非対応ブラウザ**: テキスト入力モーダルに自動切り替え（EDGE-002: architecture.md）

**参照元**:
- `docs/spec/habit-design-app/requirements.md` (REQ-401/402/403)
- `docs/design/habit-design-app/architecture.md` (音声入力制約)
- `docs/tasks/habit-design-app/TASK-0019.md` (注意事項)

---

## 3. 関連実装

### 既存コンポーネント構成
- **VoiceInputButton**: マイクアイコンボタン（テキストフォールバック搭載）
- **VoiceInputModal**: 認識テキスト・AI解析結果表示モーダル
- **useVoiceInput フック**: Web Speech API操作・状態管理

### 類似機能のパターン

#### HabitCheckbox テスト (TASK-0015 実装)
- **ファイル**: `frontend/src/components/habits/__tests__/HabitCheckbox.test.tsx`
- **パターン**: チェック状態変更 → コールバック呼び出し → API呼び出し
- **特徴**: 状態管理・非同期処理・エラーハンドリング

#### FailureReasonInput テスト (TASK-0016 実装)
- **ファイル**: `frontend/src/components/habits/__tests__/FailureReasonInput.test.tsx`
- **パターン**: textarea 入力 → 送信 → コールバック
- **特徴**: 任意入力フォーム・バリデーション

#### useSSEStream フック (TASK-0010 実装)
- **ファイル**: `frontend/src/hooks/__tests__/useSSEStream.test.ts`
- **パターン**: API ストリーミング → リアルタイム更新 → エラーハンドリング
- **特徴**: Server-Sent Events で AI フィードバック取得

**参照元**:
- `frontend/src/components/habits/__tests__/`
- `frontend/src/hooks/__tests__/`

### API実装パターン

#### POST /api/voice-input エンドポイント
**実装**: `backend/app/api/routes/voice_input.py`

**処理フロー**:
1. ユーザーの有効習慣取得
2. Claude API で入力テキスト分類（`classify_voice_input`）
3. 分類結果に応じた後処理:
   - `checklist` → 習慣ログ更新 + ストリーク・バッジ更新
   - `journaling`/`daily_report`/`kpi_update` → journal_entries に保存
   - `unknown` (EDGE-003) → メッセージのみ返却（DBには保存しない）
4. AI障害時 (EDGE-001) → 503 `AI_UNAVAILABLE` 返却

**レスポンス形式**:
```typescript
APIResponse {
  success: boolean,
  data: {
    type: 'checklist' | 'journaling' | 'daily_report' | 'kpi_update' | 'unknown',
    updated_habits?: HabitLog[],
    journal_entry?: JournalEntry,
    message?: string
  }
}
```

**参照元**:
- `backend/app/api/routes/voice_input.py`
- `docs/design/habit-design-app/api-endpoints.md`
- `docs/design/habit-design-app/interfaces.ts`

---

## 4. 設計文書

### 要件定義
- **REQ-401**: ユーザーが自由に音声（テキスト変換後）を入力できるUI 🔵
- **REQ-402**: 音声入力をAIで自動分類 🔵
- **REQ-403**: チェックリスト判定時に習慣ログを自動更新 🔵
- **REQ-404**: チェックボックス形式でルーティンを手動完了登録 🔵
- **EDGE-003**: AI判断不能時（type='unknown'）にユーザーに手動選択を促す 🔵
- **NFR-201**: モバイルでの音声入力が動作すること 🔵

**参照元**: `docs/spec/habit-design-app/requirements.md`

### ユーザーストーリー
**ストーリー 2.2: 音声で日報を報告する** 🔵
- **私は**: 移動中のビジネスパーソン
- **として**: 音声で今日の習慣達成状況を報告したい
- **そうすることで**: タイピングなしに記録を残せる

**関連要件**: REQ-401, REQ-402, REQ-403

**参照元**: `docs/spec/habit-design-app/user-stories.md` (ストーリー 2.2)

### ダッシュボード画面仕様
**画面項目** (TASK-0014 実装済み):
- 今日の習慣チェックリスト
- 各習慣のストリーク表示（「🔥N日連続」）
- 週次統計サマリー
- バッジ獲得通知

**TASK-0019 での追加**:
- マイクボタン（lucide-react `Mic` アイコン）
  - 録音中: `animate-pulse` + 赤色
  - 非対応ブラウザ: テキスト入力モーダルに切り替え

**参照元**: `docs/dev/screen-specs/dashboard.md`

### アーキテクチャ設計
**システム概要**: Python/FastAPI バックエンド + React/Vite フロントエンド分離構成

**音声入力制約** (TASK-0019 の重要設計):
- Web Speech API は Chrome/Edge のみ対応
- Firefox/Safari は必ずテキスト入力にフォールバック（EDGE-002）
- AI障害時 (EDGE-001) は通常のトラッキング機能で継続可能

**レイヤードアーキテクチャ**:
- フロントエンド: React + Vite (Vercel)
- バックエンド: FastAPI (Railway)
- DB: Supabase PostgreSQL (RLS有効)
- 外部: Claude API, Resend メール

**参照元**: `docs/design/habit-design-app/architecture.md`

### データ型定義
```typescript
// VoiceInputRequest (フロント → バック)
interface VoiceInputRequest {
  text: string,        // 音声認識テキスト
  date: string         // YYYY-MM-DD 形式
}

// VoiceInputResult (バック → フロント)
interface VoiceInputResult {
  type: 'checklist' | 'journaling' | 'daily_report' | 'kpi_update' | 'unknown',
  updated_habits?: HabitLog[],
  journal_entry?: JournalEntry,
  message?: string
}

// Habit 型
interface Habit {
  id: string,
  user_id: string,
  goal_id: string | null,
  title: string,
  description: string | null,
  frequency: HabitFrequency,
  scheduled_time: string | null,
  display_order: number,
  current_streak: number,
  longest_streak: number,
  is_active: boolean,
  created_at: string,
  updated_at: string,
  goal?: Goal,
  today_log?: HabitLog | null
}

// HabitLog 型
interface HabitLog {
  id: string,
  habit_id: string,
  user_id: string,
  log_date: string,       // YYYY-MM-DD
  completed: boolean,
  completed_at: string | null,
  input_method: 'manual' | 'voice' | 'auto' | null,
  created_at: string,
  failure_reason?: FailureReason | null
}
```

**参照元**: `docs/design/habit-design-app/interfaces.ts`

---

## 5. テスト関連情報

### テストフレームワーク設定

**Vitest 設定ファイル**: `frontend/vite.config.ts`
```typescript
test: {
  globals: true,
  environment: 'jsdom',
  setupFiles: ['./src/test/setup.ts'],
  css: false,
  exclude: ['node_modules', 'tests/visual/**']
}
```

**テストセットアップ**: `frontend/src/test/setup.ts`
- `@testing-library/jest-dom` インポート

### テストファイル命名・ディレクトリ構成

```
frontend/src/
├── components/
│   └── dashboard/
│       ├── VoiceInputButton.tsx
│       ├── VoiceInputModal.tsx
│       └── __tests__/
│           ├── VoiceInputButton.test.tsx
│           └── VoiceInputModal.test.tsx
└── hooks/
    ├── useVoiceInput.ts
    └── __tests__/
        └── useVoiceInput.test.ts
```

### 既存テストのパターン

#### useVoiceInput テスト (`frontend/src/hooks/__tests__/useVoiceInput.test.ts`)
**テストケース**:
1. Web Speech API非対応時 `isSupported=false`
2. `webkitSpeechRecognition` 存在時 `isSupported=true`
3. `startListening()` 呼び出し時 `isListening=true`
4. `stopListening()` 呼び出し時 `isListening=false`

**Mock パターン**:
```typescript
vi.stubGlobal('webkitSpeechRecognition', MockSR)
vi.unstubAllGlobals()
```

**参照元**: `frontend/src/hooks/__tests__/useVoiceInput.test.ts`

#### VoiceInputButton テスト (`frontend/src/components/dashboard/__tests__/VoiceInputButton.test.tsx`)
**テストケース**:
1. 非対応ブラウザ: テキスト入力フォーム表示
2. 対応ブラウザ: `onStartListening` コールバック
3. 録音中: `animate-pulse` クラス
4. テキスト送信: `onTranscript` コールバック

**Testing Library パターン**:
```typescript
render(<VoiceInputButton {...props} />)
fireEvent.click(screen.getByRole('button'))
expect(screen.getByRole('textbox')).toBeInTheDocument()
```

**参照元**: `frontend/src/components/dashboard/__tests__/VoiceInputButton.test.tsx`

#### VoiceInputModal テスト (`frontend/src/components/dashboard/__tests__/VoiceInputModal.test.tsx`)
**テストケース**:
1. 認識テキスト表示
2. AI解析中スピナー表示
3. `type='unknown'` 時の手動選択UI表示（EDGE-003）
4. `type='checklist'` 時の結果メッセージ
5. 閉じるボタン処理

**参照元**: `frontend/src/components/dashboard/__tests__/VoiceInputModal.test.tsx`

### Playwright (Visual Review) 設定

**設定ファイル**: `frontend/playwright.config.ts`
- **テストディレクトリ**: `tests/visual/`
- **テスト対象ブラウザ**: Desktop Chrome, iPhone 13
- **ビューポート**: 1440x1180 (Desktop), iPhone 13 (Mobile)
- **ウェブサーバー**: `npm run dev` (ポート 4173)
- **リポート**: HTML レポート (`playwright-report/`)

**実行コマンド**:
```bash
npm run test:visual              # Visual review 実行
npm run test:visual:update       # Baseline 更新
```

**参照元**: `frontend/playwright.config.ts`

### パッケージ依存情報

**テスト関連パッケージ**:
- `vitest@^4.1.4` - ユニットテストフレームワーク
- `@testing-library/react@^16.3.2` - React テストユーティリティ
- `@testing-library/jest-dom@^6.9.1` - Jest DOM マッチャー
- `@playwright/test@^1.55.0` - E2E/Visual テスト
- `jsdom@^29.0.2` - ブラウザ環境シミュレーション

**参照元**: `frontend/package.json`

---

## 6. 注意事項

### Web Speech API 実装の重要ポイント

1. **ブラウザ対応判定**:
   - `webkitSpeechRecognition` (Chrome/Edge)
   - `SpeechRecognition` (標準化API)
   - 両方チェックして、どちらも存在しなければ非対応

2. **言語設定**:
   - 必ず `recognizer.lang = 'ja-JP'` に設定
   - 日本語認識の精度向上

3. **非対応ブラウザ処理**:
   - Firefox/Safari ユーザーはテキスト入力フォーム表示
   - フォールバック UX が損なわれないよう配慮

4. **エラーハンドリング**:
   - 音声認識エラー → ユーザーへ通知
   - AI 分類エラー (503) → 通常のトラッキング機能継続（EDGE-001）
   - AI 判断不能 (unknown) → 手動選択UI 表示（EDGE-003）

**参照元**:
- `docs/tasks/habit-design-app/TASK-0019.md` (注意事項)
- `docs/design/habit-design-app/architecture.md` (音声入力制約)

### API 連携の要点

1. **リクエスト形式**:
   ```json
   {
     "text": "朝ランニングした",
     "date": "2026-04-15"
   }
   ```

2. **レスポンス処理**:
   - `type='checklist'` → 習慣更新メッセージ表示
   - `type='journaling'/'daily_report'/'kpi_update'` → 保存確認メッセージ
   - `type='unknown'` → 「どの操作ですか？」選択肢表示
   - 503 AI_UNAVAILABLE → エラーメッセージ + フォールバック案内

3. **モバイル対応**:
   - 大きなボタン（マイク）で操作性確保（NFR-201）
   - スマートフォンのマイク機能を想定

**参照元**:
- `backend/app/api/routes/voice_input.py`
- `docs/design/habit-design-app/api-endpoints.md`

### テスト実装の注意

1. **useVoiceInput フック**:
   - Global オブジェクト (`window`) のモック必須
   - `renderHook` で検証

2. **VoiceInputButton コンポーネント**:
   - `isSupported` prop で分岐テスト
   - テキスト入力フォーム表示を確認

3. **VoiceInputModal コンポーネント**:
   - AI 解析中の UI 状態確認
   - `type='unknown'` 時の手動選択 UI 確認（EDGE-003）

**参照元**:
- `frontend/src/hooks/__tests__/useVoiceInput.test.ts`
- `frontend/src/components/dashboard/__tests__/VoiceInputButton.test.tsx`
- `frontend/src/components/dashboard/__tests__/VoiceInputModal.test.tsx`

---

## 7. 関連タスク・依存関係

### 前提タスク
- **TASK-0015**: 習慣チェックリスト操作UI （完了 ✅）
  - チェックボックス UI パターン参照
- **TASK-0016**: 未達成理由入力 （完了 ✅）
  - テキスト入力フォーム パターン参照

### 後続タスク
- **TASK-0020**: 週次レビュー画面
  - TASK-0019 の音声入力結果を活用

### 同期開発タスク
- **TASK-0009**: 音声入力AI分類サービス実装 （完了 ✅）
  - `/api/voice-input` エンドポイント
- **TASK-0010**: Claude AI統合・SSEストリーミング （完了 ✅）
  - AI 分類ロジック
- **TASK-0012**: フロントエンド共通基盤 （完了 ✅）
  - API クライアント

**参照元**: `docs/tasks/habit-design-app/overview.md` (Phase 3 依存関係)

---

## 8. 実装チェックリスト

### TDD 開発フロー
```
1. /tsumiki:tdd-requirements TASK-0019     # 詳細要件整理
2. /tsumiki:tdd-testcases                   # テストケース定義
3. /tsumiki:tdd-red                         # テスト実装（Red）
4. /tsumiki:tdd-green                       # 最小実装（Green）
5. /tsumiki:tdd-refactor                    # リファクタリング（Refactor）
6. /tsumiki:tdd-verify-complete             # 品質確認
```

**参照元**: `docs/tasks/habit-design-app/TASK-0019.md` (実装手順)

### 完了条件チェック
- [ ] 音声入力で習慣が自動チェックされること（REQ-403）
- [ ] 非対応ブラウザでテキスト入力に切り替わること
- [ ] AI判断不能時に手動選択UIが表示されること（EDGE-003）
- [ ] モバイルでの音声入力が動作すること（NFR-201）

---

## 参考リンク

| 分類 | ファイルパス | 説明 |
|------|-------------|------|
| 要件 | `docs/spec/habit-design-app/requirements.md` | 機能要件（REQ-401/402/403） |
| 要件 | `docs/spec/habit-design-app/user-stories.md` | ユーザーストーリー |
| 設計 | `docs/design/habit-design-app/architecture.md` | システムアーキテクチャ・音声入力制約 |
| 設計 | `docs/design/habit-design-app/api-endpoints.md` | API エンドポイント仕様 |
| 設計 | `docs/design/habit-design-app/interfaces.ts` | TypeScript 型定義 |
| UI仕様 | `docs/dev/screen-specs/dashboard.md` | ダッシュボード画面仕様 |
| タスク | `docs/tasks/habit-design-app/TASK-0019.md` | タスク詳細 |
| 実装 | `backend/app/api/routes/voice_input.py` | POST /api/voice-input エンドポイント |
| 実装 | `frontend/src/hooks/useVoiceInput.ts` | Web Speech API フック |
| 実装 | `frontend/src/components/dashboard/VoiceInputButton.tsx` | マイクボタンコンポーネント |
| 実装 | `frontend/src/components/dashboard/VoiceInputModal.tsx` | AI分類結果モーダルコンポーネント |
| テスト | `frontend/src/hooks/__tests__/useVoiceInput.test.ts` | フック テストケース |
| テスト | `frontend/src/components/dashboard/__tests__/VoiceInputButton.test.tsx` | ボタン テストケース |
| テスト | `frontend/src/components/dashboard/__tests__/VoiceInputModal.test.tsx` | モーダル テストケース |
| ガイド | `frontend/CLAUDE.md` | フロントエンド開発ガイド |
| ガイド | `backend/CLAUDE.md` | バックエンド開発ガイド |
