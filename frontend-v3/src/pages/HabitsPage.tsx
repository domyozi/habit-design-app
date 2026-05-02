import { useState } from 'react'
import type { Theme } from '@/lib/theme'
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
      <HabitsTable theme={t} onNewHabit={() => setWizardOpen(true)} />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
          background: t.paperWarm,
        }}
      >
        <ConnectedSources theme={t} />
        <XpEconomy theme={t} />
        <AiSuggestions theme={t} />
      </div>

      <HabitWizard theme={t} open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  )
}
