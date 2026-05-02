import { useCallback, useEffect, useState } from 'react'
import type { Theme } from '@/lib/theme'
import { APP, type Habit } from '@/lib/mockData'
import { adaptHabit, type BackendHabitWithLog } from '@/lib/habitAdapter'
import { deleteHabit, fetchHabits } from '@/lib/api'
import { HabitsTable } from '@/components/habits/HabitsTable'
import { ConnectedSources } from '@/components/habits/ConnectedSources'
import { XpEconomy } from '@/components/habits/XpEconomy'
import { AiSuggestions } from '@/components/habits/AiSuggestions'
import { HabitWizard } from '@/components/habits/HabitWizard'

interface Props {
  theme: Theme
}

export default function HabitsPage({ theme: t }: Props) {
  const [wizardOpen, setWizardOpen] = useState(false)
  const [liveHabits, setLiveHabits] = useState<Habit[] | null>(null)
  const [loadError, setLoadError] = useState(false)

  const reload = useCallback(async () => {
    try {
      const res = await fetchHabits()
      const adapted = (res.data ?? []).map((b) => adaptHabit(b as BackendHabitWithLog))
      setLiveHabits(adapted)
      setLoadError(false)
    } catch (err) {
      console.error('[habits] load failed', err)
      setLiveHabits(null)
      setLoadError(true)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const habits = liveHabits ?? APP.habits
  const isLive = liveHabits !== null

  const handleDelete = async (habit: Habit) => {
    if (!confirm(`「${habit.label}」を削除しますか？`)) return
    try {
      await deleteHabit(habit.id)
      await reload()
    } catch (err) {
      console.error('[habits] delete failed', err)
      alert('削除に失敗しました')
    }
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'grid',
        gridTemplateColumns: '1.5fr 1fr',
        minHeight: 0,
      }}
    >
      <HabitsTable
        theme={t}
        habits={habits}
        isLive={isLive}
        onNewHabit={() => setWizardOpen(true)}
        onDelete={isLive ? handleDelete : undefined}
      />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
          background: t.paperWarm,
        }}
      >
        {loadError && (
          <div
            style={{
              padding: '10px 22px',
              background: `${t.accent}14`,
              borderBottom: `1px solid ${t.accent}`,
              fontFamily: t.mono,
              fontSize: 10,
              color: t.accent,
              letterSpacing: '0.14em',
            }}
          >
            ● MOCK MODE · backend に到達できません
          </div>
        )}
        <ConnectedSources theme={t} />
        <XpEconomy theme={t} />
        <AiSuggestions theme={t} />
      </div>

      <HabitWizard
        theme={t}
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={reload}
      />
    </div>
  )
}
