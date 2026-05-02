import { Navigate, Route, Routes } from 'react-router-dom'
import { AppChrome } from '@/components/chrome/AppChrome'
import { AuthGate } from '@/components/auth/AuthGate'
import { useNow } from '@/lib/useNow'
import { getTheme } from '@/lib/theme'
import TodayPage from '@/pages/TodayPage'
import FlowPage from '@/pages/FlowPage'
import HabitsPage from '@/pages/HabitsPage'
import SignalsPage from '@/pages/SignalsPage'
import MemoryPage from '@/pages/MemoryPage'
import NotesPage from '@/pages/NotesPage'
import CalendarPage from '@/pages/CalendarPage'

export default function App() {
  const hour = useNow()
  const theme = getTheme(hour)

  return (
    <AuthGate>
      <AppChrome theme={theme} hour={hour}>
        <Routes>
          <Route path="/" element={<Navigate to="/today" replace />} />
          <Route path="/today"    element={<TodayPage    theme={theme} />} />
          <Route path="/flow"     element={<FlowPage     theme={theme} />} />
          <Route path="/habits"   element={<HabitsPage   theme={theme} />} />
          <Route path="/signals"  element={<SignalsPage  theme={theme} />} />
          <Route path="/memory"   element={<MemoryPage   theme={theme} />} />
          <Route path="/notes"    element={<NotesPage    theme={theme} />} />
          <Route path="/calendar" element={<CalendarPage theme={theme} />} />
          <Route path="*"         element={<Navigate to="/today" replace />} />
        </Routes>
      </AppChrome>
    </AuthGate>
  )
}
