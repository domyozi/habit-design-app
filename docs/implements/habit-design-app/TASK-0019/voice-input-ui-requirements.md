# TDD要件定義書: 音声入力UI実装

- **機能名**: 音声入力UI実装（Web Speech API + テキスト入力フォールバック）
- **タスクID**: TASK-0019
- **要件名**: habit-design-app
- **出力ファイル**: `docs/implements/habit-design-app/TASK-0019/voice-input-ui-requirements.md`

---

## 信頼性レベル凡例

- 🔵 **青信号**: EARS要件定義書・設計文書を参考にしてほぼ推測していない
- 🟡 **黄信号**: EARS要件定義書・設計文書から妥当な推測
- 🔴 **赤信号**: EARS要件定義書・設計文書にない推測

---

## 1. 機能の概要（EARS要件定義書・設計文書ベース）

### 何をする機能か 🔵

- 🔵 ユーザーがダッシュボード上の「マイクボタン」をタップすることで、話した内容をブラウザの Web Speech API がテキストに変換し、バックエンドの `POST /voice-input` に送信する。
- 🔵 バックエンドが Claude API で意図を分類し、その結果に従ってチェックリスト更新 / ジャーナリング保存 / 日報保存 のいずれかを実行、UI は結果に応じたフィードバックを表示する。
- 🔵 AI が意図を分類できなかった場合（`type: unknown`）、モーダル内で「どの操作ですか？」という手動選択 UI を表示する（EDGE-003）。
- 🔵 Web Speech API 非対応ブラウザ（Firefox / Safari など）ではボタン押下時にテキスト入力フォームにフォールバックする。

### どのような問題を解決するか 🔵

- 🔵 「日々の習慣達成状況をいちいちチェックボックスで更新するのは面倒」というユーザーペインに対し、話すだけで複数習慣の達成/未達成を一括更新できる高速入力手段を提供する（ユーザーストーリー 2.2、REQ-401/402/403）。
- 🔵 ブラウザ互換性問題で音声入力が使えないユーザーにもテキスト入力経路を用意し、機能の利用可能性を維持する（architecture.md 音声入力制約）。

### 想定されるユーザー 🔵

- 🔵 忙しい社会人・自己改善志向のユーザーで、スマートフォンで片手操作しながら習慣を記録したい人（ユーザーストーリー 2.2、NFR-201）。
- 🔵 Chrome / Edge を利用するモバイルユーザー（音声入力の主ターゲット）、および Firefox / Safari を利用するユーザー（テキスト入力のフォールバック対象）。

### システム内での位置づけ 🔵

- 🔵 フロントエンド（React + Vite）のダッシュボード画面に属するコンポーネント。`VoiceInputButton` がエントリーポイント、`VoiceInputModal` が解析中・結果表示を担当し、`useVoiceInput` フックが Web Speech API のラッパーとなる。
- 🔵 バックエンド（FastAPI）の `POST /voice-input` と連携し、その先で Claude API による意図分類と Supabase への書き込みが行われる（dataflow.md §3）。

### 参照したEARS要件

- REQ-401（汎用音声→テキスト入力の提供）
- REQ-402（AIによる自動分類：journaling / daily_report / checklist / kpi_update）
- REQ-403（チェックリスト判定時の習慣完了ステータス更新）
- REQ-406（未達成習慣の理由入力欄）
- EDGE-003（AI判断不能時「どの操作ですか？」）
- NFR-201（モバイルレスポンシブ）

### 参照した設計文書

- `docs/design/habit-design-app/architecture.md` §「音声入力制約」、§「フロントエンドディレクトリ」
- `docs/design/habit-design-app/dataflow.md` §3「汎用音声入力 → AI自動分類」
- `docs/spec/habit-design-app/user-stories.md` §2.2
- `docs/tasks/habit-design-app/TASK-0019.md`

---

## 2. 入力・出力の仕様（EARS機能要件・TypeScript型定義ベース）

### 2.1 入力パラメータ

#### `useVoiceInput` フック 🔵

- 🔵 入力: なし（引数なしフック）
- 🔵 返り値:
  - `transcript: string` — 直近の音声認識結果テキスト
  - `isListening: boolean` — 録音中フラグ
  - `isSupported: boolean` — Web Speech API 対応可否
  - `startListening: () => void` — 録音開始
  - `stopListening: () => void` — 録音停止

#### `VoiceInputButton` コンポーネント 🔵

- 🔵 Props:
  - `isSupported: boolean`
  - `isListening: boolean`
  - `onStartListening: () => void`
  - `onStopListening: () => void`
  - `onTranscript: (text: string) => void` — 認識完了テキストまたはフォールバック入力テキストを親に通知

#### `VoiceInputModal` コンポーネント 🔵

- 🔵 Props:
  - `transcript: string` — 認識テキスト
  - `isAnalyzing: boolean` — バックエンド解析中フラグ
  - `result: VoiceResult | null` — API レスポンス
  - `onClose: () => void`
  - `onSelectAction: (action: 'checklist' | 'journaling' | 'daily_report') => void` — EDGE-003 時の手動選択

#### 送信リクエスト（`POST /voice-input`） 🔵

```ts
interface VoiceInputRequest {
  text: string;  // 🔵 音声→テキスト変換後（必須、空文字不可）
  date: string;  // 🔵 YYYY-MM-DD（必須）
}
```

- 🔵 制約: `text` は trim 後 1 文字以上（空送信を防ぐ）
- 🟡 制約: `date` は `YYYY-MM-DD` 形式。省略時は呼び出し側で当日を補う想定。

### 2.2 出力値

#### API レスポンス `VoiceInputResponse` 🔵

```ts
interface VoiceInputResponse {
  type: 'journaling' | 'daily_report' | 'checklist' | 'kpi_update' | 'unknown';
  updated_habits?: HabitLog[];
  failed_habits?: Array<{ habit_id: string; title: string }>;
  journal_entry?: JournalEntry;
}
```

- 🔵 `type === 'checklist'`: 習慣ログ更新結果（`updated_habits`, `failed_habits`）を返す。
- 🔵 `type === 'unknown'`: EDGE-003。UI は手動選択 UI を表示。
- 🔵 `type === 'journaling' | 'daily_report'`: ジャーナル/日報保存完了メッセージを表示。
- 🟡 `type === 'kpi_update'`: KPI 更新（本タスクでは表示メッセージのみ対応で十分、後続タスクで詳細化予定）。

#### UI 出力 🔵

- 🔵 録音中: マイクボタンが `animate-pulse` + 赤色スタイルに変化、アイコンが `MicOff` に切り替わる。
- 🔵 解析中: モーダル内にスピナー +「AIが解析中...」表示。
- 🔵 成功メッセージ:
  - `checklist`: 「習慣を更新しました」
  - `journaling`: 「ジャーナルに保存しました」
  - `daily_report`: 「日報を保存しました」
- 🔵 EDGE-003 表示: 「どの操作ですか？」+ 3 ボタン（チェックリスト / ジャーナル / 日報）。
- 🔵 非対応ブラウザ時: ボタン直下にテキスト入力フォームを表示し、Enter または「送信」で親にテキストを通知。

### 2.3 入出力の関係性 🔵

- 🔵 `useVoiceInput.transcript` が確定すると、親が `POST /voice-input` を呼び出し、`isAnalyzing = true` でモーダルにスピナー表示。
- 🔵 API 応答に応じて `result` が確定し、モーダル内の分岐表示が切り替わる。
- 🔵 EDGE-003（`unknown`）の場合、`onSelectAction` 経由で再度明示的なエンドポイント呼び出しに接続する余地を残す（本コンポーネントの責務はコールバック通知まで）。

### 2.4 データフロー

- 🔵 dataflow.md §3 に準拠：
  - ユーザー → React（ボタンタップ）
  - React → Web Speech API（開始）
  - Web Speech API → React（文字起こし）
  - React → FastAPI（`POST /voice-input`）
  - FastAPI → Claude API（意図分類）
  - Claude API → FastAPI → Supabase（分類に応じた書き込み）
  - FastAPI → React（結果 JSON）
  - React → ユーザー（結果表示 or EDGE-003 手動選択）

### 参照したEARS要件

- REQ-401, REQ-402, REQ-403, REQ-406, EDGE-003

### 参照した設計文書

- `docs/design/habit-design-app/interfaces.ts` の `VoiceInputRequest`, `VoiceInputResponse`, `HabitLog`
- `docs/design/habit-design-app/api-endpoints.md` §「POST /voice-input」
- `docs/design/habit-design-app/dataflow.md` §3

---

## 3. 制約条件（EARS非機能要件・アーキテクチャ設計ベース）

### 3.1 パフォーマンス要件

- 🟡 AI 解析を待つ間のユーザー待機時間は 10 秒程度を上限とし、それ以上は体感的にストレスが大きい。スピナー表示で明示する（NFR-201 の快適性要件から推測）。
- 🟡 音声認識開始→録音中インジケータ表示までの UI 応答は 100ms 以内（一般的なインタラクション基準からの推測）。

### 3.2 セキュリティ要件 🔵

- 🔵 `POST /voice-input` は Supabase JWT 検証が必須（architecture.md §「認可フロー」）。送信側は Authorization ヘッダを付与する前提で axios クライアントを利用する。
- 🔵 Claude API へ送信するテキストに個人情報（氏名・メール等）を含めない（architecture.md §AI処理制約・REQ-303）。本コンポーネントは生テキストをそのまま送るのみで、フィルタリング責任はバックエンド側。
- 🔵 マイク権限はブラウザ標準のパーミッションフローに従う（ユーザ許諾後に認識開始）。

### 3.3 互換性要件 🔵

- 🔵 Web Speech API 対応ブラウザ: Chrome / Edge（architecture.md §音声入力制約）
- 🔵 非対応ブラウザ: Firefox / Safari → テキスト入力にフォールバック
- 🔵 判定は `'SpeechRecognition' in window || 'webkitSpeechRecognition' in window`
- 🔵 認識言語は `lang = 'ja-JP'` を使用

### 3.4 アーキテクチャ制約 🔵

- 🔵 ディレクトリ構造: `frontend/src/hooks/useVoiceInput.ts`, `frontend/src/components/dashboard/VoiceInputButton.tsx`, `frontend/src/components/dashboard/VoiceInputModal.tsx`（architecture.md §フロントエンドディレクトリ）
- 🔵 TypeScript strict mode 前提
- 🔵 パスエイリアス `@/` を使用
- 🔵 Vitest + @testing-library/react によるテスト、`describe/it should ...` 命名

### 3.5 データベース制約 🔵

- 🔵 本コンポーネント自身は DB に直接アクセスしない（API 経由）。
- 🔵 結果の `HabitLog.input_method` は `'voice'` が設定される想定（`database-schema.sql`、interfaces.ts）。

### 3.6 API制約 🔵

- 🔵 エンドポイント: `POST /voice-input`
- 🔵 リクエスト: `{ text, date }`
- 🔵 レスポンス: `{ success: true, data: VoiceInputResponse }`（api-endpoints.md）
- 🔵 AI 利用不可時（EDGE-001）などのエラーケースは `success: false` 形式で返却される可能性があり、UI はエラーメッセージ表示にフォールバックする。

### 3.7 UI/UX 制約

- 🔵 録音中は `animate-pulse` + 赤色（TASK-0019 §UI/UX要件）
- 🔵 モバイル対応: スマートフォン片手操作を想定しマイクボタンは `h-12 w-12` 以上、モーダルは `sm:rounded-3xl` で底部シート型（NFR-201）
- 🟡 `prefers-reduced-motion` 対応としてパルスアニメーションを無効化する分岐を検討（frontend CLAUDE.md モーション実装方針から推測）
- 🔵 エラーメッセージ例: 「音声認識に対応していないブラウザです。テキスト入力してください」

### 参照したEARS要件

- NFR-201, REQ-303, REQ-401, REQ-402, REQ-403, EDGE-001, EDGE-003

### 参照した設計文書

- `docs/design/habit-design-app/architecture.md` §「認可フロー」「AI処理制約」「音声入力制約」「フロントエンドディレクトリ」
- `docs/design/habit-design-app/database-schema.sql`（`input_method` CHECK 制約）
- `docs/design/habit-design-app/api-endpoints.md` §「POST /voice-input」

---

## 4. 想定される使用例（EARS Edgeケース・データフローベース）

### 4.1 基本的な使用パターン 🔵

**パターン A: 対応ブラウザでのチェックリスト更新（REQ-401/402/403）**

1. ユーザーが Chrome でダッシュボードを開く。
2. マイクボタンをタップ → `useVoiceInput.startListening()` が呼ばれる。
3. ユーザーが「今日は早起き達成、筋トレはできなかった、英語30分やった」と話す。
4. `transcript` が確定 → 親が `POST /voice-input { text, date }` を送信。
5. モーダルがスピナー付きで表示される。
6. レスポンス `type=checklist` を受け取り、モーダルに「習慣を更新しました」と表示。
7. 未達成習慣があれば `failed_habits` を元に後続タスク（TASK-0016 未達成理由入力）へ遷移する。

**パターン B: ジャーナリング判定** 🔵

- ユーザーが「今日はモヤモヤしたけど前向きに頑張れた」と入力 → `type=journaling` → 「ジャーナルに保存しました」表示。

**パターン C: 日報判定** 🔵

- ユーザーが「今日やったのは〇〇、明日は△△」と入力 → `type=daily_report` → 「日報を保存しました」表示。

### 4.2 データフロー参照 🔵

- `dataflow.md` §3「汎用音声入力 → AI自動分類」のシーケンス図通り。

### 4.3 エッジケース

#### EDGE-003: AI判断不能 🔵

- 🔵 API が `type=unknown` を返した場合、モーダル内に「どの操作ですか？」表示 + 3 つの選択ボタン（チェックリスト / ジャーナル / 日報）を描画する。
- 🔵 選択結果は `onSelectAction(action)` で親に通知される。親側で適切な再投稿 or 別 API 呼び出しを行う（本タスクの責務外の詳細は後続タスク）。

#### 非対応ブラウザ 🔵

- 🔵 `isSupported === false` の場合、ボタンタップでテキスト入力フォームが表示される（VoiceInputButton にフォールバック UI 実装済み）。
- 🔵 メッセージ: 「音声認識に対応していないブラウザです。テキスト入力してください」

#### マイク権限拒否 🟡

- 🟡 `SpeechRecognitionErrorEvent.error === 'not-allowed'` を検出した場合、`isListening=false` に戻し、ユーザーに再許可を促す。MVP では静かに停止する実装で足りる（TASK 注意事項に明記無し、一般的挙動から推測）。

#### AI 利用不可（EDGE-001 相当） 🟡

- 🟡 `POST /voice-input` が `success: false, error: 'AI_UNAVAILABLE'` を返した場合、モーダルにエラーメッセージを表示してクローズ可能にする（EDGE-001 を音声入力に援用した推測）。

#### 認識結果が空文字 🟡

- 🟡 `transcript` が空文字の場合は `POST /voice-input` を呼ばずにユーザーへ再録音を促す（無駄な API 呼び出しを防ぐ推測）。

#### 録音中にコンポーネントが unmount される 🔵

- 🔵 `useVoiceInput` の `useEffect` クリーンアップで `recognition.stop()` を呼び、認識セッションを必ず閉じる（既存実装に準拠）。

### 4.4 エラーケース 🟡

- 🟡 Web Speech API の `onerror` ハンドラ呼び出し時: `isListening=false` にリセットし、ユーザーへの通知は最小限（MVP）。
- 🟡 axios ネットワークエラー: try/catch で拾い、モーダルに汎用エラーメッセージを表示。

### 参照したEARS要件

- EDGE-001（AI利用不可、援用）
- EDGE-003（AI判断不能）
- REQ-401, REQ-402, REQ-403, NFR-201

### 参照した設計文書

- `docs/design/habit-design-app/dataflow.md` §3
- `docs/design/habit-design-app/api-endpoints.md` §「POST /voice-input」
- `docs/tasks/habit-design-app/TASK-0019.md` §「注意事項」

---

## 5. EARS要件・設計文書との対応関係

- **参照したユーザストーリー**: `user-stories.md` §2.2（習慣データの自然言語入力）
- **参照した機能要件**:
  - REQ-401（汎用音声→テキスト入力）
  - REQ-402（AI自動分類）
  - REQ-403（チェックリスト判定時の習慣完了ステータス更新）
  - REQ-406（未達成理由入力欄の起点）
- **参照した非機能要件**:
  - NFR-201（モバイルレスポンシブ）
  - REQ-303（AI処理時の個人情報保護。セキュリティ要件として援用）
- **参照したEdgeケース**:
  - EDGE-003（AI判断不能時の手動選択）
  - EDGE-001（AI利用不可時のエラー、援用）
- **参照した受け入れ基準**:
  - TASK-0019 完了条件:
    1. 音声入力で習慣が自動チェックされる（REQ-403）
    2. 非対応ブラウザでテキスト入力に切り替わる
    3. AI判断不能時に手動選択 UI が表示される（EDGE-003）
    4. モバイルで音声入力が動作する（NFR-201）
- **参照した設計文書**:
  - **アーキテクチャ**: `docs/design/habit-design-app/architecture.md` §「音声入力制約」「フロントエンドディレクトリ」「認可フロー」「AI処理制約」
  - **データフロー**: `docs/design/habit-design-app/dataflow.md` §3「汎用音声入力 → AI自動分類」
  - **型定義**: `docs/design/habit-design-app/interfaces.ts` の `VoiceInputRequest` / `VoiceInputResponse` / `HabitLog`
  - **データベース**: `docs/design/habit-design-app/database-schema.sql`（`habit_logs.input_method` CHECK 制約）
  - **API仕様**: `docs/design/habit-design-app/api-endpoints.md` §「POST /voice-input」
  - **既存実装**:
    - `frontend/src/hooks/useVoiceInput.ts`
    - `frontend/src/components/dashboard/VoiceInputButton.tsx`
    - `frontend/src/components/dashboard/VoiceInputModal.tsx`
    - `frontend/src/hooks/__tests__/useVoiceInput.test.ts`
    - `frontend/src/components/dashboard/__tests__/VoiceInputButton.test.tsx`
    - `frontend/src/components/dashboard/__tests__/VoiceInputModal.test.tsx`

---

## 信頼性レベルサマリー

本要件定義書内の主要判断項目の内訳：

- 🔵 青信号: 約 34 項目（約 85%）
- 🟡 黄信号: 約 6 項目（約 15%）
- 🔴 赤信号: 0 項目（0%）

**品質評価: 高品質**

- 要件の曖昧さ: なし（EARS 要件・設計文書・既存実装と整合）
- 入出力定義: 完全（TypeScript 型で網羅）
- 制約条件: 明確（ブラウザ互換・認可・モバイル UX を明記）
- 実装可能性: 確実（既存雛形が存在し、残タスクはテスト強化と統合のみ）

---

## 次のステップ候補

1. `/tsumiki:tdd-testcases habit-design-app TASK-0019` — テストケースの洗い出し
2. `/tsumiki:tdd-red habit-design-app TASK-0019` — 失敗するテストを先に作成
3. `/tsumiki:tdd-green habit-design-app TASK-0019` — 最小実装でテストを通す
4. `/tsumiki:tdd-refactor habit-design-app TASK-0019` — リファクタリング
5. `/tsumiki:tdd-verify-complete habit-design-app TASK-0019` — 品質確認
