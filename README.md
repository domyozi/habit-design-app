# Habit Design App

「未来の自分から逆算して習慣を設計し、トラッキングする」個人向け Daily OS。
朝のジャーナル → AI コーチの応答 → 提案カード (タスク / 習慣) を承認 → 当日の実行へ、を 1 ループに収める設計。

---

## 🎯 Portfolio highlight — LLM-as-judge 評価パイプライン

このリポジトリで最も力を入れた領域は **AI コーチ応答の評価システム**。

> 「LLM の応答品質を **数値で測定**し、prompt 改修の効果を CI で自動検出する」フルスタック実装。
> 1 行 prompt 改修で `avg 3.95 → 4.32 (+9.4%)` を実測し、CI で再現可能なループにした。

### 詳しいドキュメント

- 📄 **[docs/coach-eval/README.md](docs/coach-eval/README.md)** — 設計判断 (rubric, CoT, defense-in-depth)、アーキテクチャ、結果数値
- 🧰 **[claude-eval-kit](https://github.com/domyozi/claude-eval-kit)** — 上記システムを汎用化した別リポジトリ (MIT、~500 LOC、CI 統合済み)

### 関連コード (このリポジトリ内)

| ファイル | 役割 |
|---|---|
| [`backend/app/services/coach_prompts.py`](backend/app/services/coach_prompts.py) | 評価対象 = 本番 coach prompt (XML section 構造) |
| [`backend/app/services/coach_eval.py`](backend/app/services/coach_eval.py) | rubric / judge / sample / 永続化 |
| [`backend/app/services/coach_eval_replay.py`](backend/app/services/coach_eval_replay.py) | 同一 input → fresh AI 応答を生成して採点 |
| [`backend/app/services/coach_extractor.py`](backend/app/services/coach_extractor.py) | minimal-input ガード (defense-in-depth) |
| [`backend/app/api/routes/admin_eval.py`](backend/app/api/routes/admin_eval.py) | dashboard 用 admin API |
| [`backend/migrations/add_coach_eval_runs.sql`](backend/migrations/add_coach_eval_runs.sql) | 永続化スキーマ (RLS deny-by-default) |

---

## 構成

```
habit-design-app/
├── frontend-v3/   ← 現行フロントエンド (React 19 + Vite + TS)
├── backend/       ← FastAPI + Anthropic + Supabase
├── docs/
│   ├── coach-eval/   ← LLM-as-judge eval の portfolio writeup
│   └── design/
└── archive/       ← 旧バージョン (参照不要)
```

`frontend-v3` 以外のフロントは archived 扱いで現行開発の対象外。

## 技術スタック

| Layer | Stack |
|---|---|
| Frontend | React 19 + Vite + TypeScript + Tailwind CSS |
| Backend | FastAPI (Python 3.12) + Anthropic SDK (direct, no LangChain) |
| DB / Auth | Supabase (Postgres + Auth + Storage) |
| Hosting | Vercel (FE) + Railway (BE) |
| External | Google Calendar API, Anthropic Claude (Haiku / Sonnet) |
| Eval | claude-eval-kit (LLM-as-judge, GitHub Actions CI) |

---

## 主な設計判断 (面接で語れるポイント)

1. **LangChain を採用しない**: Anthropic SDK の直叩きが現代の idiomatic な構成。LangChain の memory 抽象より、自前の `CoachUserContext` (identity / patterns / values_keywords / insights / profile) のほうが domain-specific で表現力が高い
2. **Defense in depth**: AI が「OK!」のような短い相槌で勝手に提案を 4 件出す事故を、**prompt 層 (circuit breaker)** と **backend 層 (post-filter)** の二重で防御。LLM を「ルールに従う」期待ではなく「ルールが破れても安全」設計に
3. **memory_patch policy**: ユーザーが意図的に消した属性 (例: 妊娠情報) を AI が再生成して書き戻す事故を、`profile` 更新ゲートで防止。確信度別の動作 (`≥0.7` 直適用 / `0.5〜0.7` confirmation 必須 / `<0.5` 何もしない) を明文化
4. **モバイル PWA は分離設計**: モバイル UX は別レイヤー (= 別リポジトリ [BusyBoy2](https://github.com/domyozi/BusyBoy2)) に切り出し。同じ backend を共有

---

## ローカル開発

### Frontend (frontend-v3)

```bash
cd frontend-v3
npm install
cp .env.example .env.local
# .env.local に VITE_API_BASE_URL=http://localhost:8000 を設定
npm run dev
```

### Backend

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# .env に Supabase / Anthropic / Google OAuth キーを設定
uvicorn app.main:app --reload
```

### Eval を走らせる

```bash
cd backend
source .venv/bin/activate

# 過去 journal から N 件採点
python scripts/run_coach_eval.py --limit 30 --label baseline --save-to-db

# fixture (固定 user_input) を現 prompt で再生成して採点
python scripts/run_coach_eval_replay.py \
  --fixture tests/fixtures/coach_eval_pairs.json \
  --label "after-fix" \
  --baseline tests/fixtures/coach_eval_baseline.json
```

---

## License

個人開発プロジェクト。コードは公開していますが現状ライセンス未定。
コードの一部 (LLM-as-judge framework) は MIT で [claude-eval-kit](https://github.com/domyozi/claude-eval-kit) として別途公開しています。

## Contact

プライバシー / データ削除に関するご質問: `vektojp@gmail.com`
