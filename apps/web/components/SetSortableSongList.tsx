"use client";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SortableRow({ id, index, played, children }: { id: string; index: number; played?: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={`flex items-start gap-2 sm:gap-3 rounded-xl border border-zinc-200 px-2 sm:px-4 py-2.5 sm:py-3 ${played ? "bg-zinc-50" : "bg-white"}`}
    >
      <div className="shrink-0 flex flex-col items-center gap-0.5 pt-0.5 w-6 sm:w-8">
        <span className="text-[10px] sm:text-xs leading-none font-semibold text-zinc-300">{index + 1}</span>
        <button
          {...attributes}
          {...listeners}
          className="flex items-center justify-center w-full py-3 text-zinc-300 hover:text-zinc-500 active:cursor-grabbing cursor-grab touch-none"
          aria-label="Drag to reorder"
        >
          <svg className="h-6 w-4" fill="none" viewBox="0 0 24 24" preserveAspectRatio="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
      </div>

      {children}
    </div>
  );
}

export default function SetSortableSongList({
  contextId,
  items,
  onMove,
  renderRow,
}: {
  contextId: string;
  items: { id: string; played?: boolean }[];
  onMove: (oldIndex: number, newIndex: number) => void;
  renderRow: (index: number) => React.ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((s) => s.id === active.id);
    const newIndex = items.findIndex((s) => s.id === over.id);
    onMove(oldIndex, newIndex);
  }

  return (
    <DndContext id={contextId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        {items.map((item, i) => (
          <SortableRow key={item.id} id={item.id} index={i} played={item.played}>
            {renderRow(i)}
          </SortableRow>
        ))}
      </SortableContext>
    </DndContext>
  );
}
