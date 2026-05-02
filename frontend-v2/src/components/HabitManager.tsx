// ============================================================
// HabitManager — 設定画面の「習慣化」セクション本体
//
// /api/habits の追加・編集・削除をテンプレ起点で扱う。
// テンプレ → 数値調整 → 保存 の動線を最短化することを優先。
// ============================================================

import { useMemo, useState, type CSSProperties } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  HABIT_TEMPLATES_BY_CATEGORY,
  HABIT_TEMPLATE_CATEGORIES,
  type HabitTemplate,
  templateToCreateRequest,
} from '@/lib/habit-templates'
import {
  isNumericMetric,
  isTimeMetric,
  type CreateHabitRequest,
  type Habit,
  type HabitMetricType,
  type UpdateHabitRequest,
} from '@/types/habit'

interface Props {
  habits: Habit[]
  loading: boolean
  add: (req: CreateHabitRequest) => Promise<Habit>
  update: (id: string, req: UpdateHabitRequest) => Promise<Habit>
  remove: (id: string) => Promise<void>
  reorder: (orderedIds: string[]) => Promise<void>
}

const formatTargetSummary = (h: Habit): string => {
  const unit = h.unit ?? ''
  switch (h.metric_type) {
    case 'binary':
      return 'チェック式'
    case 'numeric_min':
      return h.target_value != null ? `≥ ${h.target_value} ${unit}`.trim() : `数値 ${unit}`.trim()
    case 'numeric_max':
      return h.target_value != null ? `≤ ${h.target_value} ${unit}`.trim() : `数値 ${unit}`.trim()
    case 'duration':
      return h.target_value != null ? `${h.target_value} 分以上` : `時間記録`
    case 'range':
      return h.target_value != null && h.target_value_max != null
        ? `${h.target_value}〜${h.target_value_max} ${unit}`.trim()
        : `範囲 ${unit}`.trim()
    case 'time_before':
      return h.target_time ? `${h.target_time.slice(0, 5)} まで` : `時刻記録`
    case 'time_after':
      return h.target_time ? `${h.target_time.slice(0, 5)} 以降` : `時刻記録`
    default:
      return h.metric_type
  }
}

// ドラッグ＆ドロップ可能な行ラッパー。
// 左端にハンドルを置き、children を内容スロットとしてレンダーする。
// 編集モード時は disabled=true でドラッグを無効化（誤操作防止）。
const SortableRow = ({
  id,
  disabled = false,
  children,
}: {
  id: string
  disabled?: boolean
  children: React.ReactNode
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled })
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : undefined,
  }
  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-2 px-3 py-2.5">
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="並び替え"
        disabled={disabled}
        className={[
          'mt-1 flex h-6 w-5 shrink-0 select-none items-center justify-center text-white/25 transition-colors',
          disabled
            ? 'cursor-not-allowed opacity-30'
            : 'cursor-grab hover:text-white/55 active:cursor-grabbing',
        ].join(' ')}
        title={disabled ? '編集中は並び替えできません' : 'ドラッグで並び替え'}
      >
        ⋮⋮
      </button>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

export const HabitManager = ({ habits, loading, add, update, remove, reorder }: Props) => {
  const [picker, setPicker] = useState<{ template: HabitTemplate; targetValue: string; targetTime: string } | null>(null)
  const [showCustom, setShowCustom] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<{
    title: string
    target_value: string
    target_time: string
    unit: string
  }>({ title: '', target_value: '', target_time: '', unit: '' })

  const usedTitles = useMemo(() => new Set(habits.map((h) => h.title.trim())), [habits])

  const openTemplate = (tpl: HabitTemplate) => {
    setPicker({
      template: tpl,
      targetValue: tpl.target_value != null ? String(tpl.target_value) : '',
      targetTime: tpl.target_time ?? '',
    })
  }

  const cancelPicker = () => setPicker(null)

  const submitTemplate = async () => {
    if (!picker) return
    const { template, targetValue, targetTime } = picker
    const overrides: Partial<CreateHabitRequest> = {}
    if (template.target_value !== undefined) {
      const v = parseFloat(targetValue)
      if (!Number.isNaN(v)) overrides.target_value = v
    }
    if (template.target_time !== undefined) {
      const normalized = targetTime.length === 5 ? `${targetTime}:00` : targetTime
      if (normalized) overrides.target_time = normalized
    }
    setSubmitting(true)
    try {
      await add(templateToCreateRequest(template, overrides))
      setPicker(null)
    } finally {
      setSubmitting(false)
    }
  }

  const startEdit = (h: Habit) => {
    setEditingId(h.id)
    setEditDraft({
      title: h.title,
      target_value: h.target_value != null ? String(h.target_value) : '',
      target_time: h.target_time ? h.target_time.slice(0, 5) : '',
      unit: h.unit ?? '',
    })
  }

  const cancelEdit = () => setEditingId(null)

  const saveEdit = async (h: Habit) => {
    const title = editDraft.title.trim()
    if (!title) return
    const req: UpdateHabitRequest = { action: 'manual_edit', title }
    if (isNumericMetric(h.metric_type)) {
      const v = parseFloat(editDraft.target_value)
      if (!Number.isNaN(v)) req.target_value = v
    }
    if (isTimeMetric(h.metric_type)) {
      const t = editDraft.target_time
      if (t) req.target_time = t.length === 5 ? `${t}:00` : t
    }
    if (isNumericMetric(h.metric_type) && editDraft.unit.trim()) {
      req.unit = editDraft.unit.trim()
    }
    setSubmitting(true)
    try {
      await update(h.id, req)
      setEditingId(null)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (h: Habit) => {
    if (!window.confirm(`「${h.title}」を削除しますか？（履歴は残ります）`)) return
    await remove(h.id)
  }

  // ── DnD: display_order 順にソート、idのみ抽出して SortableContext に渡す
  const sortedHabits = useMemo(
    () => [...habits].sort((a, b) => a.display_order - b.display_order),
    [habits],
  )
  const sortedIds = useMemo(() => sortedHabits.map((h) => h.id), [sortedHabits])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = sortedIds.indexOf(String(active.id))
    const newIndex = sortedIds.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    const newOrder = arrayMove(sortedIds, oldIndex, newIndex)
    void reorder(newOrder)
  }

  return (
    <div className="space-y-4 px-4 py-3">
      {/* 既存の習慣一覧 */}
      <section className="overflow-hidden rounded-[20px] border border-white/[0.05]">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#7dd3fc]">
              あなたの習慣
            </p>
            <p className="mt-0.5 text-[10px] text-white/35">
              {loading ? '読み込み中…' : `${habits.length} 件`}
            </p>
          </div>
        </div>
        {!loading && habits.length === 0 ? (
          <p className="px-4 pb-3 text-[11px] text-white/30">
            まだ習慣がありません。下のテンプレートから1つ追加してみましょう。
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={sortedIds} strategy={verticalListSortingStrategy}>
              <div className="divide-y divide-white/[0.04] border-t border-white/[0.04]">
                {sortedHabits.map((h) => {
                  const isEditing = editingId === h.id
                  return (
                    <SortableRow key={h.id} id={h.id} disabled={isEditing}>
                      {isEditing ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editDraft.title}
                          onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
                          autoFocus
                          className="flex-1 rounded-xl border border-white/[0.12] bg-[#08111c] px-3 py-1.5 text-sm text-white/88 focus:border-white/22 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => void saveEdit(h)}
                          disabled={submitting}
                          className="shrink-0 rounded-xl border border-[#7dd3fc]/40 bg-[#7dd3fc]/10 px-3 py-1.5 text-[11px] font-semibold text-[#7dd3fc] disabled:opacity-40"
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="shrink-0 px-1 text-sm text-white/22 hover:text-white/50"
                        >
                          ×
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 pl-1">
                        {isNumericMetric(h.metric_type) && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-white/30">目標値</span>
                            <input
                              type="number"
                              value={editDraft.target_value}
                              onChange={(e) =>
                                setEditDraft((d) => ({ ...d, target_value: e.target.value }))
                              }
                              className="w-20 rounded-lg border border-white/[0.08] bg-[#08111c] px-2 py-1 text-[10px] text-white/55 focus:outline-none"
                            />
                            <input
                              type="text"
                              value={editDraft.unit}
                              onChange={(e) => setEditDraft((d) => ({ ...d, unit: e.target.value }))}
                              placeholder="単位"
                              className="w-16 rounded-lg border border-white/[0.08] bg-[#08111c] px-2 py-1 text-[10px] text-white/55 focus:outline-none"
                            />
                          </div>
                        )}
                        {isTimeMetric(h.metric_type) && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-white/30">目標時刻</span>
                            <input
                              type="time"
                              value={editDraft.target_time}
                              onChange={(e) =>
                                setEditDraft((d) => ({ ...d, target_time: e.target.value }))
                              }
                              className="rounded-lg border border-white/[0.08] bg-[#08111c] px-2 py-1 text-[10px] text-white/55 focus:outline-none"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <p className="flex-1 text-sm text-white/80 leading-snug">{h.title}</p>
                      <span className="shrink-0 rounded-full bg-white/[0.04] px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-white/40">
                        {formatTargetSummary(h)}
                      </span>
                      {(h.current_streak ?? 0) > 0 && (
                        <span className="shrink-0 rounded-full border border-[#fbbf24]/35 bg-[#fbbf24]/10 px-2 py-0.5 text-[10px] text-[#fbbf24]">
                          {h.current_streak}🔥
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => startEdit(h)}
                        title="編集"
                        className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full text-white/50 transition-all hover:bg-white/[0.08] hover:text-white/80"
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(h)}
                        title="削除"
                        className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full text-white/35 transition-all hover:bg-red-500/10 hover:text-red-400"
                      >
                        ×
                      </button>
                    </div>
                  )}
                    </SortableRow>
                  )
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </section>

      {/* テンプレートピッカー */}
      <section className="overflow-hidden rounded-[20px] border border-white/[0.05]">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#a78bfa]">
              テンプレートから追加
            </p>
            <p className="mt-0.5 text-[10px] text-white/35">
              よく使う習慣をワンタップで。数値だけ調整して保存できます。
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCustom((v) => !v)}
            className="rounded-full border border-white/[0.1] px-3 py-1 text-[10px] text-white/55 hover:border-white/[0.22] hover:text-white/80"
          >
            {showCustom ? 'カスタム閉じる' : 'カスタム作成'}
          </button>
        </div>
        <div className="border-t border-white/[0.04] px-3 pb-3 pt-2 space-y-3">
          {HABIT_TEMPLATE_CATEGORIES.map((cat) => {
            const tpls = HABIT_TEMPLATES_BY_CATEGORY[cat.id]
            return (
              <div key={cat.id}>
                <div className="mb-1 flex items-center gap-2 px-1">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cat.accent }} />
                  <span
                    className="text-[10px] font-semibold uppercase tracking-[0.2em]"
                    style={{ color: cat.accent }}
                  >
                    {cat.label}
                  </span>
                  <span className="text-[10px] text-white/22">{cat.description}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {tpls.map((tpl) => {
                    const alreadyAdded = usedTitles.has(tpl.title)
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => openTemplate(tpl)}
                        disabled={alreadyAdded}
                        title={tpl.description ?? tpl.title}
                        className="rounded-xl border px-3 py-1.5 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-30"
                        style={{
                          borderColor: `${cat.accent}30`,
                          backgroundColor: `${cat.accent}0c`,
                          color: alreadyAdded ? 'rgba(255,255,255,0.3)' : '#cbd5e1',
                        }}
                      >
                        {tpl.title}
                        {alreadyAdded && ' ✓'}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {showCustom && (
            <CustomHabitForm onAdd={add} submitting={submitting} setSubmitting={setSubmitting} />
          )}
        </div>
      </section>

      {/* テンプレ確定モーダル（軽量） */}
      {picker && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 py-6 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-md rounded-3xl border border-white/[0.1] bg-[#0b1320] p-5 shadow-2xl space-y-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7dd3fc]">
                テンプレートを追加
              </p>
              <p className="mt-1 text-base font-semibold text-white">{picker.template.title}</p>
              {picker.template.description && (
                <p className="mt-1 text-[11px] text-white/45">{picker.template.description}</p>
              )}
            </div>

            {picker.template.target_value !== undefined && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-[0.18em] text-white/50">
                  目標値（{picker.template.unit ?? ''}）
                </label>
                <input
                  type="number"
                  value={picker.targetValue}
                  onChange={(e) =>
                    setPicker((p) => (p ? { ...p, targetValue: e.target.value } : p))
                  }
                  className="w-full rounded-xl border border-white/[0.12] bg-[#08111c] px-3 py-2 text-sm text-white/88 focus:border-white/22 focus:outline-none"
                />
              </div>
            )}
            {picker.template.target_time !== undefined && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-[0.18em] text-white/50">
                  目標時刻
                </label>
                <input
                  type="time"
                  value={picker.targetTime.slice(0, 5)}
                  onChange={(e) =>
                    setPicker((p) => (p ? { ...p, targetTime: e.target.value } : p))
                  }
                  className="w-full rounded-xl border border-white/[0.12] bg-[#08111c] px-3 py-2 text-sm text-white/88 focus:border-white/22 focus:outline-none"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={cancelPicker}
                className="rounded-full border border-white/[0.1] px-4 py-1.5 text-[11px] text-white/55"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => void submitTemplate()}
                disabled={submitting}
                className="rounded-full border border-[#7dd3fc]/40 bg-[#7dd3fc]/10 px-4 py-1.5 text-[11px] font-semibold text-[#7dd3fc] disabled:opacity-40"
              >
                {submitting ? '追加中…' : '追加する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const CUSTOM_METRIC_OPTIONS: Array<{ value: HabitMetricType; label: string }> = [
  { value: 'binary', label: 'チェック式' },
  { value: 'duration', label: '時間（分）' },
  { value: 'numeric_min', label: '数値 ≥ 目標' },
  { value: 'numeric_max', label: '数値 ≤ 目標' },
  { value: 'time_before', label: '時刻 ≤ 目標' },
  { value: 'time_after', label: '時刻 ≥ 目標' },
]

interface CustomFormProps {
  onAdd: (req: CreateHabitRequest) => Promise<Habit>
  submitting: boolean
  setSubmitting: (v: boolean) => void
}

const CustomHabitForm = ({ onAdd, submitting, setSubmitting }: CustomFormProps) => {
  const [title, setTitle] = useState('')
  const [metric, setMetric] = useState<HabitMetricType>('binary')
  const [targetValue, setTargetValue] = useState('')
  const [targetTime, setTargetTime] = useState('')
  const [unit, setUnit] = useState('')

  const submit = async () => {
    const t = title.trim()
    if (!t) return
    const req: CreateHabitRequest = { title: t, metric_type: metric }
    if (isNumericMetric(metric)) {
      const v = parseFloat(targetValue)
      if (!Number.isNaN(v)) req.target_value = v
      if (unit.trim()) req.unit = unit.trim()
    } else if (isTimeMetric(metric) && targetTime) {
      req.target_time = targetTime.length === 5 ? `${targetTime}:00` : targetTime
    }
    setSubmitting(true)
    try {
      await onAdd(req)
      setTitle('')
      setTargetValue('')
      setTargetTime('')
      setUnit('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="習慣名（例: 毎朝のルーティン）"
          className="flex-1 rounded-xl border border-white/[0.12] bg-[#08111c] px-3 py-1.5 text-sm text-white/88 placeholder-white/20 focus:border-white/22 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!title.trim() || submitting}
          className="shrink-0 rounded-xl border border-[#a78bfa]/40 bg-[#a78bfa]/10 px-3 py-1.5 text-[11px] font-semibold text-[#a78bfa] disabled:opacity-40"
        >
          追加
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-3 pl-1">
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value as HabitMetricType)}
          className="rounded-lg border border-white/[0.08] bg-[#08111c] px-2 py-1 text-[10px] text-white/55 focus:outline-none"
        >
          {CUSTOM_METRIC_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {isNumericMetric(metric) && (
          <>
            <input
              type="number"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              placeholder="目標値"
              className="w-20 rounded-lg border border-white/[0.08] bg-[#08111c] px-2 py-1 text-[10px] text-white/55 focus:outline-none"
            />
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="単位 (分/歩/kg)"
              className="w-24 rounded-lg border border-white/[0.08] bg-[#08111c] px-2 py-1 text-[10px] text-white/55 focus:outline-none"
            />
          </>
        )}
        {isTimeMetric(metric) && (
          <input
            type="time"
            value={targetTime}
            onChange={(e) => setTargetTime(e.target.value)}
            className="rounded-lg border border-white/[0.08] bg-[#08111c] px-2 py-1 text-[10px] text-white/55 focus:outline-none"
          />
        )}
      </div>
    </div>
  )
}
