import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'

/**
 * Wraps a vertical list in drag-to-reorder.
 *
 * `items` must be objects with an `id`. On drop, `onReorder` receives the
 * fully reordered array — the caller persists new sort_order values.
 *
 * Dragging is initiated from an explicit handle (see SortableItem below) rather
 * than the whole row, so that tapping a card still opens it and touch-scrolling
 * still scrolls.
 */
export default function SortableList({ items, onReorder, children, className = '' }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((i) => i.id === active.id)
    const newIndex = items.findIndex((i) => i.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    onReorder(arrayMove(items, oldIndex, newIndex))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className={className}>{children}</div>
      </SortableContext>
    </DndContext>
  )
}

/**
 * Render-prop item. Gives children a `handleProps` object to spread onto
 * whatever element should start the drag, plus `isDragging` for styling.
 */
export function SortableItem({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
    position: 'relative',
  }

  return (
    <div ref={setNodeRef} style={style}>
      {children({ handleProps: { ...attributes, ...listeners }, isDragging })}
    </div>
  )
}

/** The visible grab affordance. Keyboard: focus it, press Space, use arrows. */
export function DragHandle({ handleProps, className = '', label = 'Reorder' }) {
  return (
    <button
      {...handleProps}
      aria-label={label}
      className={`shrink-0 text-faint hover:text-muted cursor-grab active:cursor-grabbing touch-none p-0.5 -ml-1 ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <GripVertical size={15} />
    </button>
  )
}
