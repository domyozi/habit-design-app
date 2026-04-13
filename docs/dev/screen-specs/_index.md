---
last_synced_commit: null
updated_at: "2026-04-13"
groups:
  - name: auth
    screens: [login, onboarding]
  - name: main
    screens: [dashboard, journal]
  - name: wanna-be
    screens: [wanna-be]
  - name: goals
    screens: [goals]
  - name: review
    screens: [weekly-review]
  - name: tracking
    screens: [tracking]
  - name: settings
    screens: [settings]
---

# 画面一覧

| 画面ID | 画面名 | パス | 認証 | グループ | 備考 |
|--------|--------|------|------|---------|------|
| login | ログイン | /login | 不要 | auth | Google/Apple OAuth |
| onboarding | オンボーディング | /onboarding | 必要 | auth | 初回のみ。Wanna Be入力 + AI提案承認 |
| dashboard | ダッシュボード | / | 必要 | main | 今日の習慣チェックリスト |
| journal | デイリーハブ | /journal | 必要 | main | 音声/テキスト一入力。時刻でコンテキスト自動判別 |
| wanna-be | Wanna Be 設定 | /wanna-be | 必要 | wanna-be | AI分析SSEストリーミング |
| goals | 長期目標管理 | /goals | 必要 | goals | AI提案目標のCRUD |
| weekly-review | 週次レビュー | /weekly-review | 必要 | review | AIフィードバックSSE + 習慣変更承認 |
| tracking | 習慣トラッキング可視化 | /tracking | 必要 | tracking | 達成率グラフ・カレンダー |
| settings | 設定 | /settings | 必要 | settings | 通知設定・バッジ。Phase 2で外部連携追加予定 |

## 画面遷移フロー

### 認証フロー
```
login --[Googleログイン（初回）]--> onboarding
login --[Googleログイン（既存）]--> /
onboarding --[AI分析・承認完了]--> /
```

### 日次ルーティンフロー
```
/ --[デイリーハブへ]--> /journal
/journal --[完了]--> /
/ --[習慣チェック・音声入力]--> /（その場で更新）
```

### AI分析フロー（Wanna Be）
```
/ --[Wanna Be設定へ]--> /wanna-be
/wanna-be --[AIに相談する → SSEストリーミング → 承認]--> /
/wanna-be --[目標確認]--> /goals
```

### 週次レビューフロー
```
/ --[週次レビューへ]--> /weekly-review
/weekly-review --[AI提案承認 → 習慣変更]--> /weekly-review
```

### トラッキング・設定フロー
```
/ --[トラッキングへ]--> /tracking
/ --[設定へ]--> /settings
/settings --[ログアウト]--> /login
```

## 到達不能画面チェック

- ⚠️ なし（全9画面に到達経路あり）

## ソース情報

- **生成モード**: from-plan
- **元 Plan**: habit-design-app
- **受け入れ条件**: docs/spec/habit-design-app/acceptance-criteria.md
- **ロードマップ**: docs/roadmap.md（Phase 2 外部連携設計）
- **注意**: `last_synced_commit: null` はソースコード実装前のため。実装後に `/dev-screen-spec update` で同期すること
