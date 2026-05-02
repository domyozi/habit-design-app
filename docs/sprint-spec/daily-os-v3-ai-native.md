# Daily OS v3 — AI-native（Sprint Spec）

**プロダクト名:** Daily OS · AI-native habit app
**設計思想:** 朝/夜タブを廃止し Flow（独白型AIジャーナル）に統合。時間帯は上部 horizon band が常時可視化。Habits は計測タイプ（10種）+ 外部連携 + 写真証明 + XP。AI Memory で AI が記憶している情報を透明化。
**ベース:** `frontend-v3/` を本リポジトリに新設。`backend/` は additive に拡張。`frontend-v2/` は MVP 安定後に `archive/frontend-v2/` へ退避。
**前バージョン:** `daily-os-v3-legacy.md`（localStorage前提・4タブ構成。新デザインと整合しないため凍結）

---

## 引き継ぎ資産

| 資産 | 内容 |
|---|---|
| `backend/app/api/routes/habits.py` | habits + habit_logs CRUD（metric_type / unit / target_value 対応済み） |
| `backend/app/api/routes/journal.py` | Flow と等価。free-form content + entry_type + 非同期 AI 抽出 |
| `backend/app/api/routes/user_context.py` | AI Memory（identity / patterns / values_keywords / insights / goal_summary） |
| `backend/app/api/routes/primary_target.py` | Today の primary target（ボス） |
| `backend/app/api/routes/integrations.py` | Apple Health / Shortcuts 連携 |
| `backend/app/api/routes/kpis.py` | KPI 集計 |
| `backend/app/api/routes/notes.py` | Notes 保存 |
| `frontend-v2/src/lib/` | api クライアント / supabase 設定 / storage hooks |

---

## 画面アーキテクチャ（デスクトップ7画面）

```
01 · Today    いま何をすべきか / primary target / active window
02 · Flow     AI 対話型ジャーナル / 宣言 + 振り返り + タスク化
03 · Habits   習慣一覧 + AI サジェスト + コミュニティプリセット
04 · Signals  ヒートマップ + 相関分析 + AI インサイト
05 · Memory   AI 記憶（Identity / Patterns / Keywords）+ Diary 履歴
06 · Notes    長文ノートエディタ
07 · Calendar habits + tasks + flow を24時間軸に統合
```

全画面は `AppChrome`（top bar + horizon band + content）でラップ。`useTheme(hour)` が 7 段階のパレットを返し、全画面の paper / accent / wash が時間帯で変化する。

### 時間帯テーマ（7段階）

| Phase | 時間帯 | accent | paper | paperWarm | greeting |
|---|---|---|---|---|---|
| dawn | 05–09 | #c44d2e (朱) | #fbf8f1 | #f5ecdb | おはようございます |
| morning | 09–12 | #b86a2e (琥珀) | #fafaf5 | #f3eee0 | おはようございます |
| noon | 12–15 | #7e8a3c (オリーブ) | #fafaf7 | #f0eee5 | こんにちは |
| afternoon | 15–18 | #3a6d8a (青磁) | #f7f8f5 | #ebede4 | こんにちは |
| evening | 18–22 | #7a3d6e (葡萄) | #f6f3ee | #ece4dd | おつかれさまです |
| night | 22–02 | #3d4a8a (藍) | #f1f0ec | #e6e3da | おつかれさまでした |
| late | 02–05 | #3a3d4e (鉛色) | #eeece8 | #e0ddd4 | もう休む時間です |

共通色: `line: #1d1f1e`、`ink: #0b0c0b`、ink at 70/50/30/12/06 % opacity。フォント: `Inter Tight`（sans）+ `JetBrains Mono`（mono）。

---

## データモデル（バックエンド既存 + 拡張）

### Habit（既存 + 追加）

```ts
interface Habit {
  // 既存
  id, user_id, goal_id, title, description, frequency, scheduled_time;
  metric_type: 'binary' | 'numeric_min' | 'numeric_max' | 'duration' | 'range' | 'time_before' | 'time_after';
  target_value, target_value_max, target_time, unit, aggregation;
  current_streak, longest_streak, is_active;
  // Sprint 2 で追加
  proof_type?: 'none' | 'photo' | 'auto';   // 写真証明 / 自動取込 / なし
  xp_base?: number;                           // 基本 XP
  source_kind?: 'manual' | 'apple-watch' | 'nike-run' | 'strava' | 'health-app' | 'photo' | 'calendar';
}

interface HabitLog {
  // 既存
  id, habit_id, user_id, log_date, completed, completed_at, input_method, numeric_value, time_value;
  // Sprint 2 で追加
  proof_url?: string;        // Supabase Storage の habit-proofs バケット URL
  xp_earned?: number;        // 当該ログでの XP
}
```

### 計測タイプテンプレート（フロント定義）

UI 上の 10 種テンプレを既存 `metric_type` + `unit` にマップ：

| Template | metric_type | unit | proof | source 例 |
|---|---|---|---|---|
| boolean (◯) | binary | (none) | none | manual |
| count (#) | numeric_min | 回 | photo | manual / photo |
| duration (⏱) | duration | 分 | none | manual |
| pages (📖) | numeric_min | p | photo | manual / photo |
| time-target (🌅) | time_before | 時刻 | auto | apple-watch |
| score (△) | numeric_min | 点 | photo | manual / photo |
| distance (→) | numeric_min | km | auto | nike-run / strava |
| weight (⚖) | numeric_max | kg | auto | health-app |
| currency (¥) | numeric_min | 円 | none | manual |
| words (◧) | numeric_min | 語 | none | manual |

### AI Memory（既存）

`user_context` テーブルに既に `identity / patterns / values_keywords / insights / goal_summary` が JSONB で保持されている。Memory 画面は GET/PATCH `/api/user-context` を流用。

### Flow（既存）

`journal_entries` に `entry_date / content / entry_type / raw_input` が保持されている。`entry_type` を Flow の mode（declaration / reflection / brainstorm / planning）にマップ。

---

## スプリント計画

### Sprint 0 — Bootstrap（このスプリントで完了）

- `frontend-v3/` を Vite + React 19 + TS + Tailwind 3 で初期化
- `lib/theme.ts`：7段階 time-of-day テーマトークン
- `components/chrome/{AppChrome,HorizonBand,NavRail}.tsx`：top bar + 24h horizon band + 7nav
- `pages/{Today,Flow,Habits,Signals,Memory,Notes,Calendar}Page.tsx`：プレースホルダー
- react-router で 7画面に遷移可能
- `npm run build` 成功

### Sprint 1 — Today + Flow 雛形

- Today: primary target / active window CTA / 今月進捗リング / 今日の habits ミニ一覧
- Flow: 独白コンポーザー + 履歴カード + 右ペインに AI extraction 表示
- 既存 `/api/primary-target` `/api/habits` `/api/journals` を流用

### Sprint 2 — Habits（計測タイプ + 写真証明 + XP）

- `lib/habitTemplates.ts`：10種テンプレ → metric_type+unit マッピング
- HabitsPage：type 別 row（AUTO / +PHOTO バッジ / 30日トレンド / streak）
- 新規ウィザード（type → 目標 → ソース）
- backend migration `add_habit_proof_xp.sql`：habits の proof_type / xp_base / source_kind、habit_logs の proof_url / xp_earned
- Supabase Storage `habit-proofs` バケット + RLS policy

### Sprint 3 — Signals + Memory

- Signals: type 別グラフ（duration→bar+target / distance→bar+pace / score→line+target / weight→反転line / boolean→dot grid / time-target→bar height as time / currency→cumulative area）
- backend `signals.py` 新ルート `/api/signals/{habit_id}`（30日 series + breakdown）
- Memory: GET/PATCH `/api/user-context` で identity / patterns / values_keywords / insights を編集

### Sprint 4 — Notes + Calendar

- Notes: TipTap で v2 から踏襲（必要なら schemas に Note 追加）
- Calendar: 24h 軸に habits / tasks / flow を統合（FE 集約 or `/api/calendar/day`）

### Sprint 5 — テーマ磨き込み + v2 退役判断

- 全画面の time-of-day tinting 最終調整
- `frontend-v2/` を `archive/frontend-v2/` へ退避するか判断

---

## モバイル版（後回し）

ハル / XP / Wizard を含むモバイル版（Companion / Flow / Habits / Signals / Wizard 5画面）はデスクトップ MVP 完了後に着手。`frontend-v3-mobile/` 別ディレクトリ or PWA ルートで判断する。

---

## 重要な参照ファイル

1. デザイン本体: `https://api.anthropic.com/v1/design/h/o_E_taYz2W82n53HDG66cg?open_file=Daily+OS+AI-native.html`（gzip）
2. ローカル展開: `/tmp/daily-os-design/dailyos/project/Daily OS AI-native.html` + `app-shared.jsx` + `app-chrome.jsx` + `screen-*.jsx`
3. 視覚トーン: `/tmp/daily-os-design/dailyos/project/refs/tone-*.png`
4. 既存資産: `frontend-v2/src/lib/`, `backend/app/api/routes/`, `backend/app/models/schemas.py`
5. プラン本体: `/Users/tsukasaakiyama/.claude/plans/fetch-this-design-file-linked-rossum.md`
