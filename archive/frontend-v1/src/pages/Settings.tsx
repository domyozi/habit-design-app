/**
 * 設定・通知設定画面
 * TASK-0023: 設定・通知設定画面実装
 *
 * 実装内容:
 * - プロフィール表示（display_name）
 * - 通知メールアドレス入力（REQ-801）
 * - 通知オン/オフトグルスイッチ（REQ-802）
 * - 週次レビュー曜日設定（REQ-701）
 * - バッジギャラリー（TASK-0022）
 * - ログアウトボタン
 * - 保存ボタン（PATCH /users/me）
 *
 * 🔵 信頼性レベル: REQ-701/801/802 より
 */
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { apiGet, apiPatch } from '@/lib/api'
import { BadgeGallery } from '@/components/badges/BadgeGallery'
import type { UserProfile, BadgeDefinition, UserBadge } from '@/types/interfaces'
import type { ApiResponse } from '@/types/interfaces'

// ========================================
// フォーム型
// ========================================

interface SettingsFormValues {
  notification_email: string
  notification_enabled: boolean
  weekly_review_day: number
}

// ========================================
// バッジモックデータ（TASK-0023: APIフェッチは後続タスクで）
// ========================================

const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    id: 'streak_7',
    name: '7日連続達成',
    description: '7日間連続で習慣を達成しました',
    condition_type: 'streak',
    condition_value: 7,
    icon_name: '🔥',
  },
  {
    id: 'streak_30',
    name: '30日連続達成',
    description: '30日間連続で習慣を達成しました',
    condition_type: 'streak',
    condition_value: 30,
    icon_name: '⭐',
  },
  {
    id: 'streak_100',
    name: '100日連続達成',
    description: '100日間連続で習慣を達成しました',
    condition_type: 'streak',
    condition_value: 100,
    icon_name: '👑',
  },
  {
    id: 'total_50',
    name: '累計50回達成',
    description: '習慣を合計50回達成しました',
    condition_type: 'total_count',
    condition_value: 50,
    icon_name: '💪',
  },
  {
    id: 'total_100',
    name: '累計100回達成',
    description: '習慣を合計100回達成しました',
    condition_type: 'total_count',
    condition_value: 100,
    icon_name: '💯',
  },
  {
    id: 'weekly_rate_80',
    name: '週間達成率80%',
    description: '1週間の習慣達成率が80%以上でした',
    condition_type: 'weekly_rate',
    condition_value: 80,
    icon_name: '📈',
  },
  {
    id: 'weekly_rate_100',
    name: '完璧な1週間',
    description: '1週間の習慣達成率が100%でした',
    condition_type: 'weekly_rate',
    condition_value: 100,
    icon_name: '🌟',
  },
  {
    id: 'first_habit',
    name: 'はじめの一歩',
    description: '初めて習慣を達成しました',
    condition_type: 'total_count',
    condition_value: 1,
    icon_name: '🌱',
  },
]

const EARNED_BADGES: UserBadge[] = []

// ========================================
// 曜日選択肢
// ========================================

const DAY_OPTIONS = [
  { value: 1, label: '月曜日' },
  { value: 2, label: '火曜日' },
  { value: 3, label: '水曜日' },
  { value: 4, label: '木曜日' },
  { value: 5, label: '金曜日' },
  { value: 6, label: '土曜日' },
  { value: 7, label: '日曜日' },
]

// ========================================
// Settings コンポーネント
// ========================================

const Settings = () => {
  const navigate = useNavigate()
  const { signOut, user } = useAuthStore()

  // プロフィール取得
  const { data: profile } = useQuery<UserProfile>({
    queryKey: ['userProfile'],
    queryFn: async () => {
      const res = await apiGet<ApiResponse<UserProfile>>('/api/users/me')
      return (res as ApiResponse<UserProfile>).data!
    },
  })

  // フォーム管理
  const { register, handleSubmit, reset, formState: { isDirty } } = useForm<SettingsFormValues>({
    defaultValues: {
      notification_email: '',
      notification_enabled: true,
      weekly_review_day: 5,
    },
  })

  // プロフィールが取得できたらフォーム初期値を設定
  useEffect(() => {
    if (profile) {
      reset({
        notification_email: profile.notification_email ?? '',
        notification_enabled: profile.notification_enabled ?? true,
        weekly_review_day: profile.weekly_review_day ?? 5,
      })
    }
  }, [profile, reset])

  // 保存ミューテーション
  const { mutate, isPending, isError } = useMutation({
    mutationFn: (data: SettingsFormValues) =>
      apiPatch<ApiResponse<UserProfile>>('/api/users/me', data),
  })

  const onSubmit = (data: SettingsFormValues) => {
    mutate({
      ...data,
      weekly_review_day: Number(data.weekly_review_day),
    })
  }

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="px-4 py-8 pb-12">
      <div className="mx-auto max-w-lg space-y-4">
        {/* ヘッダー */}
        <div className="rounded-[28px] border border-white/10 p-5" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300/80">Preferences</p>
          <h1 className="mt-2 text-2xl font-bold text-white">設定</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            通知、週次レビュー、バッジの進捗をまとめて管理します。
          </p>
        </div>

        {/* プロフィールセクション */}
        <div
          className="rounded-2xl p-5"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">
            プロフィール
          </h2>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-lg font-bold text-white/70">
              {profile?.display_name?.[0] ?? user?.email?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div>
              <p data-testid="display-name" className="font-semibold text-white">
                {profile?.display_name ?? '（名前未設定）'}
              </p>
              <p className="text-sm text-white/40">{user?.email}</p>
            </div>
          </div>
        </div>

        {/* 通知・週次設定フォーム */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="rounded-2xl p-5"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-white/40">
            通知・レビュー設定
          </h2>

          <div className="space-y-5">
            {/* 通知メールアドレス（REQ-801） */}
            <div>
              <label htmlFor="notification-email" className="mb-1 block text-sm font-medium text-white/80">
                通知メールアドレス
              </label>
              <input
                id="notification-email"
                data-testid="notification-email-input"
                type="email"
                className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm text-white placeholder-white/25 focus:border-emerald-400/60 focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
                placeholder="example@email.com"
                {...register('notification_email')}
              />
            </div>

            {/* 通知オン/オフ（REQ-802） */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white/80">通知を有効にする</span>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  data-testid="notification-enabled-toggle"
                  type="checkbox"
                  className="peer sr-only"
                  {...register('notification_enabled')}
                />
                <div className="peer h-6 w-11 rounded-full bg-white/10 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white/60 after:transition-all after:content-[''] peer-checked:bg-emerald-500/70 peer-checked:after:translate-x-full peer-checked:after:bg-white peer-focus:ring-2 peer-focus:ring-emerald-400/30" />
              </label>
            </div>

            {/* 週次レビュー曜日（REQ-701） */}
            <div>
              <label htmlFor="weekly-review-day" className="mb-1 block text-sm font-medium text-white/80">
                週次レビューの曜日
              </label>
              <select
                id="weekly-review-day"
                data-testid="weekly-review-day-select"
                className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm text-white focus:border-emerald-400/60 focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
                {...register('weekly_review_day')}
              >
                {DAY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-slate-900 text-white">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* エラー表示 */}
          {isError && (
            <p
              data-testid="save-error"
              className="mt-3 text-sm text-red-400"
            >
              保存に失敗しました。もう一度お試しください。
            </p>
          )}

          {/* 保存ボタン */}
          <button
            data-testid="save-button"
            type="submit"
            disabled={isPending || !isDirty}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-white ring-1 ring-emerald-300/30 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/30 disabled:text-emerald-100/70 disabled:opacity-100"
          >
            {isPending ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-300 border-t-transparent" />
                保存中...
              </>
            ) : (
              '保存する'
            )}
          </button>
        </form>

        {/* バッジギャラリー（REQ-902） */}
        <BadgeGallery
          badgeDefinitions={BADGE_DEFINITIONS}
          earnedBadges={EARNED_BADGES}
        />

        {/* ログアウト */}
        <div
          className="rounded-2xl p-5"
          style={{
            background: 'rgba(239,68,68,0.05)',
            border: '1px solid rgba(239,68,68,0.15)',
          }}
        >
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">
            アカウント
          </h2>
          <button
            data-testid="logout-button"
            type="button"
            onClick={handleLogout}
            className="w-full rounded-xl border border-red-400/30 py-3 text-sm font-semibold text-red-400 transition-colors hover:bg-red-400/10"
          >
            ログアウト
          </button>
        </div>
      </div>
    </div>
  )
}

export default Settings
