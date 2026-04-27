# Vite + React + TypeScript + Tailwind CSS の環境構築で最初に決めるべき3つのこと

## この記事でわかること

- 2026年時点で「動くスターターキット」をゼロから最速で作る手順
- パスエイリアス・strict mode・Tailwindの設定で最初にやらかしやすい落とし穴
- プロが環境構築で「なぜそう設定するか」を言語化する理由

---

## 背景：環境構築こそ最初の設計判断

習慣設計アプリの開発に入る前に、フロントエンドの土台を作った。
ここで手を抜くと「後で直せばいい」が積み重なって、リファクタリングコストが跳ね上がる。
環境構築は設計判断の連続だ。

### 技術スタックの選定理由

| 技術 | 選定理由 |
|------|---------|
| Vite | HMRが速い。CRAは2023年以降メンテ停止気味 |
| React 18 + TypeScript | 型安全性とエコシステムの成熟度が最高水準 |
| Tailwind CSS v3 | ユーティリティファーストで一貫したデザイン。クラス名の発明が不要 |
| Zustand v4 | Redux比でボイラープレートが圧倒的に少ない。Contextより再レンダリング制御がしやすい |
| TanStack Query v5 | サーバー状態とクライアント状態の分離が自然にできる |

---

## 実装のポイント

### 1. TypeScript strict mode は最初からONにする

```json
// tsconfig.app.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true
  }
}
```

**なぜ最初か：** 後からONにすると既存コード全体に型エラーが噴出する。
最初から `strict: true` で書き続けることで「型でバグを潰す」習慣が自然につく。

### 2. パスエイリアスは `@/` 一択

```typescript
// vite.config.ts
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

```json
// tsconfig.app.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    },
    "ignoreDeprecations": "6.0"
  }
}
```

`../../components/Button` のような相対パス地獄を最初から回避できる。
移動・リネームにも強い。

### 3. Tailwind の content 設定を忘れない

```javascript
// tailwind.config.js
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
```

`content` が空だとビルド後に全CSSが消える。これで30分溶かした経験がある人は多いはず。

---

## ハマったこと：TypeScript 6.0 の `baseUrl` 非推奨警告

```
error TS5101: Option 'baseUrl' is deprecated
```

TypeScript 6.0 から `baseUrl` を `paths` と組み合わせる用途が非推奨になった。
現時点での回避策は `"ignoreDeprecations": "6.0"` を追加すること。
将来的には `paths` のみで解決できる構文に移行する見込み。

---

## アーキテクト視点のまとめ

> 環境構築の設定1つひとつに「なぜそう設定するか」を言語化できるかどうかが、
> ジュニアとシニアの分岐点だと思っている。

設定の「写経」ではなく「意図の理解」が大切。
特に型安全性とパスの設計は、チーム開発になったときに差が出る。

**次回**: バックエンド（FastAPI + Python 3.12）の環境構築編
