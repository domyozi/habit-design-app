import { useState } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, test, beforeEach } from 'vitest'
import { useDailyStorage } from './storage'

const DailyHarness = () => {
  const [date, setDate] = useState('2026-04-17')
  const [checked] = useDailyStorage<string[]>('morning', 'checked', [], date)

  return (
    <div>
      <button type="button" onClick={() => setDate('2026-04-16')}>prev</button>
      <div data-testid="date">{date}</div>
      <div data-testid="value">{checked.join(',')}</div>
    </div>
  )
}

describe('storage date sync', () => {
  beforeEach(() => {
    const store = new Map<string, string>()

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value)
        },
        removeItem: (key: string) => {
          store.delete(key)
        },
        clear: () => {
          store.clear()
        },
        key: (index: number) => Array.from(store.keys())[index] ?? null,
        get length() {
          return store.size
        },
      } satisfies Storage,
    })

    globalThis.localStorage.setItem('daily:2026-04-17:morning:checked', JSON.stringify(['today-task']))
    globalThis.localStorage.setItem('daily:2026-04-16:morning:checked', JSON.stringify(['yesterday-task']))
  })

  test('useDailyStorage reloads state when view date changes', async () => {
    render(<DailyHarness />)

    expect(screen.getByTestId('value')).toHaveTextContent('today-task')

    fireEvent.click(screen.getByRole('button', { name: 'prev' }))

    await waitFor(() => {
      expect(screen.getByTestId('date')).toHaveTextContent('2026-04-16')
      expect(screen.getByTestId('value')).toHaveTextContent('yesterday-task')
    })
  })
})
