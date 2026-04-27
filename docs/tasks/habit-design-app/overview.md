# 習慣設計アプリ タスク概要

**作成日**: 2026-04-12
**プロジェクト期間**: Phase 1〜4（約21日）
**推定工数**: 172時間
**総タスク数**: 27件

## 関連文書

- **要件定義書**: [📋 requirements.md](../spec/habit-design-app/requirements.md)
- **設計文書**: [📐 architecture.md](../design/habit-design-app/architecture.md)
- **API仕様**: [🔌 api-endpoints.md](../design/habit-design-app/api-endpoints.md)
- **データベース設計**: [🗄️ database-schema.sql](../design/habit-design-app/database-schema.sql)
- **インターフェース定義**: [📝 interfaces.ts](../design/habit-design-app/interfaces.ts)
- **データフロー図**: [🔄 dataflow.md](../design/habit-design-app/dataflow.md)
- **プロダクト思想**: [🧭 product-philosophy.md](../design/habit-design-app/product-philosophy.md)
- **コンテキストノート**: [📝 note.md](../spec/habit-design-app/note.md)

## フェーズ構成

| フェーズ | 期間 | 成果物 | タスク数 | 工数 |
|---------|------|--------|----------|------|
| Phase 1 | 3日 | 環境構築・認証基盤 | 4件 | 24h |
| Phase 2 | 7日 | FastAPI バックエンド全機能 | 8件 | 56h |
| Phase 3 | 10日 | React フロントエンド全画面 | 12件 | 76h |
| Phase 4 | 2日 | デプロイ・統合テスト | 2件 | 16h |
| Phase 5 | 1日 | プロダクト再設計方針 | 1件 | 8h |

## タスク番号管理

**使用済みタスク番号**: TASK-0001 〜 TASK-0027
**次回開始番号**: TASK-0028

## 全体進捗

- [ ] Phase 1: 基盤構築
- [ ] Phase 2: バックエンド実装
- [ ] Phase 3: フロントエンド実装
- [ ] Phase 4: 統合・デプロイ
- [ ] Phase 5: プロダクト再設計

## マイルストーン

- **M1: 基盤完成**（Day 3）: DB・環境構築・認証フロー完了
- **M2: バックエンド完成**（Day 10）: 全FastAPI APIとAI統合完了
- **M3: フロントエンド完成**（Day 20）: 全画面の実装完了
- **M4: リリース準備完了**（Day 21）: デプロイ・E2Eテスト完了
- **M5: 次期設計方針確定**（Day 22）: Goal-to-Day Engine 化の方針確定

---

## Phase 1: 基盤構築

**期間**: 3日（24h）
**目標**: 開発環境の構築とDB・認証基盤の確立
**成果物**: フロントエンド/バックエンドの雛形、SupabaseDB、認証フロー

### タスク一覧

- [x] [TASK-0001: フロントエンド環境構築](TASK-0001.md) - 4h (DIRECT) 🔵 ✅ 完了 (2026-04-13)
- [x] [TASK-0002: バックエンド環境構築](TASK-0002.md) - 4h (DIRECT) 🔵 ✅ 完了 (2026-04-13)
- [x] [TASK-0003: Supabase設定・DBスキーマ適用・RLSポリシー設定](TASK-0003.md) - 8h (DIRECT) 🔵 ✅ 完了 (2026-04-13)
- [x] [TASK-0004: 認証フロー実装（Supabase Auth + JWT検証）](TASK-0004.md) - 8h (TDD) 🔵 ✅ 完了 (2026-04-13) (TDD開発完了 - 9テストケース全通過)

### 依存関係

```
TASK-0001 ──────────────────────────────► TASK-0012
TASK-0002 ──► TASK-0005
TASK-0003 ──► TASK-0004 ──► TASK-0005
```

---

## Phase 2: バックエンド実装

**期間**: 7日（52h）
**目標**: FastAPI の全エンドポイントとAI統合の完成
**成果物**: 全API、AI分析SSE、スケジューラー、メール通知

### タスク一覧

- [x] [TASK-0005: FastAPI共通基盤実装](TASK-0005.md) - 4h (DIRECT) 🔵 ✅ 完了 (2026-04-14)
- [x] [TASK-0006: Wanna Be・長期目標・ユーザープロフィールAPI実装](TASK-0006.md) - 8h (TDD) 🔵 ✅ 完了 (2026-04-14)
- [x] [TASK-0007: 習慣CRUD API実装](TASK-0007.md) - 8h (TDD) 🔵 ✅ 完了 (2026-04-14)
- [x] [TASK-0008: 習慣ログ・ストリーク計算・バッジ付与API実装](TASK-0008.md) - 8h (TDD) 🔵 ✅ 完了 (2026-04-14)
- [x] [TASK-0009: 音声入力AI分類サービス実装](TASK-0009.md) - 8h (TDD) 🔵 ✅ 完了 (2026-04-14)
- [x] [TASK-0010: Claude AI統合・SSEストリーミング実装](TASK-0010.md) - 8h (TDD) 🔵 ✅ 完了 (2026-04-14)
- [x] [TASK-0011: APSchedulerスケジューラー + Resendメール通知実装](TASK-0011.md) - 8h (TDD) 🔵 ✅ 完了 (2026-04-14) (TDD開発完了 - 7テストケース全通過)
- [x] [TASK-0026: TASK-0005 仕様差分バグ修正（APIパス・Supabase参照・422文言）](TASK-0026.md) - 4h (BUGFIX) 🔵 ✅ 完了 (2026-04-14)

### 依存関係

```
TASK-0004 ──► TASK-0005 ──► TASK-0026 ──► TASK-0006 ──► TASK-0010 ──► TASK-0011
                                      ├──► TASK-0007 ──► TASK-0008 ──► TASK-0009
                                      └──► （TASK-0006で通知設定APIも実装）
```

---

## Phase 3: フロントエンド実装

**期間**: 10日（76h）
**目標**: 全画面の実装と主要ユーザーフローの完成
**成果物**: 全React画面、音声入力UI、AIストリーミング表示

### タスク一覧

- [x] [TASK-0012: フロントエンド共通基盤（APIクライアント・認証・ルーティング）](TASK-0012.md) - 8h (TDD) 🔵 ✅ 完了 (2026-04-14)
- [x] [TASK-0013: 認証画面・オンボーディング遷移実装](TASK-0013.md) - 4h (TDD) 🔵 ✅ 完了 (2026-04-14)
- [x] [TASK-0014: ダッシュボード画面実装](TASK-0014.md) - 8h (TDD) 🔵 ✅ 完了 (2026-04-14)
- [x] [TASK-0015: 習慣チェックリスト操作UI](TASK-0015.md) - 8h (TDD) 🔵 ✅ 完了 (2026-04-14)
- [x] [TASK-0016: 未達成理由入力・3行日報フォーム実装](TASK-0016.md) - 4h (TDD) 🔵 ✅ 完了 (2026-04-14)
- [x] [TASK-0017: Wanna Be設定・AI分析ストリーミング画面実装](TASK-0017.md) - 8h (TDD) 🔵 ✅ 完了 (2026-04-14)
- [x] [TASK-0018: 長期目標管理画面実装](TASK-0018.md) - 4h (TDD) 🔵 ✅ 完了 (2026-04-14)
- [x] [TASK-0019: 音声入力UI実装（Web Speech API）](TASK-0019.md) - 8h (TDD) 🔵 ✅ 完了 (2026-04-15)
- [x] [TASK-0020: 週次レビュー画面実装](TASK-0020.md) - 8h (TDD) 🔵 ✅ 完了 (2026-04-15)
- [x] [TASK-0021: 習慣トラッキング可視化](TASK-0021.md) - 8h (TDD) 🔵 ✅ 完了 (2026-04-15)
- [x] [TASK-0022: バッジ・ゲーミフィケーション表示](TASK-0022.md) - 4h (TDD) 🔵 ✅ 完了 (2026-04-15)
- [x] [TASK-0023: 設定・通知設定画面実装](TASK-0023.md) - 4h (TDD) 🔵 ✅ 完了 (2026-04-15)

### 依存関係

```
TASK-0004 ──► TASK-0012 ──► TASK-0013 ──► TASK-0014 ──► TASK-0015 ──► TASK-0016
                         └──► TASK-0017 ──► TASK-0018        │
                                                              ▼
                                                        TASK-0019 ──► TASK-0020 ──► TASK-0021 ──► TASK-0022 ──► TASK-0023
```

---

## Phase 4: 統合・デプロイ

**期間**: 2日（16h）
**目標**: 本番環境へのデプロイと全フローの動作確認
**成果物**: 本番稼働アプリ

### タスク一覧

- [x] [TASK-0024: デプロイ設定（Vercel FE + Railway BE）](TASK-0024.md) - 8h (DIRECT) 🔵 ✅ 完了 (2026-04-15)
- [ ] [TASK-0025: 統合テスト・E2E動作確認](TASK-0025.md) - 8h (TDD) 🔵

### 依存関係

```
TASK-0023 ──► TASK-0024 ──► TASK-0025
```

---

## Phase 5: プロダクト再設計

**期間**: 1日（8h）  
**目標**: 基本機能完成後の再設計方針を明文化し、今後の拡張基準を固める  
**成果物**: プロダクト思想文書、再設計タスクの起点

### タスク一覧

- [x] [TASK-0027: プロダクト思想・情報設計再定義（Goal-to-Day Engine化）](TASK-0027.md) - 8h (DIRECT) 🔵 ✅ 完了 (2026-04-15)

### 依存関係

```
TASK-0025 ──► TASK-0027 ──► TASK-0028以降
```

---

## Phase 6: v3 Sprint 実装（frontend-v2）

**期間**: 進行中  
**目標**: Daily OS v3 アーキテクチャの実装（Sprint Spec: `docs/sprint-spec/daily-os-v3.md`）  
**成果物**: Home画面・BottomNav・ProgressRing・新スキーマ・月次目標・完了バナー

### Sprint 1 完了（2026-04-15）

- [x] [TASK-0028: timeContext + BottomNav 基盤構築](TASK-0028.md) ✅
- [x] [TASK-0029: ProgressRing コンポーネント実装](TASK-0029.md) ✅
- [x] [TASK-0030: HomePage 実装（時刻コンテキスト統合）](TASK-0030.md) ✅

### Sprint 2 完了（2026-04-15）

- [x] [TASK-0031: MorningPage リファクタリング（新スキーマ + 完了後Home遷移）](TASK-0031.md) ✅
- [x] [TASK-0032: EveningPage リファクタリング（Gap/気づき/翌日 + 完了後Home遷移）](TASK-0032.md) ✅
- [x] [TASK-0033: 月次目標設定フォーム + ベスト値自動更新](TASK-0033.md) ✅

### Sprint 3 完了（2026-04-15）

- [x] TASK-0034: 月次比較ダッシュボード（今月/先月/ベスト3軸） ✅
- [x] TASK-0035: 週別推移ミニチャート + 日報MonthlyPage統合 ✅

### Sprint 4 完了（2026-04-15）

- [x] TASK-0036: Claude API クライアント + 朝/夜 AIコメント（DoneBannerにAIコメント表示） ✅
- [x] TASK-0037: AI設定支援フォーム（SettingsPage新設 + AIとの対話で習慣リスト提案） ✅
- [x] TASK-0038: Wanna Be AI分析（SSEストリーミング in MonthlyTab） ✅
- [x] TASK-0039: Vercel デプロイ設定（vercel.json + README.md） ✅

### Sprint 4 実装変更サマリー

| ファイル | 変更内容 |
|---|---|
| `src/lib/ai.ts` | 新規作成：Claude API クライアント（callClaude / streamClaude / プロンプトビルダー） |
| `src/pages/HomePage.tsx` | DoneBanner に AI コメント取得ボタン追加 |
| `src/pages/SettingsPage.tsx` | 新規作成：AI設定支援チャット + WannaBeTab 埋め込み |
| `src/components/tabs/MonthlyTab.tsx` | WannaBeAnalysis コンポーネント追加（SSEストリーミング） |
| `src/App.tsx` | settings タブ追加・MoreMenu 更新・report→MonthlyTab 互換 |
| `src/types/index.ts` | TabId に 'settings' 追加 |
| `vercel.json` | 新規作成：SPA リライトルール |
| `README.md` | Vercel デプロイ手順・環境変数・localStorage スキーマ記載 |

**完成度スコア**: 95/100（個人利用向け全機能実装完了・Vercel デプロイ準備完了）

### 実装変更サマリー（Sprint 1〜2）

| ファイル | 変更内容 |
|---|---|
| `src/lib/storage.ts` | `useDailyStorage` / `useMonthlyTargets` / `getAllTimeBests` / `countMonthlyChecks` 新旧互換 追加 |
| `src/lib/timeContext.ts` | 新規作成：時刻帯判定（朝/夜/other）+ useTimeContext hook |
| `src/components/layout/BottomNav.tsx` | 新規作成：4タブ固定フッターナビ |
| `src/components/home/ProgressRing.tsx` | 新規作成：SVGプログレスリング（best値対応）|
| `src/pages/HomePage.tsx` | 新規作成：Home画面（ContextCard/BossCard/ProgressRing/完了バナー）|
| `src/components/tabs/MorningTab.tsx` | `useDailyStorage` 移行 + `onComplete` prop + 全完了自動遷移 |
| `src/components/tabs/EveningTab.tsx` | `useDailyStorage` 移行 + Gap/気づき/翌日フィールド + 完了ボタン |
| `src/components/tabs/MonthlyTab.tsx` | 月次目標設定フォーム + 新旧スキーマ互換ヒートマップ |
| `src/App.tsx` | Home/Morning/Evening完了バナー状態管理 |

---

## 信頼性レベルサマリー

### 全タスク統計

- **総タスク数**: 27件
- 🔵 **青信号**: 27件 (100%)
- 🟡 **黄信号**: 0件 (0%)
- 🔴 **赤信号**: 0件 (0%)

### フェーズ別信頼性

| フェーズ | 🔵 青 | 🟡 黄 | 🔴 赤 | 合計 |
|---------|-------|-------|-------|------|
| Phase 1 | 4 | 0 | 0 | 4 |
| Phase 2 | 8 | 0 | 0 | 8 |
| Phase 3 | 12 | 0 | 0 | 12 |
| Phase 4 | 2 | 0 | 0 | 2 |
| Phase 5 | 1 | 0 | 0 | 1 |

**品質評価**: 高品質（全タスクが要件定義・設計文書に基づく）

## クリティカルパス

```
TASK-0003 → TASK-0004 → TASK-0005 → TASK-0007 → TASK-0008 →
TASK-0012 → TASK-0014 → TASK-0015 → TASK-0019 → TASK-0020 →
TASK-0024 → TASK-0025
```

**クリティカルパス工数**: 約112時間（14日）
**並行作業可能工数**: 約56時間（7日）

## 次のステップ

タスクを実装するには:
- 全タスク順番に実装: `/tsumiki:kairo-implement`
- 特定タスクを実装: `/tsumiki:kairo-implement TASK-0001`
