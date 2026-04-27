# TDDテストケース定義書: 音声入力UI実装

- **機能名**: 音声入力UI実装（Web Speech API + テキスト入力フォールバック）
- **タスクID**: TASK-0019
- **要件名**: habit-design-app
- **出力ファイル**: `docs/implements/habit-design-app/TASK-0019/voice-input-ui-testcases.md`
- **参照要件**: REQ-401 / REQ-402 / REQ-403 / REQ-406 / EDGE-001 / EDGE-003 / NFR-201

---

## 信頼性レベル凡例

- 🔵 **青信号**: EARS 要件・設計文書・既存実装を参考にしてほぼ推測していない
- 🟡 **黄信号**: EARS 要件・設計文書から妥当な推測
- 🔴 **赤信号**: EARS 要件・設計文書にない推測

---

## 開発言語・フレームワーク

- **プログラミング言語**: TypeScript（strict mode）
  - **言語選択の理由**: フロントエンド全体が TypeScript strict で統一されており、Web Speech API の型安全な取り扱いが必要なため（note.md 技術スタック）。
  - **テストに適した機能**: 型推論による期待値の静的検証・モック型の明示化が可能。
- **テストフレームワーク**: Vitest + @testing-library/react + @testing-library/user-event
  - **フレームワーク選択の理由**: Vite プロジェクトとの親和性が高く、既存テスト（TASK-0015 等）で同じ構成を採用済み。React コンポーネントのイベント駆動テストは testing-library が事実上の標準（note.md）。
  - **テスト実行環境**: Node.js + jsdom。Vitest の `vi.stubGlobal` で `window.SpeechRecognition` / `window.webkitSpeechRecognition` をモック。
- 🔵 この内容の信頼性レベル

---

## テスト対象ファイル構成

| 対象 | ソース | テスト |
|------|--------|--------|
| カスタムフック | `frontend/src/hooks/useVoiceInput.ts` | `frontend/src/hooks/__tests__/useVoiceInput.test.ts` |
| ボタン | `frontend/src/components/dashboard/VoiceInputButton.tsx` | `frontend/src/components/dashboard/__tests__/VoiceInputButton.test.tsx` |
| モーダル | `frontend/src/components/dashboard/VoiceInputModal.tsx` | `frontend/src/components/dashboard/__tests__/VoiceInputModal.test.tsx` |

---

## 1. 正常系テストケース（基本的な動作）

### 1.1 `useVoiceInput` — 対応ブラウザで `isSupported=true` を返す 🔵

- **テスト名**: should return isSupported=true when SpeechRecognition is available
  - **何をテストするか**: 対応ブラウザ（`window.SpeechRecognition` が存在）での初期状態を確認
  - **期待される動作**: `isSupported` が `true` で返る
- **入力値**: `vi.stubGlobal('SpeechRecognition', MockRecognitionClass)`
  - **入力データの意味**: Chrome/Edge 相当の対応ブラウザをシミュレート
- **期待される結果**: `result.current.isSupported === true`, `isListening === false`, `transcript === ''`
  - **期待結果の理由**: useState 初期化時に `getSpeechRecognition()` が非 null を返すため
- **テストの目的**: Web Speech API 検出ロジックの正常系
  - **確認ポイント**: `'SpeechRecognition' in window || 'webkitSpeechRecognition' in window` の検出精度
- 🔵 信頼性レベル: requirements.md §3.3・既存実装（`getSpeechRecognition`）より

---

### 1.2 `useVoiceInput` — `startListening` 呼び出しで録音開始される 🔵

- **テスト名**: should set isListening=true and start recognition when startListening is called
- **何をテストするか**: `startListening()` 呼び出しで `recognition.start()` が発火し `isListening=true` になる
- **期待される動作**: モックインスタンスの `start` が 1 回呼ばれ、`isListening` が真になる
- **入力値**: Mock SpeechRecognition（`start`, `stop`, `onresult`, `onend`, `onerror` プロパティ持ち）をグローバルにスタブ
  - **入力データの意味**: 音声認識 API の一般的な挙動
- **期待される結果**:
  - `mockStart` が 1 回呼ばれる
  - `recognition.lang === 'ja-JP'` が設定される
  - `recognition.continuous === false`、`recognition.interimResults === false`
  - `result.current.isListening === true`
- **テストの目的**: Web Speech API 初期化パラメータの検証
  - **確認ポイント**: `lang='ja-JP'` と `continuous=false` の設定（note.md 注意事項）
- 🔵 信頼性レベル: 既存実装 + note.md 注意事項より

---

### 1.3 `useVoiceInput` — `onresult` 発火で `transcript` が更新される 🔵

- **テスト名**: should update transcript when recognition.onresult fires
- **何をテストするか**: 認識結果イベントを受け取って `transcript` state に反映
- **期待される動作**: `results[0][0].transcript` の値が state に入る
- **入力値**: `{ results: [[{ transcript: '今日は早起き達成' }]] }` を `onresult` に渡す
  - **入力データの意味**: 日本語音声入力の典型的な結果
- **期待される結果**: `result.current.transcript === '今日は早起き達成'`
- **テストの目的**: 音声認識結果の state 反映ロジック
  - **確認ポイント**: `event.results[0]?.[0]?.transcript` の安全な取り出し
- 🔵 信頼性レベル: 既存実装・REQ-401 より

---

### 1.4 `useVoiceInput` — `onend` 発火で `isListening=false` に戻る 🔵

- **テスト名**: should reset isListening to false when recognition.onend fires
- **何をテストするか**: 認識終了イベントで録音フラグがリセットされる
- **期待される動作**: `isListening` が `false` に戻る
- **入力値**: `startListening()` → モックの `onend()` を手動で発火
- **期待される結果**: `result.current.isListening === false`
- **テストの目的**: 録音完了時のフラグ管理
  - **確認ポイント**: イベント完了後の state クリーンアップ
- 🔵 信頼性レベル: 既存実装より

---

### 1.5 `useVoiceInput` — `stopListening` で `recognition.stop()` が呼ばれる 🔵

- **テスト名**: should call recognition.stop when stopListening is invoked
- **何をテストするか**: ユーザーが明示停止したときの挙動
- **期待される動作**: `mockStop` が呼ばれ、`isListening` が `false` に戻る
- **入力値**: `startListening()` → `stopListening()`
- **期待される結果**: `mockStop` が 1 回呼ばれ、`isListening === false`
- **テストの目的**: 明示停止の動作検証
  - **確認ポイント**: 既に停止状態でもエラーが出ないこと
- 🔵 信頼性レベル: 既存実装より

---

### 1.6 `VoiceInputButton` — 非録音状態で `Mic` アイコン + 緑スタイル表示 🔵

- **テスト名**: should render Mic icon with emerald style when not listening
- **何をテストするか**: 初期状態でのアイコン・スタイル
- **期待される動作**: `aria-label="音声入力"` のボタンが緑系クラス（`bg-emerald-500`）で描画
- **入力値**: `<VoiceInputButton isSupported isListening={false} ... />`
- **期待される結果**:
  - `getByLabelText('音声入力')` が存在
  - `class` に `bg-emerald-500` が含まれる
  - `animate-pulse` が含まれない
- **テストの目的**: 視覚的デフォルト状態の検証
  - **確認ポイント**: モバイル向け `h-12 w-12` のサイズクラスが当たっている
- 🔵 信頼性レベル: requirements.md §3.7・既存実装より

---

### 1.7 `VoiceInputButton` — 録音中に `MicOff` + 赤色 + `animate-pulse` 表示 🔵

- **テスト名**: should render MicOff with pulse animation when listening
- **何をテストするか**: `isListening=true` のスタイル切り替え
- **期待される動作**: `bg-red-500` と `animate-pulse` がクラスに含まれる
- **入力値**: `<VoiceInputButton isListening={true} ... />`
- **期待される結果**: `class` に `bg-red-500 animate-pulse` が含まれ、`MicOff` アイコンが表示される
- **テストの目的**: 録音中の視覚フィードバック（UI/UX 要件）
  - **確認ポイント**: 赤色＋パルスでユーザーに録音中を強く通知
- 🔵 信頼性レベル: TASK-0019 §UI/UX要件より

---

### 1.8 `VoiceInputButton` — 対応ブラウザでタップすると `onStartListening` が呼ばれる 🔵

- **テスト名**: should call onStartListening when supported and not listening
- **何をテストするか**: 録音開始のコールバック呼び出し
- **期待される動作**: ボタンクリックで `onStartListening` が 1 回呼ばれる
- **入力値**: `isSupported=true`, `isListening=false` で `user.click(button)`
- **期待される結果**: `onStartListening` が 1 回、`onStopListening` は 0 回、`onTranscript` は 0 回
- **テストの目的**: ハンドラ分岐（開始）
  - **確認ポイント**: `isListening` の現状値で分岐が正しく動く
- 🔵 信頼性レベル: 既存実装より

---

### 1.9 `VoiceInputButton` — 録音中にタップすると `onStopListening` が呼ばれる 🔵

- **テスト名**: should call onStopListening when already listening
- **何をテストするか**: 録音停止のコールバック呼び出し
- **期待される動作**: `onStopListening` のみが呼ばれる
- **入力値**: `isListening=true` で `user.click(button)`
- **期待される結果**: `onStopListening` が 1 回、`onStartListening` は 0 回
- **テストの目的**: ハンドラ分岐（停止）
  - **確認ポイント**: トグル動作の信頼性
- 🔵 信頼性レベル: 既存実装より

---

### 1.10 `VoiceInputButton` — フォールバック送信で `onTranscript` に trim 済みテキストが渡る 🔵

- **テスト名**: should submit trimmed text via onTranscript in fallback mode
- **何をテストするか**: 非対応ブラウザでのテキスト送信フロー
- **期待される動作**: `isSupported=false` でボタンを押すとテキスト入力が現れ、テキスト入力＋「送信」クリックで trim 済みテキストがコールバックされる
- **入力値**: `isSupported=false`、テキスト入力に `'  今日はジャーナル  '`
- **期待される結果**: `onTranscript('今日はジャーナル')` が 1 回呼ばれる
- **テストの目的**: フォールバック UI の完全フロー
  - **確認ポイント**: 空白の trim、送信後のフォームクローズ
- 🔵 信頼性レベル: requirements.md §2.2・既存実装より

---

### 1.11 `VoiceInputButton` — フォールバック Enter キーでも送信できる 🔵

- **テスト名**: should submit fallback text on Enter key
- **何をテストするか**: モバイル/キーボード操作性
- **期待される動作**: テキスト入力で Enter を押すと `onTranscript` が呼ばれる
- **入力値**: `isSupported=false`、テキスト `'筋トレ達成'` + Enter
- **期待される結果**: `onTranscript('筋トレ達成')` が呼ばれる
- **テストの目的**: キーボードショートカット
  - **確認ポイント**: NFR-201（モバイルソフトキーボードの Enter 互換）
- 🔵 信頼性レベル: 既存実装より

---

### 1.12 `VoiceInputModal` — `transcript` が表示される 🔵

- **テスト名**: should display transcript when provided
- **何をテストするか**: 認識テキストの UI 表示
- **期待される動作**: `transcript` prop のテキストがモーダル内に描画
- **入力値**: `transcript='今日は早起きした'`、`isAnalyzing=false`、`result=null`
- **期待される結果**: `getByText('今日は早起きした')` が存在
- **テストの目的**: 認識テキスト表示
  - **確認ポイント**: 空文字の場合に枠ごと非表示になる条件分岐
- 🔵 信頼性レベル: 既存実装・requirements.md §2.2 より

---

### 1.13 `VoiceInputModal` — 解析中にスピナーと「AIが解析中...」が表示される 🔵

- **テスト名**: should render spinner and analyzing label when isAnalyzing
- **何をテストするか**: ローディング表示
- **期待される動作**: Spinner コンポーネント + `'AIが解析中...'` テキスト
- **入力値**: `isAnalyzing=true`、`result=null`
- **期待される結果**: `getByText('AIが解析中...')` が存在
- **テストの目的**: UX ローディング要件
  - **確認ポイント**: `isAnalyzing=true` の間は結果表示ブロックが出ない
- 🔵 信頼性レベル: requirements.md §3.7・既存実装より

---

### 1.14 `VoiceInputModal` — `type=checklist` 結果で「習慣を更新しました」表示 🔵

- **テスト名**: should show success message for checklist result
- **何をテストするか**: REQ-403 に対応する成功メッセージ
- **期待される動作**: `'習慣を更新しました'` が表示される
- **入力値**: `result={ type: 'checklist' }`、`isAnalyzing=false`
- **期待される結果**: `getByText('習慣を更新しました')` が存在
- **テストの目的**: 成功分岐（checklist）
  - **確認ポイント**: `result.message` がある場合はそちらが優先される
- 🔵 信頼性レベル: REQ-403・既存実装より

---

### 1.15 `VoiceInputModal` — `type=journaling` 結果で「ジャーナルに保存しました」表示 🔵

- **テスト名**: should show success message for journaling result
- **入力値**: `result={ type: 'journaling' }`
- **期待される結果**: `getByText('ジャーナルに保存しました')` が存在
- **テストの目的**: 成功分岐（journaling）
- 🔵 信頼性レベル: REQ-402・既存実装より

---

### 1.16 `VoiceInputModal` — `type=daily_report` 結果で「日報を保存しました」表示 🔵

- **テスト名**: should show success message for daily_report result
- **入力値**: `result={ type: 'daily_report' }`
- **期待される結果**: `getByText('日報を保存しました')` が存在
- **テストの目的**: 成功分岐（daily_report）
- 🔵 信頼性レベル: REQ-402・既存実装より

---

### 1.17 `VoiceInputModal` — 閉じるボタンで `onClose` が呼ばれる 🔵

- **テスト名**: should call onClose when close button is clicked
- **期待される動作**: `aria-label="閉じる"` ボタンクリックで `onClose` が 1 回呼ばれる
- **入力値**: `user.click(getByLabelText('閉じる'))`
- **期待される結果**: `onClose` が 1 回呼ばれる
- **テストの目的**: モーダルクローズ
- 🔵 信頼性レベル: 既存実装より

---

## 2. 異常系テストケース（エラーハンドリング）

### 2.1 `useVoiceInput` — 非対応ブラウザで `isSupported=false` を返す 🔵

- **テスト名**: should return isSupported=false on unsupported browsers
  - **エラーケースの概要**: Firefox/Safari など `SpeechRecognition` も `webkitSpeechRecognition` も未定義の環境
  - **エラー処理の重要性**: 非対応ブラウザで録音を開始しようとすると例外になるため、UI 側でフォールバックを出す必要がある
- **入力値**: `vi.stubGlobal('SpeechRecognition', undefined)`、`vi.stubGlobal('webkitSpeechRecognition', undefined)`
  - **不正な理由**: ブラウザネイティブの音声認識 API が提供されない状態
  - **実際の発生シナリオ**: Firefox / Safari / 一部モバイル WebView
- **期待される結果**:
  - `result.current.isSupported === false`
  - `startListening()` を呼んでも例外にならず `isListening` は `false` のまま
- **テストの目的**: ブラウザ互換エラーのハンドリング
  - **品質保証の観点**: クラッシュせずに静かに失敗すること
- 🔵 信頼性レベル: architecture.md §音声入力制約・既存実装より

---

### 2.2 `useVoiceInput` — `onerror` 発火で `isListening=false` に戻る 🟡

- **テスト名**: should reset isListening when recognition.onerror fires
  - **エラーケースの概要**: マイク権限拒否・ネットワーク切断などの認識エラー
  - **エラー処理の重要性**: ユーザーがエラー後も操作を継続できる状態を維持する
- **入力値**: `startListening()` → モックの `onerror({ error: 'not-allowed' })` を発火
  - **不正な理由**: ブラウザが `SpeechRecognitionErrorEvent` を発行したケース
  - **実際の発生シナリオ**: 初回マイク権限ダイアログで「拒否」が押された
- **期待される結果**: `result.current.isListening === false`
- **テストの目的**: エラーリカバリー
  - **品質保証の観点**: エラー後もボタンがロックされない
- 🟡 信頼性レベル: requirements.md §4.3（マイク権限拒否）・既存実装より

---

### 2.3 `useVoiceInput` — unmount 時に `recognition.stop()` が呼ばれる 🔵

- **テスト名**: should call recognition.stop on unmount when listening
  - **エラーケースの概要**: ページ遷移やモーダルクローズ中の録音リーク
  - **エラー処理の重要性**: マイクハンドル解放によるリソースリーク防止
- **入力値**: `startListening()` → `renderHook` の `unmount()`
- **期待される結果**: `mockStop` が 1 回以上呼ばれる
- **テストの目的**: リソース解放
  - **品質保証の観点**: メモリ・権限リーク防止（note.md 注意事項）
- 🔵 信頼性レベル: note.md 注意事項・requirements.md §4.3 より

---

### 2.4 `VoiceInputButton` — 非対応ブラウザでボタンを押してもフォールバック表示のみ 🔵

- **テスト名**: should show fallback form instead of starting recognition on unsupported browsers
  - **エラーケースの概要**: 非対応ブラウザで録音させようとするとクラッシュする
  - **エラー処理の重要性**: 「機能は使えないが入力の代替手段がある」状態を示す
- **入力値**: `isSupported=false` でボタンクリック
- **期待される結果**:
  - `onStartListening` は呼ばれない
  - テキスト入力 `placeholder="テキストを入力してください"` が表示される
- **テストの目的**: フォールバック分岐
  - **品質保証の観点**: Firefox/Safari ユーザーの体験維持
- 🔵 信頼性レベル: architecture.md §音声入力制約・既存実装より

---

### 2.5 `VoiceInputButton` — フォールバックで空白のみのテキストは送信されない 🟡

- **テスト名**: should not call onTranscript when fallback text is empty or whitespace
  - **エラーケースの概要**: 空送信による無駄な API 呼び出し
  - **エラー処理の重要性**: バックエンドへの不要リクエスト削減（requirements.md §4.3「認識結果が空文字」を援用）
- **入力値**: テキスト入力に `'   '`（空白のみ）→「送信」クリック
- **期待される結果**: `onTranscript` は 0 回。フォームは開いたまま。
- **テストの目的**: 不正入力の拒否
  - **品質保証の観点**: API コスト削減 + UI の一貫性
- 🟡 信頼性レベル: requirements.md §4.3・既存実装の `trim()` ガードより

---

### 2.6 `VoiceInputModal` — `type=unknown` のときに成功メッセージが表示されない 🔵

- **テスト名**: should not render success message when result.type is unknown
  - **エラーケースの概要**: unknown 分岐で誤って成功表示が出るリグレッション防止
  - **エラー処理の重要性**: EDGE-003 の手動選択 UI と混ざらないこと
- **入力値**: `result={ type: 'unknown' }`
- **期待される結果**:
  - `'習慣を更新しました'` / `'ジャーナルに保存しました'` / `'日報を保存しました'` のどれも表示されない
  - 手動選択 UI が表示される
- **テストの目的**: 分岐排他性
  - **品質保証の観点**: 2 つの UI が同時に出ない
- 🔵 信頼性レベル: EDGE-003・既存実装より

---

### 2.7 `VoiceInputModal` — `result=null` かつ `isAnalyzing=false` では成功 UI が出ない 🟡

- **テスト名**: should render nothing extra when no result and not analyzing
  - **エラーケースの概要**: 初期表示時に古い state が残っているケース
- **入力値**: `transcript=''`, `isAnalyzing=false`, `result=null`
- **期待される結果**: スピナー・結果メッセージ・手動選択 UI のいずれも表示されない
- **テストの目的**: 初期表示のクリーン
  - **品質保証の観点**: モーダルの初期状態での視覚ノイズ防止
- 🟡 信頼性レベル: 既存実装の条件分岐より合理的推測

---

## 3. 境界値テストケース（最小値・最大値・null 等）

### 3.1 `useVoiceInput` — 空の認識結果でも `transcript=''` で安定する 🟡

- **テスト名**: should keep transcript as empty string when results array is empty
  - **境界値の意味**: 無音や極端に短い発話で `results[0]` が空のケース
  - **境界値での動作保証**: TypeScript のオプショナルチェーンが適切に働く
- **入力値**: `onresult({ results: [[]] })` または `{ results: [] }`
  - **境界値選択の根拠**: Web Speech API 仕様上、空配列を返す可能性
- **期待される結果**: `result.current.transcript === ''`（例外を投げない）
  - **境界での正確性**: nullish coalescing `?? ''` が有効
  - **一貫した動作**: state は初期値を維持
- **テストの目的**: 空結果のガード
  - **堅牢性の確認**: 無音状態で落ちない
- 🟡 信頼性レベル: 既存実装 `event.results[0]?.[0]?.transcript ?? ''` の挙動から推測

---

### 3.2 `useVoiceInput` — `webkitSpeechRecognition` のみ存在する環境でも対応扱いになる 🔵

- **テスト名**: should detect webkit prefixed SpeechRecognition
  - **境界値の意味**: 古い Chrome / Safari の互換プレフィックス
- **入力値**: `vi.stubGlobal('SpeechRecognition', undefined)`, `vi.stubGlobal('webkitSpeechRecognition', MockClass)`
- **期待される結果**: `isSupported === true` で、`startListening()` 後に `mockStart` が呼ばれる
- **テストの目的**: ベンダープレフィックス対応
  - **堅牢性の確認**: ブラウザ互換の網羅性
- 🔵 信頼性レベル: note.md 注意事項・既存実装より

---

### 3.3 `VoiceInputButton` — フォールバック入力の長文テキストもそのまま渡る 🟡

- **テスト名**: should pass long fallback text to onTranscript
  - **境界値の意味**: ユーザーが長文を貼り付けた場合
- **入力値**: 500 文字のテキスト
- **期待される結果**: `onTranscript` に trim 後 500 文字がそのまま渡る（切り捨てなし）
- **テストの目的**: 最大長想定
  - **堅牢性の確認**: 入力長による UI 崩れなし
- 🟡 信頼性レベル: requirements.md §2.1 の「text は trim 後 1 文字以上」より推測

---

### 3.4 `VoiceInputModal` — `transcript=''` では認識テキスト枠が出ない 🔵

- **テスト名**: should hide transcript box when transcript is empty
  - **境界値の意味**: 録音直後でまだ結果が無い初期状態
- **入力値**: `transcript=''`
- **期待される結果**: `transcript` 表示用の `<div>` 自体が DOM に無い（`queryByTestId` などで null）
- **テストの目的**: 空文字分岐
  - **堅牢性の確認**: 意味のない空枠を出さない
- 🔵 信頼性レベル: 既存実装の `{transcript && ...}` 分岐より

---

### 3.5 `VoiceInputModal` — `isAnalyzing=true` かつ `result` あり でもスピナーが優先される 🔵

- **テスト名**: should prioritize spinner when both isAnalyzing and result are set
  - **境界値の意味**: レスポンス到達直前のレース状態
- **入力値**: `isAnalyzing=true`, `result={ type: 'checklist' }`
- **期待される結果**: スピナーのみ表示、成功メッセージは出ない
- **テストの目的**: 排他表示
  - **堅牢性の確認**: 同時 state でも UI が混ざらない
- 🔵 信頼性レベル: 既存実装 `{result && !isAnalyzing && ...}` 分岐より

---

### 3.6 `VoiceInputModal` — `type=unknown` 手動選択で `onSelectAction` に正しい引数が渡る 🔵

- **テスト名**: should call onSelectAction with correct action on EDGE-003 UI
  - **境界値の意味**: EDGE-003 の 3 分岐（checklist / journaling / daily_report）すべて
- **入力値**: `result={ type: 'unknown' }` で各ボタンを順にクリック
- **期待される結果**:
  - 「チェックリスト」ボタン → `onSelectAction('checklist')`
  - 「ジャーナル」ボタン → `onSelectAction('journaling')`
  - 「日報」ボタン → `onSelectAction('daily_report')`
- **テストの目的**: EDGE-003 の完全分岐
  - **堅牢性の確認**: 3 つの選択肢が正しく呼び分けられる
- 🔵 信頼性レベル: EDGE-003・requirements.md §4.3・既存実装より

---

## 4. テスト実装時の日本語コメント指針

### テストケース開始時のコメント（例）

```ts
// 【テスト目的】: Web Speech API 非対応ブラウザで isSupported=false が返ることを確認
// 【テスト内容】: window.SpeechRecognition / webkitSpeechRecognition を両方 undefined にして useVoiceInput を呼ぶ
// 【期待される動作】: isSupported が false で返り、startListening を呼んでも例外にならない
// 🔵 信頼性レベル: architecture.md §音声入力制約・REQ-401 より
```

### Given（準備フェーズ）

```ts
// 【テストデータ準備】: 非対応ブラウザをシミュレートするため両グローバルを undefined にスタブ
// 【初期条件設定】: jsdom 環境の window から SpeechRecognition 関連を除去
// 【前提条件確認】: useVoiceInput がマウント時にのみ isSupported を初期化することを踏まえる
vi.stubGlobal('SpeechRecognition', undefined)
vi.stubGlobal('webkitSpeechRecognition', undefined)
```

### When（実行フェーズ）

```ts
// 【実際の処理実行】: renderHook で useVoiceInput() をマウント
// 【処理内容】: 初期化時点での isSupported と state を評価する
// 【実行タイミング】: スタブ適用直後（マウント前）に評価するため renderHook の前にスタブを置く
const { result } = renderHook(() => useVoiceInput())
```

### Then（検証フェーズ）

```ts
// 【結果検証】: isSupported が false で返り、startListening 呼び出し後も例外なく state が変わらないこと
// 【期待値確認】: Web Speech API 非対応時のフォールバック条件の成立
// 【品質保証】: Firefox/Safari ユーザーが機能ゼロで詰むことを防ぐ
expect(result.current.isSupported).toBe(false) // 【検証項目】: 非対応判定 🔵
act(() => result.current.startListening())
expect(result.current.isListening).toBe(false) // 【検証項目】: start 呼び出しでも録音状態にならない 🔵
```

### セットアップ・クリーンアップ

```ts
beforeEach(() => {
  // 【テスト前準備】: SpeechRecognition モッククラスを毎回新規に生成して start/stop の呼び出し回数をリセット
  // 【環境初期化】: 前テストで stubGlobal された値を unstub してクリーンな window へ戻す
  vi.unstubAllGlobals()
})

afterEach(() => {
  // 【テスト後処理】: stubGlobal と vi.fn のリセット
  // 【状態復元】: 他テストへ影響しないよう JSDOM を初期化
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
```

---

## 5. 要件定義との対応関係

- **参照した機能概要**: voice-input-ui-requirements.md §1（機能の概要）
- **参照した入力・出力仕様**: voice-input-ui-requirements.md §2（型定義・VoiceInputRequest/Response）
- **参照した制約条件**: voice-input-ui-requirements.md §3（ブラウザ互換・UI/UX・API）
- **参照した使用例**: voice-input-ui-requirements.md §4（パターン A/B/C、EDGE-003、非対応ブラウザ）

### EARS 要件との紐付け

| 要件 ID | 対応テストケース |
|---------|------------------|
| REQ-401 | 1.1 / 1.2 / 1.3 / 1.10 / 2.1 / 3.2 |
| REQ-402 | 1.14 / 1.15 / 1.16 |
| REQ-403 | 1.14 |
| REQ-406 | 1.14（failed_habits 遷移の前提として VoiceInputModal が checklist 結果を正しく扱うこと） |
| EDGE-001 | 2.6（unknown 分岐の排他）、2.7（null 時の UI） |
| EDGE-003 | 1.17 / 2.6 / 3.6 |
| NFR-201 | 1.6 / 1.7 / 1.11 / 3.3（モバイル UX・タップサイズ・Enter 送信） |

---

## 信頼性レベルサマリー

| 区分 | 件数 |
|------|------|
| 🔵 青信号 | 21 件 |
| 🟡 黄信号 | 6 件 |
| 🔴 赤信号 | 0 件 |
| **合計** | **27 件** |

- 正常系: 17 件（🔵 16 / 🟡 1）
- 異常系: 7 件（🔵 5 / 🟡 2）
- 境界値: 6 件（🔵 4 / 🟡 2）

**品質評価: 高品質**

- テストケース分類: 正常系・異常系・境界値を網羅
- 期待値定義: 各テストケースで具体的な assertion 内容を記述
- 技術選択: TypeScript + Vitest + @testing-library/react（既存プロジェクトと一致）
- 実装可能性: 既存実装ファイルが 3 つとも揃っており、テストのみ追加すれば動く状態

---

## 次のステップ

`/tsumiki:tdd-red habit-design-app TASK-0019` — 上記テストケースに基づき、失敗するテスト（Red）を実装する。
