# Daily OS v3 — Sprint Spec

**プロダクト名:** Daily OS v3  
**設計思想:** アプリが時刻・曜日コンテキストを読み取り、今やるべきことをユーザーより先に提示する  
**バックエンド:** LocalStorage のみ（バックエンド連携は将来フェーズ）  
**ベース:** `frontend-v2/` の実装を引き継ぎ、新アーキテクチャへ移行する

---

## 引き継ぎ資産（変更しない・そのまま使う）

| 資産 | 内容 |
|---|---|
| `lib/storage.ts` の hooks | `useLocalStorage` / `useTodayStorage` / `useBossStorage` / `countMonthlyChecks` |
| 朝タブのチェック状態・体重・コンディション | localStorage キー構造を維持 |
| 夜タブのラスボス・Gap記録 | localStorage キー構造を維持 |
| 月次タブの集計ロジック | `countMonthlyChecks` を再利用 |
| 日報生成フロー | チェック状態 → テキスト生成 → コピー |
| PWA設定 | `manifest.json` / iOS メタタグをそのまま継承 |

---

## 画面アーキテクチャ（4レイヤー）

```
Layer 1 — Home（起点・新規）
  時刻コンテキスト表示 + 今月進捗リング + 今日の推奨アクション

Layer 2 — モード選択（ナビゲーション変更）
  朝ルーティン / 夜の振り返り / 月次レビュー / 設定

Layer 3 — 実行・閲覧
  チェックリスト / 入力フォーム / 比較ダッシュ / AI構成

Layer 4 — AI連携
  AI朝コメント / AI夜コメント / AI月次分析 / AI設定支援
```

---

## データ設計（LocalStorage）

### 日次記録（3軸モデル）

```
daily:{YYYY-MM-DD}:morning:checked    → string[]   チェック済み習慣ID
daily:{YYYY-MM-DD}:morning:weight     → number      体重(kg)
daily:{YYYY-MM-DD}:morning:condition  → 1|2|3|4|5   コンディション星
daily:{YYYY-MM-DD}:evening:checked    → string[]   チェック済み習慣ID
daily:{YYYY-MM-DD}:evening:weight     → number      体重(kg)
daily:{YYYY-MM-DD}:evening:condition  → 1|2|3|4|5   コンディション星
daily:{YYYY-MM-DD}:boss               → { value, completed }
daily:{YYYY-MM-DD}:gap                → string      夜Gap記録
daily:{YYYY-MM-DD}:insight            → string      今日の気づき
daily:{YYYY-MM-DD}:tomorrow           → string      翌日スケジュール
```

### 月次集計（3軸）

```
monthly:{YYYY-MM}:targets   → Record<habitId, number>   月間目標回数
monthly:{YYYY-MM}:actuals   → 集計時に daily から動的計算
monthly:{YYYY-MM}:bests     → Record<habitId, number>   過去最高（累積更新）
```

### 設定

```
settings:habits:morning   → Habit[]   朝習慣リスト
settings:habits:evening   → Habit[]   夜習慣リスト
settings:wanna-be         → WannaBe[] Wanna Be ゴールリスト
settings:ai:context       → string[]  AI会話履歴（直近20件）
```

---

## スプリント計画

### Sprint 1 — ホーム画面とコンテキスト誘導（動く最小形）

**目標:** アプリを開いた瞬間に「今何をすべきか」が分かる

#### 機能1: Home 画面の新設

- 現在時刻・曜日・日付を画面上部に表示する
- 時刻帯判定ロジック（朝 / 夜 / それ以外）を実装する
  - 朝: 5:00〜11:59
  - 夜: 17:00〜23:59
  - それ以外: 昼・深夜（休憩モード）
- 時刻帯に応じてハイライトカードを表示する
  - 朝帯 → 「朝ルーティンを始める」カードを前面に出す
  - 夜帯 → 「夜の振り返りへ」カードを前面に出す
  - それ以外 → 今日のサマリーカード（完了数/全習慣数）を表示

#### 機能2: ナビゲーション変更（タブ → ボトムナビ）

- 現在の5タブ（TabBar）を廃止し、4項目ボトムナビに変更する
  - Home / 朝ルーティン / 夜の振り返り / その他（月次・設定）
- 起動時のデフォルトは常に Home 画面とする
- v2 の MorningTab・EveningTab・MonthlyTab・WannaBeTab・ReportTab は内部ロジックをそのまま使い、画面コンポーネントとして再配置する

#### 機能3: 今月の進捗リング（Home に埋め込み）

- 朝習慣・夜習慣それぞれの今月達成率をリング型で表示する
- リングのデータソースは `countMonthlyChecks`（既存ロジック）を使う
- 目標回数（`monthly:{YYYY-MM}:targets`）との比率でパーセント表示する
- 目標未設定の場合は「月31日換算」をデフォルト目標とする

#### 機能4: 今日のボス表示（Home カード）

- v2 の useBossStorage をそのまま使い、Home 画面にボスタスクカードを表示する
- 完了トグルを Home 画面から直接操作できるようにする

**Sprint 1 完了条件:**
- [ ] Home 画面が表示される
- [ ] 時刻帯に応じてハイライトカードが切り替わる
- [ ] 進捗リングが今月の実データで描画される
- [ ] ボトムナビで4エリアに遷移できる
- [ ] `npm run build` が通る

---

### Sprint 2 — 実行フローの整理とデータ記録強化

**目標:** 朝・夜の記録を1画面で完結させ、3軸データを蓄積する

#### 機能5: 朝ルーティン画面のリファクタリング

- v2 MorningTab の UI をそのまま維持しつつ、データキーを新スキーマ（`daily:{date}:morning:*`）に移行する
- 完了時に Home 画面へ自動遷移し「朝ルーティン完了」バナーを表示する

#### 機能6: 夜の振り返り画面のリファクタリング

- v2 EveningTab の UI をそのまま維持しつつ、データキーを新スキーマに移行する
- Gap・気づき・翌日スケジュールを1フォームで記録できるようにする
- 完了時に Home 画面へ自動遷移し「夜の振り返り完了」バナーを表示する

#### 機能7: 月次目標の設定（targets 軸）

- 習慣ごとに「今月の目標回数」を設定できる入力フォームを追加する
- 設定値は `monthly:{YYYY-MM}:targets` に保存する
- 月次レビュー画面でこの目標値と実績値を並べて表示する

#### 機能8: ベスト値の自動更新（bests 軸）

- 月末に今月実績 > 過去ベストであれば `monthly:{YYYY-MM}:bests` を上書きする
- Home 進捗リングにベスト比率（現在/ベスト）を追記表示する

**Sprint 2 完了条件:**
- [ ] 朝・夜の記録が新スキーマキーで保存される
- [ ] 完了後 Home への自動遷移が動く
- [ ] 月次目標の設定・表示が動く
- [ ] ベスト値が更新される
- [ ] `npm run build` + `npm run test` が通る

---

### Sprint 3 — 月次レビューと比較ダッシュボード

**目標:** 今月の進捗・先月比・推移をひと目で把握できる

#### 機能9: 月次比較ダッシュボード

- 今月 / 先月 / ベストの3軸を習慣ごとに棒グラフ＋数値で表示する
- `countMonthlyChecks` を前月に拡張して先月データも集計する
- 進捗リング（大）を月次レビュー画面の先頭に表示する

#### 機能10: 週別推移ミニチャート

- 今月を週単位（W1〜W4）に分割し、習慣ごとの達成数を折れ線で表示する
- 表示は月次レビュー画面のアコーディオン内に配置する

#### 機能11: 日報の再配置

- v2 の ReportTab ロジックをそのまま使い、月次レビュー画面内の「日報」タブとして統合する
- 独立タブとしての ReportTab は廃止する

**Sprint 3 完了条件:**
- [ ] 月次比較ダッシュボードが今月・先月・ベストを表示する
- [ ] 週別ミニチャートが表示される
- [ ] 日報が月次レビュー内に統合される
- [ ] `npm run build` + `npm run test` が通る

---

### Sprint 4 — AI連携（設定支援・振り返りコメント）

**目標:** AI対話が「設定を作る時」と「毎日の振り返り」の2フェーズで機能する

#### 機能12: AI設定支援（設定フェーズ）

- 自然言語で「朝にやりたいこと」を入力すると、習慣リストの候補を生成するフォームを追加する
- AI会話はユーザーが内容を確認・承認してから `settings:habits:*` に保存する
- 会話履歴は `settings:ai:context`（直近20件）に保持し、次回起動時も継続できる

#### 機能13: AI朝コメント（振り返りフェーズ）

- 朝ルーティン完了直後、昨日比・今月進捗を元にした一言コメントをAIが生成する
- コメントはHome画面の完了バナーに表示する
- 生成はオンデマンド（「AIコメントを見る」ボタン押下時）とする

#### 機能14: AI夜コメント（振り返りフェーズ）

- 夜の振り返り完了後、今日の記録（Gap・気づき・チェック状態）を元にAIがコメントを生成する
- 翌朝への提言を1〜2文で含める

#### 機能15: Wanna Be AI分析（v1引き継ぎ）

- v1 の週次レビュー・Wanna Be AI分析（SSEストリーミング）を月次レビュー画面に統合する
- ストリーミング表示ロジックはv1から移植する

**Sprint 4 完了条件:**
- [ ] AI設定支援フォームが動く
- [ ] 朝・夜コメント生成が動く（API連携先はモック可）
- [ ] Wanna Be分析がSSEで表示される
- [ ] `npm run build` + `npm run test` が通る

---

## 画面遷移図

```
起動
  │
  ▼
[Home]
  ├── 朝帯ハイライト → [朝ルーティン] → 完了 → [Home + 完了バナー]
  ├── 夜帯ハイライト → [夜の振り返り] → 完了 → [Home + 完了バナー]
  ├── 進捗リング押下 → [月次レビュー]
  │                        ├── 比較ダッシュ
  │                        ├── 週別推移
  │                        └── 日報
  └── ボトムナビ「その他」 → [設定]
                                ├── 習慣リスト編集
                                ├── Wanna Be 編集
                                └── AI設定支援
```

---

## コンポーネント構成（目安）

```
src/
  pages/
    HomePage.tsx          ← 新規（Sprint 1）
    MorningPage.tsx       ← MorningTab をリファクタリング（Sprint 2）
    EveningPage.tsx       ← EveningTab をリファクタリング（Sprint 2）
    MonthlyPage.tsx       ← MonthlyTab + ReportTab を統合（Sprint 3）
    SettingsPage.tsx      ← WannaBeTab + AI設定を統合（Sprint 4）
  components/
    home/
      ContextCard.tsx     ← 時刻帯ハイライトカード（Sprint 1）
      ProgressRing.tsx    ← 進捗リング（Sprint 1）
      BossCard.tsx        ← ボスタスクカード（Sprint 1）
    monthly/
      ComparisonDash.tsx  ← 比較ダッシュ（Sprint 3）
      WeeklyChart.tsx     ← 週別推移（Sprint 3）
    ai/
      AiCommentBanner.tsx ← 朝・夜コメント（Sprint 4）
      AiSetupForm.tsx     ← 設定支援（Sprint 4）
    layout/
      BottomNav.tsx       ← ナビゲーション（Sprint 1）
  lib/
    storage.ts            ← 引き継ぎ（キー構造は互換レイヤーで吸収）
    timeContext.ts        ← 時刻帯判定ロジック（Sprint 1）
    monthlyAggregator.ts  ← 月次集計ロジック（Sprint 2〜3）
```

---

## 引き継ぎ時の注意事項

- v2 の localStorage キー（`morning:checked:{date}` 等）は Sprint 2 で新スキーマ（`daily:{date}:morning:checked`）に移行する。Sprint 1 では旧キーを読む互換レイヤーを残すこと。
- PWA の `manifest.json` と `vite.config.ts` の PWA プラグイン設定は変更しない。
- `frontend-v2/` ディレクトリ名は維持する（新しいコードも同ディレクトリに書く）。
- Codex は実装前に必ず `CODEX.md` の「Claude からの共有指示」セクションを確認すること。

---

*生成日: 2026-04-15*  
*担当 Planner: Claude (TSUMIKI)*
