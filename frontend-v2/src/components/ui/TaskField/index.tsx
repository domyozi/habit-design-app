import type { TaskFieldType, TaskFieldOptions } from '@/lib/todos'
import { TaskCheckboxField } from './TaskCheckboxField'
import { TaskNumberField } from './TaskNumberField'
import { TaskPercentField } from './TaskPercentField'
import { TaskSelectField } from './TaskSelectField'
import { TaskRadioField } from './TaskRadioField'
import { TaskTextField } from './TaskTextField'
import { TaskTextAIField } from './TaskTextAIField'
import { TaskUrlField } from './TaskUrlField'

export interface TaskFieldItem {
  id: string
  label: string
  isMust?: boolean
  minutes?: number
  streak?: number
  monthCount?: number
  monthTarget?: number
  field_type?: TaskFieldType
  field_options?: TaskFieldOptions
}

interface TaskFieldRowProps {
  item: TaskFieldItem
  checked: boolean
  onToggle: () => void
  value: string
  onChange: (v: string) => void
  aiFeedback?: string
  onAIFeedback?: (feedback: string) => void
  isReadOnly?: boolean
  dotColor?: string
}

export const TaskFieldRow = ({
  item,
  checked,
  onToggle,
  value,
  onChange,
  aiFeedback,
  onAIFeedback,
  isReadOnly,
  dotColor = '#7dd3fc',
}: TaskFieldRowProps) => {
  const fieldType = item.field_type ?? 'checkbox'

  switch (fieldType) {
    case 'number':
      return (
        <TaskNumberField
          item={item}
          value={value}
          onChange={onChange}
          isReadOnly={isReadOnly}
          dotColor={dotColor}
        />
      )
    case 'percent':
      return (
        <TaskPercentField
          item={item}
          value={value}
          onChange={onChange}
          isReadOnly={isReadOnly}
          dotColor={dotColor}
        />
      )
    case 'select':
      return (
        <TaskSelectField
          item={item}
          value={value}
          onChange={onChange}
          isReadOnly={isReadOnly}
          dotColor={dotColor}
        />
      )
    case 'radio':
      return (
        <TaskRadioField
          item={item}
          value={value}
          onChange={onChange}
          isReadOnly={isReadOnly}
          dotColor={dotColor}
        />
      )
    case 'text':
      return (
        <TaskTextField
          item={item}
          value={value}
          onChange={onChange}
          isReadOnly={isReadOnly}
          dotColor={dotColor}
        />
      )
    case 'text-ai':
      return (
        <TaskTextAIField
          item={item}
          value={value}
          onChange={onChange}
          aiFeedback={aiFeedback}
          onAIFeedback={onAIFeedback}
          isReadOnly={isReadOnly}
          dotColor={dotColor}
        />
      )
    case 'url':
      return (
        <TaskUrlField
          item={item}
          value={value}
          onChange={onChange}
          isReadOnly={isReadOnly}
          dotColor={dotColor}
        />
      )
    case 'checkbox':
    default:
      return (
        <TaskCheckboxField
          item={item}
          checked={checked}
          onToggle={onToggle}
          dotColor={dotColor}
        />
      )
  }
}
