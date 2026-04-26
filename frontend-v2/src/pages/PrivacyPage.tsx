export const PrivacyPage = () => {
  return (
    <div className="min-h-screen bg-[#05080d] px-4 py-12 text-white/80">
      <div className="mx-auto max-w-2xl">
        <a
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-xs text-white/40 hover:text-white/60"
        >
          ← 戻る
        </a>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white">
          プライバシーポリシー
        </h1>
        <p className="mt-2 text-xs text-white/40">最終更新: 2026年4月26日</p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="mb-3 text-base font-semibold text-white">1. 収集する情報</h2>
            <p>本サービス（Daily OS）は、以下の情報を収集します。</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-white/70">
              <li>Google または Apple アカウントによる認証情報（メールアドレス、表示名）</li>
              <li>ユーザーが入力した習慣・目標・ジャーナルなどのコンテンツ</li>
              <li>習慣の達成記録・日時などの利用ログ</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-white">2. 情報の利用目的</h2>
            <p>収集した情報は以下の目的にのみ使用します。</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-white/70">
              <li>サービスの提供・機能の実現（AIコーチング、習慣トラッキング等）</li>
              <li>ユーザー認証およびデータの保護</li>
              <li>サービス改善のための匿名的な利用傾向の把握</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-white">3. 第三者への提供</h2>
            <p>
              ユーザーの個人情報を第三者に販売・貸与・開示することはありません。
              ただし、以下のサービスをインフラとして利用しており、データはこれらを経由して処理されます。
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-white/70">
              <li>Supabase（データベース・認証）</li>
              <li>Anthropic（AIコーチング機能）</li>
              <li>Vercel（フロントエンドのホスティング）</li>
              <li>Railway（バックエンドのホスティング）</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-white">4. データの保管と安全性</h2>
            <p>
              データはSupabaseのデータベースに保存され、Row Level Security（RLS）により
              各ユーザーは自身のデータにのみアクセスできます。
              通信はすべてHTTPS（TLS）で暗号化されています。
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-white">5. データの削除</h2>
            <p>
              アカウントの削除を希望する場合は、下記の連絡先までご連絡ください。
              速やかにすべてのデータを削除します。
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-white">6. お問い合わせ</h2>
            <p>
              プライバシーに関するご質問は以下にご連絡ください。
            </p>
            <p className="mt-2 text-white/60">
              メール:{' '}
              <a
                href="mailto:vektojp@gmail.com"
                className="underline hover:text-white/80"
              >
                vektojp@gmail.com
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
