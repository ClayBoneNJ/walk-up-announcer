import { useMemo } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Play, Trash2 } from "lucide-react";

export function QueueView({ queue, library, activePlayback, onQueueChange, onPlayQueue }) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  const [currentPlayer, nextPlayer] = useMemo(() => {
    if (!queue.length) return [null, null];

    if (activePlayback?.type === "queue" && Number.isInteger(activePlayback.index)) {
      return [queue[activePlayback.index] ?? null, queue[activePlayback.index + 1] ?? null];
    }

    return [queue[0], queue[1] ?? null];
  }, [activePlayback, queue]);

  const queueIds = queue.map((item) => item.id);

  const handleDragEnd = ({ active, over }) => {
    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    // Timeline mode accepts fresh clips from the shared library and also reorders
    // existing clips, so the same lane supports planning and last-second tweaks.
    if (activeData?.type === "library-item") {
      const queueItem = {
        id: crypto.randomUUID(),
        group: activeData.item.group,
        clipId: activeData.item.id,
        label: activeData.item.nickname,
        playerId: activeData.item.playerId ?? "",
        playerName: activeData.item.playerName ?? "",
      };

      const insertionIndex =
        over.id === "queue-dropzone"
          ? queue.length
          : queue.findIndex((item) => item.id === over.id);

      const nextQueue = [...queue];
      nextQueue.splice(insertionIndex < 0 ? queue.length : insertionIndex, 0, queueItem);
      onQueueChange(nextQueue);
      return;
    }

    if (activeData?.type === "queue-item" && overData?.type === "queue-item") {
      const oldIndex = queue.findIndex((item) => item.id === active.id);
      const newIndex = queue.findIndex((item) => item.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        onQueueChange(arrayMove(queue, oldIndex, newIndex));
      }
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[360px,1fr]">
      <section className="glass-panel rounded-[2rem] border border-white/8 p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-300">
          Clip Library
        </div>
        <h2 className="mt-2 text-2xl font-black uppercase tracking-[0.06em] text-white">
          Any Clip, Any Order
        </h2>
        <p className="mt-2 text-sm text-slate-300">
          Drag separate announcements, numbers, positions, names, or effects into a custom sequence.
        </p>

        <div className="mt-5 space-y-3">
          {library.map((item) => (
            <LibraryClip
              key={`${item.group}-${item.playerId ?? "global"}-${item.id}`}
              item={item}
            />
          ))}

          {library.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-sm text-slate-500">
              Upload clips in Player Setup to populate the timeline library.
            </div>
          ) : null}
        </div>
      </section>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <section className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <QueueStatus label="Current" item={currentPlayer} />
            <QueueStatus label="Next" item={nextPlayer} />
            <div className="glass-panel rounded-[2rem] border border-white/8 p-5">
              <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Timeline</div>
              <button
                type="button"
                onClick={onPlayQueue}
                disabled={queue.length === 0}
                className="primary-button mt-4 w-full disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Play className="h-4 w-4" />
                Play All
              </button>
              <button
                type="button"
                onClick={() => onQueueChange([])}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-rose-300/20 hover:text-rose-200"
              >
                <Trash2 className="h-4 w-4" />
                Clear
              </button>
            </div>
          </div>

          <QueueBoard
            queue={queue}
            queueIds={queueIds}
            activePlayback={activePlayback}
            onQueueChange={onQueueChange}
          />
        </section>
        <DragOverlay>{null}</DragOverlay>
      </DndContext>
    </div>
  );
}

function QueueBoard({ queue, queueIds, activePlayback, onQueueChange }) {
  const { setNodeRef, isOver } = useDroppable({
    id: "queue-dropzone",
    data: { type: "queue-dropzone" },
  });

  return (
    <div
      ref={setNodeRef}
      className={`glass-panel min-h-[480px] rounded-[2rem] border p-5 transition ${
        isOver ? "border-sky-300/50 bg-sky-400/8" : "border-white/8"
      }`}
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-300">
            Queue Order
          </div>
          <h2 className="mt-2 text-2xl font-black uppercase tracking-[0.06em] text-white">
            Timeline Lane
          </h2>
        </div>
        <div className="text-sm text-slate-400">{queue.length} clips loaded</div>
      </div>

      <SortableContext items={queueIds} strategy={rectSortingStrategy}>
        <div className="grid gap-3">
          {queue.map((item, index) => (
            <QueueItem
              key={item.id}
              item={item}
              index={index}
              isActive={activePlayback?.assetId === item.clipId}
              onRemove={() =>
                onQueueChange(queue.filter((queueItem) => queueItem.id !== item.id))
              }
            />
          ))}
        </div>
      </SortableContext>

      {queue.length === 0 ? (
        <div className="mt-8 rounded-[1.75rem] border border-dashed border-white/10 px-6 py-10 text-center text-slate-500">
          Drag clips here from the library to build your custom sequence.
        </div>
      ) : null}
    </div>
  );
}

function LibraryClip({ item }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useDraggable({
      id: `library-${item.group}-${item.id}`,
      data: {
        type: "library-item",
        item,
      },
    });

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      className={`w-full rounded-2xl border border-white/8 bg-slate-950/55 p-4 text-left transition ${
        isDragging ? "opacity-60" : "hover:border-sky-300/20 hover:bg-slate-900/75"
      }`}
      {...listeners}
      {...attributes}
    >
      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
        {item.playerName || item.group}
      </div>
      <div className="mt-2 text-base font-semibold text-white">{item.nickname}</div>
      <div className="mt-1 text-xs uppercase tracking-[0.18em] text-sky-200">
        {item.group}
      </div>
    </button>
  );
}

function QueueItem({ item, index, isActive, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: item.id,
    data: { type: "queue-item" },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`flex items-center gap-3 rounded-[1.5rem] border p-4 ${
        isActive ? "border-sky-300/50 bg-sky-400/10" : "border-white/8 bg-slate-950/50"
      }`}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-sm font-black text-slate-950">
        {index + 1}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-white">{item.label}</div>
        <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
          {item.playerName || "Global"} - {item.group}
        </div>
      </div>
      <button
        type="button"
        className="rounded-full border border-white/10 p-2 text-slate-300 transition hover:border-sky-300/20 hover:text-sky-200"
        {...listeners}
        {...attributes}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full border border-white/10 p-2 text-slate-300 transition hover:border-rose-300/20 hover:text-rose-200"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function QueueStatus({ label, item }) {
  return (
    <div className="glass-panel rounded-[2rem] border border-white/8 p-5">
      <div className="text-xs uppercase tracking-[0.24em] text-slate-400">{label} Clip</div>
      <div className="mt-3 text-xl font-black uppercase tracking-[0.05em] text-white">
        {item?.label ?? "Waiting"}
      </div>
      <div className="mt-1 text-sm text-slate-400">{item?.playerName || item?.group || "No clip queued"}</div>
    </div>
  );
}
