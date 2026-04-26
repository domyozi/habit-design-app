import { useDailyStorage, todayKey } from '@/lib/storage'
import { bySection, useTodoDefinitions } from '@/lib/todos'

interface CheckItem { id: string; label: string; minutes?: number }

const CheckRow = ({ item, checked, onToggle }: { item: CheckItem; checked: boolean; onToggle: () => void }) => (
  <div className={['flex items-center gap-3 border-t border-white/[0.05] px-4 py-3', checked ? 'opacity-50' : ''].join(' ')}>
    <button
      type="button"
      onClick={onToggle}
      data-testid={`evening-check-${item.id}`}
      className={['w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors',
        checked ? 'bg-[#c4b5fd] border-[#c4b5fd]' : 'border-white/20 hover:border-white/40'].join(' ')}
    >
      {checked && <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
    </button>
    <span className={['flex-1 text-sm', checked ? 'text-white/28 line-through' : 'text-white/82'].join(' ')}>{item.label}</span>
    {item.minutes && <span className="text-[11px] text-white/24">{item.minutes}m</span>}
  </div>
)

const TextArea = ({
  label,
  value,
  onChange,
  placeholder,
  color = '#a78bfa',
  maxLength = 500,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  color?: string
  maxLength?: number
}) => (
  <div className="border-t border-white/[0.05] px-4 py-3">
    <div className="mb-2 flex items-center justify-between">
      <label className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color }}>
        {label}
      </label>
      {value.length > maxLength * 0.8 && (
        <span className={['text-[10px]', value.length >= maxLength ? 'text-[#fecaca]' : 'text-white/30'].join(' ')}>
          {value.length}/{maxLength}
        </span>
      )}
    </div>
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      className="w-full rounded border border-white/10 bg-[#0b1320] px-3 py-2 text-sm text-white/80 placeholder-white/20"
    />
  </div>
)

const formatDate = () => {
  const d = new Date()
  const weekdays = ['日', '月', '火', '水', '木', '金', '土']
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}（${weekdays[d.getDay()]}）`
}

const starStr = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n)

export const EveningTab = ({
  onBossSet,
  onGenerateReport,
  onComplete,
  viewDate,
}: {
  onBossSet: (task: string) => void
  onGenerateReport?: (text: string) => void
  onComplete?: () => void
  viewDate?: string
}) => {
  const dateKey = viewDate ?? todayKey()
  const isReadOnly = dateKey !== todayKey()
  const [todoDefinitions] = useTodoDefinitions()
  const REFLECTION_ITEMS: CheckItem[] = bySection(todoDefinitions, 'evening-reflection').map(item => ({
    id: item.id,
    label: item.label,
    minutes: item.minutes,
  }))
  const PREP_ITEMS: CheckItem[] = bySection(todoDefinitions, 'evening-prep').map(item => ({
    id: item.id,
    label: item.label,
    minutes: item.minutes,
  }))
  const allCheckIds = [...REFLECTION_ITEMS, ...PREP_ITEMS].map(item => item.id)

  const [checkedArr, setCheckedArr] = useDailyStorage<string[]>('evening', 'checked', [], dateKey)
  const checked = new Set(checkedArr)
  const [weight, setWeight] = useDailyStorage<string>('evening', 'weight', '', dateKey)
  const [stars, setStars] = useDailyStorage<number>('evening', 'stars', 0, dateKey)
  const [boss, setBoss] = useDailyStorage<string>('evening', 'boss-draft', '', dateKey)
  // Gap / 気づき / 翌日スケジュール（新フィールド）
  const [gap, setGap] = useDailyStorage<string>('evening', 'gap', '', dateKey)
  const [insight, setInsight] = useDailyStorage<string>('evening', 'insight', '', dateKey)
  const [tomorrow, setTomorrow] = useDailyStorage<string>('evening', 'tomorrow', '', dateKey)
  // 日報保存
  const [, setSavedReport] = useDailyStorage<string>('evening', 'report', '', dateKey)
  const [, setSavedReportAt] = useDailyStorage<string>('evening', 'reportAt', '', dateKey)

  const toggle = (id: string) => {
    if (isReadOnly) return

    setCheckedArr(prev => {
    const s = new Set(prev)
    s.has(id) ? s.delete(id) : s.add(id)
    return Array.from(s)
    })
  }

  const total = allCheckIds.length
  const done = checkedArr.filter(id => allCheckIds.includes(id)).length

  const generateReport = () => {
    const reflectionLines = REFLECTION_ITEMS.map(
      i => `${checked.has(i.id) ? '✅' : '⬜'} ${i.label}`
    ).join('\n')
    const prepLines = PREP_ITEMS.map(
      i => `${checked.has(i.id) ? '✅' : '⬜'} ${i.label}`
    ).join('\n')
    const reflectionDone = REFLECTION_ITEMS.filter(i => checked.has(i.id)).length
    const prepDone = PREP_ITEMS.filter(i => checked.has(i.id)).length

    const text = [
      `# Evening report — ${formatDate()}`,
      '',
      `## Reflection tasks (${reflectionDone}/${REFLECTION_ITEMS.length})`,
      reflectionLines,
      '',
      `## Preparation tasks (${prepDone}/${PREP_ITEMS.length})`,
      prepLines,
      '',
      `## Daily condition`,
      `${starStr(stars)}（${stars}/5）`,
      weight ? `体重（夜）: ${weight} kg` : '体重（夜）: 未記録',
      '',
      gap ? `## Gap\n${gap}` : '',
      insight ? `## Insight\n${insight}` : '',
      tomorrow ? `## Next day plan\n${tomorrow}` : '',
      `## Primary target for tomorrow`,
      boss.trim() ? boss.trim() : '（未設定）',
      '',
      '---',
      '今日1日の振り返りと明日へのアドバイスをお願いします。',
    ].filter(Boolean).join('\n')

    const nowStr = () => {
      const d = new Date()
      return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
    }
    const reportKey = `daily:${dateKey}:evening:report`
    const reportAtKey = `daily:${dateKey}:evening:reportAt`
    localStorage.setItem(reportKey, JSON.stringify(text))
    localStorage.setItem(reportAtKey, JSON.stringify(nowStr()))
    window.dispatchEvent(new CustomEvent('local-storage', { detail: { key: reportKey } }))
    window.dispatchEvent(new CustomEvent('local-storage', { detail: { key: reportAtKey } }))
    setSavedReport(text)
    setSavedReportAt(nowStr())
    onGenerateReport?.(text)
  }

  return (
    <div className={['pb-6', isReadOnly ? 'select-none' : ''].join(' ')}>
      {isReadOnly && (
        <div className="mx-4 mb-1 mt-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <span className="text-[11px] uppercase tracking-[0.18em] text-white/38">Read only record</span>
        </div>
      )}

      <div className={['mt-4', isReadOnly ? 'pointer-events-none' : ''].join(' ')}>
        <div className="flex items-center justify-between border-l-2 border-[#c4b5fd] px-4 py-2">
          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-[#ddd6fe]">Reflection tasks</span>
          <span className="text-[11px] text-white/24">18:00–18:30</span>
        </div>
        <div className="border-y border-white/[0.05] bg-[#111827]/70">
          {REFLECTION_ITEMS.map(item => (
            <CheckRow key={item.id} item={item} checked={checked.has(item.id)} onToggle={() => toggle(item.id)} />
          ))}
          <div className="flex items-center gap-3 border-t border-white/[0.05] px-4 py-2.5">
            <span className="w-16 text-xs text-white/40">体重（夜）</span>
            <input type="number" value={weight} onChange={e => setWeight(e.target.value)} step="0.1"
              className="w-20 rounded border border-white/10 bg-[#0b1320] px-2 py-1 text-center text-sm font-mono text-white/85" placeholder="—" />
            <span className="text-xs text-white/40">kg</span>
          </div>
          <div className="flex items-center gap-2 border-t border-white/[0.05] px-4 py-2.5">
            <span className="w-16 text-xs text-white/40">今日の★</span>
            <div className="flex gap-1">
              {[1,2,3,4,5].map(n => (
                <button key={n} type="button" onClick={() => setStars(n)} className={n <= stars ? 'text-[#c4b5fd]' : 'text-white/[0.14]'}>★</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className={['mt-4', isReadOnly ? 'pointer-events-none' : ''].join(' ')}>
        <div className="flex items-center justify-between border-l-2 border-[#7dd3fc] px-4 py-2">
          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-[#aee5ff]">Notes</span>
        </div>
        <div className="border-y border-white/[0.05] bg-[#111827]/70">
          <TextArea
            label="今日のGap（差分・課題）"
            value={gap}
            onChange={setGap}
            placeholder="今日できなかったこと、改善点..."
            color="#f59e0b"
          />
          <TextArea
            label="気づき・学び"
            value={insight}
            onChange={setInsight}
            placeholder="今日気づいたこと、学んだこと..."
            color="#22c55e"
          />
          <TextArea
            label="翌日スケジュール"
            value={tomorrow}
            onChange={setTomorrow}
            placeholder="明日のタスク・予定..."
            color="#38bdf8"
          />
        </div>
      </div>

      <div className={['mt-4', isReadOnly ? 'pointer-events-none' : ''].join(' ')}>
        <div className="flex items-center border-l-2 border-[#7dd3fc] px-4 py-2">
          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-[#aee5ff]">Preparation tasks</span>
        </div>
        <div className="border-y border-white/[0.05] bg-[#111827]/70">
          {PREP_ITEMS.map(item => (
            <CheckRow key={item.id} item={item} checked={checked.has(item.id)} onToggle={() => toggle(item.id)} />
          ))}
          {!isReadOnly && (
            <div className="border-t border-white/[0.05] px-4 py-3">
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[#aee5ff]">
                Primary target for tomorrow
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={boss}
                  onChange={e => setBoss(e.target.value)}
                  placeholder="明日の最重要タスクを今設定..."
                  className="flex-1 rounded border border-white/10 bg-[#0b1320] px-3 py-2 text-sm text-white/85"
                />
                <button
                  type="button"
                  disabled={!boss.trim()}
                  onClick={() => { onBossSet(boss.trim()); setBoss('') }}
                  className="rounded-full border border-[#7dd3fc]/30 bg-[#7dd3fc]/12 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#aee5ff] disabled:opacity-30"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
          {isReadOnly && boss && (
            <div className="border-t border-white/[0.05] px-4 py-3">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#aee5ff]">Primary target</p>
              <p className="text-sm text-white/85">{boss}</p>
            </div>
          )}
        </div>
      </div>

      {!isReadOnly && done === total && total > 0 && (
        <div className="mx-4 mt-4 rounded-2xl border border-[#c4b5fd]/30 bg-[#c4b5fd]/6 px-4 py-4 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#ddd6fe]">Sequence complete</p>
          <p className="mt-1 text-sm font-semibold text-white/86">Evening review is fully recorded.</p>
          <p className="mt-1 text-[11px] text-white/40">Return home or generate the report when needed.</p>
        </div>
      )}

      <div className="mx-4 mt-4 flex items-center justify-between">
        <span className="text-xs text-white/36">
          {isReadOnly ? 'Record' : 'Completion rate'}{' '}
          <span className="font-mono text-white">{done} / {total}</span>
        </span>
        <div className="flex gap-2">
          {!isReadOnly && (
          <button type="button" onClick={generateReport}
            className="rounded-full border border-[#c4b5fd]/30 bg-[#c4b5fd]/12 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#ddd6fe]">
            Generate report
          </button>
          )}
          {!isReadOnly && (
            <button type="button"
              onClick={() => {
                if (onComplete) onComplete()
              }}
              className="rounded-full border border-[#c4b5fd]/30 bg-[#c4b5fd] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-black">
              Complete review
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
