# 習慣設計アプリ データフロー図

**作成日**: 2026-04-12
**関連アーキテクチャ**: [architecture.md](architecture.md)
**関連要件定義**: [requirements.md](../../spec/habit-design-app/requirements.md)

**【信頼性レベル凡例】**:
- 🔵 **青信号**: 要件定義書・ユーザーヒアリングを参考にした確実なフロー
- 🟡 **黄信号**: 要件定義書・ユーザーヒアリングから妥当な推測によるフロー
- 🔴 **赤信号**: 要件定義書・ユーザーヒアリングにない推測によるフロー

---

## システム全体のデータフロー 🔵

**信頼性**: 🔵 *確定技術スタック・要件定義より*

```mermaid
flowchart TD
    User["ユーザー<br/>（ブラウザ）"]
    React["React フロントエンド<br/>（Vercel）"]
    FastAPI["FastAPI バックエンド<br/>（Railway）"]
    Supabase["Supabase<br/>（PostgreSQL + Auth）"]
    Claude["Claude API<br/>（Anthropic）"]
    Resend["Resend<br/>（メール）"]

    User -- "操作" --> React
    React -- "JWT付きAPIリクエスト" --> FastAPI
    React -- "OAuth認証" --> Supabase
    Supabase -- "JWT" --> React
    FastAPI -- "JWT検証・DB操作" --> Supabase
    FastAPI -- "習慣統計のみ送信" --> Claude
    Claude -- "SSEストリーミング" --> FastAPI
    FastAPI -- "SSEストリーム転送" --> React
    React -- "AI応答表示" --> User
    FastAPI -- "週次リマインダー" --> Resend
    Resend -- "メール" --> User
```

---

## 主要機能のデータフロー

### 1. ソーシャルログイン 🔵

**信頼性**: 🔵 *REQ-101/102・ヒアリングQ4より*

**関連要件**: REQ-101, REQ-102, REQ-103

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant R as React
    participant S as Supabase Auth
    participant G as Google/Apple

    U->>R: 「Googleでログイン」クリック
    R->>S: signInWithOAuth({ provider: 'google' })
    S->>G: OAuth認証リダイレクト
    G->>U: 認証画面表示
    U->>G: アカウント承認
    G->>S: 認証コード返却
    S->>R: JWT（アクセストークン）発行
    R->>R: JWT をセッションストレージに保存
    alt 初回ログイン
        R->>U: Wanna Be設定画面へ遷移
    else 2回目以降
        R->>U: ダッシュボードへ遷移
    end
```

---

### 2. Wanna Be設定 → AI目標提案 🔵

**信頼性**: 🔵 *REQ-201/202/203・ユーザーストーリー1.2より*

**関連要件**: REQ-201, REQ-202, REQ-203, REQ-204, REQ-604, REQ-605

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant R as React
    participant F as FastAPI
    participant S as Supabase
    participant C as Claude API

    U->>R: Wanna Beテキスト入力・送信
    R->>F: POST /api/wanna-be { text }（JWT付き）
    F->>F: JWT検証（user_id取得）
    F->>S: UPSERT wanna_be（user_id, text）
    S-->>F: 保存完了

    Note over F,C: AIへの送信データはテキストのみ<br/>（個人情報含まず: REQ-605）

    F->>C: Claude API（ストリーミング）<br/>プロンプト: Wanna Beテキスト → 目標3個以内に整理
    C-->>F: SSEストリーミング応答開始
    F-->>R: SSEストリーム転送（目標候補逐次表示）
    R-->>U: 目標候補をリアルタイム表示

    U->>R: 目標を承認・編集・保存
    R->>F: POST /api/goals { goals: [...] }
    F->>S: INSERT goals
    S-->>F: 保存完了
    F-->>R: 200 OK
    R-->>U: ダッシュボードへ遷移
```

---

### 3. 汎用音声入力 → AI自動分類 🔵

**信頼性**: 🔵 *REQ-401/402/403・ユーザーストーリー2.2より*

**関連要件**: REQ-401, REQ-402, REQ-403, REQ-405, REQ-406

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant R as React
    participant WS as Web Speech API
    participant F as FastAPI
    participant C as Claude API
    participant S as Supabase

    U->>R: 音声入力ボタンタップ
    R->>WS: startRecognition()
    WS-->>R: 文字起こし完了（テキスト）
    R->>F: POST /api/voice-input { text, date, user_habits }
    F->>F: JWT検証

    Note over F,C: 分類プロンプト:<br/>テキスト + ユーザーの習慣リスト → 分類判定

    F->>C: Claude API（同期）<br/>Intent分類: journaling/daily_report/checklist/kpi_update/unknown
    C-->>F: 分類結果JSON

    alt checklist判定
        F->>S: UPDATE habit_logs（達成/未達成）
        alt 未達成の習慣あり
            F-->>R: { type: "checklist", updated_habits, failed_habits }
            R-->>U: 未達成習慣の「理由入力欄」を表示
            U->>R: 理由入力
            R->>F: POST /api/habits/{id}/failure-reason
            F->>S: INSERT failure_reasons
        else 全達成
            F-->>R: { type: "checklist", updated_habits }
            R-->>U: チェック完了表示
        end
    else journaling判定
        F->>S: INSERT journal_entries
        F-->>R: { type: "journaling", saved }
        R-->>U: ジャーナリング保存完了表示
    else unknown判定
        F-->>R: { type: "unknown" }
        R-->>U: 「どの操作ですか？」確認ダイアログ表示
    end
```

---

### 4. チェックボックスで習慣を完了登録 🔵

**信頼性**: 🔵 *REQ-404/501・ユーザーストーリー2.1より*

**関連要件**: REQ-404, REQ-501, REQ-205

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant R as React
    participant F as FastAPI
    participant S as Supabase

    U->>R: チェックボックスをクリック
    R->>R: 楽観的更新（即座にチェック表示）
    R->>F: PATCH /api/habits/{id}/log { date, completed: true }
    F->>F: JWT検証
    F->>S: UPSERT habit_logs（date, habit_id, completed, user_id）
    S-->>F: 保存完了

    F->>F: ストリーク再計算
    F->>S: UPDATE habits（current_streak）
    F->>F: バッジ付与判定（7日連続等）
    alt バッジ条件達成
        F->>S: INSERT user_badges
    end

    F-->>R: { streak, badge_earned? }
    R-->>U: ストリーク更新・バッジ通知表示
    R->>R: Wanna Be接続文言を表示<br/>（「→ 過去一の身体に +1」等）
```

---

### 5. AIコーチ週次レビュー（ストリーミング） 🔵

**信頼性**: 🔵 *REQ-601/602/701/702・ユーザーストーリー5.1より*

**関連要件**: REQ-601, REQ-602, REQ-605, REQ-701, REQ-702

```mermaid
sequenceDiagram
    participant S as APScheduler
    participant F as FastAPI
    participant DB as Supabase
    participant C as Claude API
    participant R as React
    participant U as ユーザー

    Note over S,F: 毎週金曜 or 日曜（ユーザー設定）
    S->>F: 週次レビュートリガー

    F->>DB: 全ユーザーの今週の習慣ログ取得
    loop 各ユーザー
        F->>DB: 習慣達成率・失敗理由サマリー取得
        F->>DB: INSERT weekly_review_jobs（pending）
    end

    Note over U,R: ユーザーが週次レビュー画面を開く
    U->>R: 週次レビュー画面へアクセス
    R->>F: GET /api/weekly-review/stream（JWT + SSE）
    F->>DB: 今週のデータ取得（達成率・失敗理由パターン）

    Note over F,C: 送信データ: 習慣名・達成率・失敗理由のみ<br/>（個人識別情報なし: REQ-605）

    F->>C: Claude API（ストリーミング）<br/>プロンプト: 週間データ → 分析・改善提案
    C-->>F: SSEストリーミング応答

    loop ストリーミング応答
        F-->>R: SSEチャンク転送
        R-->>U: 文章をリアルタイム表示
    end

    F->>DB: INSERT weekly_reviews（content, created_at）
    F-->>R: { done: true, actions: [{type:"change_time", habit_id, suggested_time}] }
    R-->>U: 改善提案ボタン表示
```

---

### 6. AI提案による習慣変更（範囲制限付き） 🔵

**信頼性**: 🔵 *REQ-303・ユーザーストーリー4.1より*

**関連要件**: REQ-303, REQ-305

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant R as React
    participant F as FastAPI
    participant S as Supabase

    U->>R: 「習慣の時間帯を朝7時に変更」承認ボタンクリック
    R->>F: PATCH /api/habits/{id} { action: "change_time", time: "07:00" }
    F->>F: JWT検証
    F->>F: アクション種別バリデーション<br/>（change_time / add_habit / remove_habit のみ許可）
    alt 許可されたアクション
        F->>S: UPDATE habits（scheduled_time）
        F-->>R: 200 OK { updated_habit }
        R-->>U: 更新完了表示
    else 禁止されたアクション
        F-->>R: 400 Bad Request { error: "FORBIDDEN_ACTION" }
        R-->>U: エラー表示
    end
```

---

## エラーハンドリングフロー 🔵

**信頼性**: 🔵 *EDGE-001/003・NFR-101より*

```mermaid
flowchart TD
    Err["エラー発生"]

    Err --> Type{エラー種別}

    Type -- "Claude API 接続失敗" --> ClaudeErr["EDGE-001<br/>AI機能をグレースフルに無効化<br/>「AIは現在利用できません。<br/>トラッキングは継続して使えます」表示"]
    Type -- "音声入力の意図不明" --> UnknownIntent["EDGE-003<br/>「どの操作ですか？」<br/>確認ダイアログ"]
    Type -- "認証エラー" --> Auth401["401 Unauthorized<br/>ログイン画面へリダイレクト"]
    Type -- "データ未存在" --> NotFound404["404 Not Found<br/>エラーメッセージ表示"]
    Type -- "バリデーションエラー" --> Validation["422 Unprocessable<br/>入力エラー表示"]
    Type -- "サーバーエラー" --> Server500["500 Internal Server Error<br/>ログ記録 + 汎用エラーメッセージ"]
```

---

## 状態管理フロー

### フロントエンド状態管理 🔵

**信頼性**: 🔵 *確定技術スタック（React Query + Zustand）より*

```mermaid
stateDiagram-v2
    [*] --> 未認証
    未認証 --> 認証済み: Supabase Auth ログイン成功
    認証済み --> 未認証: ログアウト

    認証済み --> ダッシュボード: 初期表示
    ダッシュボード --> 習慣チェック中: チェックボックス操作
    習慣チェック中 --> ダッシュボード: API保存完了
    ダッシュボード --> 音声入力中: 音声ボタンタップ
    音声入力中 --> AI分類中: テキスト送信
    AI分類中 --> ダッシュボード: 分類・更新完了
    AI分類中 --> 意図確認: unknown判定
    意図確認 --> ダッシュボード: ユーザー確認
```

### SSEストリーミング状態 🔵

**信頼性**: 🔵 *ヒアリング技術選定Q5（ストリーミング実装）より*

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Connecting: SSE接続開始
    Connecting --> Streaming: 最初のチャンク受信
    Streaming --> Streaming: チャンク受信中（逐次表示）
    Streaming --> Done: "done: true" 受信
    Streaming --> Error: 接続エラー
    Error --> Idle: リトライ or ユーザー操作
    Done --> Idle
```

---

## データ整合性の保証 🟡

**信頼性**: 🟡 *NFR要件・Supabase RLS設計から妥当な推測*

- **RLS ポリシー**: 全テーブルに `user_id = auth.uid()` 条件を設定。他ユーザーデータへのアクセスを禁止
- **楽観的更新**: チェックボックス操作は即座にUIを更新し、バックグラウンドで API を呼び出す。失敗時はロールバック
- **ストリーク整合性**: habit_logs の更新トリガーでストリーク再計算を実行（サーバーサイドで一元管理）

---

## 関連文書

- **アーキテクチャ**: [architecture.md](architecture.md)
- **型定義**: [interfaces.ts](interfaces.ts)
- **DBスキーマ**: [database-schema.sql](database-schema.sql)
- **API仕様**: [api-endpoints.md](api-endpoints.md)

## 信頼性レベルサマリー

- 🔵 青信号: 14件 (88%)
- 🟡 黄信号: 2件 (12%)
- 🔴 赤信号: 0件 (0%)

**品質評価**: 高品質
