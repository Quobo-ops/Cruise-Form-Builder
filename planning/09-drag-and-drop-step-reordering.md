# 09: Drag-and-Drop Form Step Reordering

> **Status: Implemented**

## Issue

The form builder (`decision-tree-editor.tsx`, 46KB) displays form steps in a tree structure, but there is no way to reorder steps via drag and drop. To move a step, users must delete it and re-create it in the desired position. For complex forms with many steps, this is tedious and error-prone.

The form data model is a directed graph (`shared/schema.ts:49-54`) where each step has a `nextStepId` (for text/quantity/conclusion steps) or choices with individual `nextStepId` values (for choice steps). Reordering means updating these pointers.

**Current step types:**
- `text`: Single `nextStepId` pointer to next step
- `choice`: Each choice has its own `nextStepId` pointer (branching)
- `quantity`: Single `nextStepId` pointer to next step
- `conclusion`: Terminal step, no `nextStepId`

## Affected Files

| File | Path | Role |
|------|------|------|
| Decision Tree Editor | `client/src/components/decision-tree-editor.tsx` | Main form builder UI (46KB) |
| Form Builder Page | `client/src/pages/form-builder.tsx` | Graph change handler (line 306) |
| Schema | `shared/schema.ts` | Step/Graph types (lines 28-54) |

## Solution

### Approach: Constrained drag-and-drop within linear sequences

Full arbitrary graph reordering is complex. Instead, support drag-and-drop within **linear sequences** (chains of steps connected by `nextStepId`). Choice branches create forks that can't be trivially reordered via drag.

### Step 1: Add drag-and-drop library

Add `@dnd-kit/core` and `@dnd-kit/sortable` (or use the existing Framer Motion for simpler drag):

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

`@dnd-kit` is chosen over alternatives because:
- Works with React 18
- Accessible (keyboard drag support built-in)
- Lightweight
- Supports vertical lists (which matches the tree layout)

### Step 2: Identify draggable sequences

A "linear sequence" is a chain of steps where each step has exactly one incoming edge and one outgoing edge (no branches). In the graph:

```typescript
function getLinearSequences(graph: FormGraph): string[][] {
  const sequences: string[][] = [];
  const visited = new Set<string>();

  function walkLinear(stepId: string): string[] {
    const chain: string[] = [];
    let current: string | null = stepId;

    while (current && !visited.has(current)) {
      const step = graph.steps[current];
      if (!step) break;
      visited.add(current);
      chain.push(current);

      if (step.type === "choice") {
        // Choice steps break the linear chain
        // Each branch starts a new potential chain
        for (const choice of step.choices || []) {
          if (choice.nextStepId && !visited.has(choice.nextStepId)) {
            sequences.push(...getLinearSequences_from(choice.nextStepId));
          }
        }
        break;
      }

      current = step.nextStepId || null;
    }
    return chain;
  }

  const rootChain = walkLinear(graph.rootStepId);
  if (rootChain.length > 0) sequences.unshift(rootChain);
  return sequences;
}
```

### Step 3: Make linear sequence steps draggable

Within each linear sequence, wrap steps in a `SortableContext`:

```tsx
import { DndContext, closestCenter, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SortableStep({ stepId, step, ...props }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stepId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {/* Drag handle */}
      <div {...listeners} className="cursor-grab active:cursor-grabbing p-1">
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </div>
      {/* Existing step rendering */}
      <StepNode step={step} {...props} />
    </div>
  );
}
```

### Step 4: Handle drag end - update graph pointers

When a step is dragged to a new position within a linear sequence:

```typescript
function handleDragEnd(event: DragEndEvent, sequence: string[]) {
  const { active, over } = event;
  if (!active || !over || active.id === over.id) return;

  const oldIndex = sequence.indexOf(active.id as string);
  const newIndex = sequence.indexOf(over.id as string);
  if (oldIndex === -1 || newIndex === -1) return;

  // Create new sequence order
  const newSequence = [...sequence];
  const [moved] = newSequence.splice(oldIndex, 1);
  newSequence.splice(newIndex, 0, moved);

  // Update graph pointers
  const newGraph = JSON.parse(JSON.stringify(graph));

  // Update nextStepId pointers in the reordered sequence
  for (let i = 0; i < newSequence.length; i++) {
    const stepId = newSequence[i];
    const step = newGraph.steps[stepId];
    if (i < newSequence.length - 1) {
      // Point to the next step in the new sequence
      step.nextStepId = newSequence[i + 1];
    } else {
      // Last step in sequence: point to whatever the original last step pointed to
      step.nextStepId = originalLastStepNextId;
    }
  }

  // Update rootStepId if the first step in root sequence changed
  if (sequence[0] === graph.rootStepId && newSequence[0] !== graph.rootStepId) {
    newGraph.rootStepId = newSequence[0];
  }

  // Update any choice steps that pointed INTO this sequence
  // (the step that was the entry point of the sequence)
  updateIncomingPointers(newGraph, sequence[0], newSequence[0]);

  onGraphChange(newGraph, true); // true = add to undo history
}
```

### Step 5: Update incoming pointers

When the first step in a sequence changes due to reordering, any parent step (especially choice steps) that pointed to the old first step must be updated:

```typescript
function updateIncomingPointers(
  graph: FormGraph,
  oldEntryId: string,
  newEntryId: string
) {
  if (oldEntryId === newEntryId) return;

  for (const step of Object.values(graph.steps)) {
    // Update direct nextStepId pointers
    if (step.nextStepId === oldEntryId) {
      step.nextStepId = newEntryId;
    }
    // Update choice branch pointers
    if (step.type === "choice" && step.choices) {
      for (const choice of step.choices) {
        if (choice.nextStepId === oldEntryId) {
          choice.nextStepId = newEntryId;
        }
      }
    }
  }

  // Update rootStepId if needed
  if (graph.rootStepId === oldEntryId) {
    graph.rootStepId = newEntryId;
  }
}
```

### Step 6: Visual drag indicators

Add visual feedback during drag:

```tsx
// Drop indicator line between steps
function DropIndicator({ isOver }: { isOver: boolean }) {
  return (
    <div className={`h-1 rounded-full transition-colors ${
      isOver ? "bg-primary" : "bg-transparent"
    }`} />
  );
}

// Dragging overlay
<DragOverlay>
  {activeStep && (
    <div className="shadow-lg rounded-md border bg-background p-4 opacity-90">
      <p className="font-medium text-sm">{activeStep.question}</p>
      <Badge variant="outline" className="text-xs mt-1">{activeStep.type}</Badge>
    </div>
  )}
</DragOverlay>
```

### Step 7: Restrict dragging for choice steps

Choice steps (which create branches) should NOT be draggable within a linear sequence, because moving them would break the branch structure. Mark them as non-draggable:

```tsx
const isDraggable = step.type !== "choice";

<SortableStep
  stepId={stepId}
  step={step}
  disabled={!isDraggable}
/>
```

Choice steps can be indicated with a lock icon and tooltip: "Choice steps with branches cannot be reordered. Reorder the steps within each branch instead."

### Step 8: Keyboard drag support

`@dnd-kit` supports keyboard dragging out of the box. The `useSortable` hook provides:
- Space/Enter to pick up
- Arrow keys to move
- Space/Enter to drop
- Escape to cancel

Ensure these are documented in the UI with a help tooltip.

## Data Flow

```
User grabs drag handle on Step B in sequence [A, B, C, D]
  -> DndContext activates
  -> Step B becomes semi-transparent (isDragging)
  -> DragOverlay shows step preview

User drags Step B between C and D
  -> Drop indicator appears between C and D
  -> User releases

handleDragEnd fires:
  -> Old sequence: [A, B, C, D]
  -> New sequence: [A, C, B, D]
  -> Update pointers:
     A.nextStepId = C (was B)
     C.nextStepId = B (was D... wait, C originally pointed to D)
     B.nextStepId = D (was C)
     D.nextStepId unchanged
  -> onGraphChange(newGraph, true) called
  -> Undo history entry added
  -> Autosave triggers after 1.5s debounce

GRAPH POINTER BEFORE:
  A -> B -> C -> D -> (end)

GRAPH POINTER AFTER:
  A -> C -> B -> D -> (end)
```

## Annotations

- **Only linear sequences**: Drag-and-drop only works within non-branching sequences. This is a deliberate constraint to avoid complex graph rewiring. Choice steps create branches and are not draggable.
- **Undo integration**: Every drag operation creates an undo history entry via `addToHistory()` (form-builder.tsx:102-112), so the user can Ctrl+Z to revert a drag.
- **Autosave integration**: Graph changes from drag trigger the same autosave flow as manual edits (1.5s debounce).
- **Decision tree editor is 46KB**: The existing component is large. The drag functionality should be added as a composable layer on top, not a rewrite. Use the existing step rendering and wrap it in sortable containers.
- **Alternative: Move Up/Move Down buttons**: If full drag-and-drop proves too complex to implement, a simpler alternative is arrow buttons on each step to move it up or down within its linear sequence. This achieves the same reordering with less code.

## Verification

1. Open form builder with a linear form (no branches): A -> B -> C -> D
2. Drag B below C -> sequence becomes A -> C -> B -> D
3. Verify graph renders correctly with new order
4. Ctrl+Z -> reverts to A -> B -> C -> D
5. Create a branching form: A -> Choice(X: B->C, Y: D->E)
6. Within branch X, drag C above B -> branch becomes B and C swap
7. Choice step itself is not draggable (shows lock icon)
8. Autosave fires after drag reorder
9. Preview form -> steps appear in new order
10. Keyboard: Space to grab, arrows to move, Space to drop
