# 11: Unsaved Changes Warning Dialogs

> **Status: Implemented**

## Issue

Multiple pages have autosave or fire-and-forget save mechanisms, but users receive no warning when navigating away with unsaved changes. This leads to silent data loss in edge cases:

1. **Form Builder** (`form-builder.tsx`): Has autosave with 1.5s debounce (line 186-188), `beforeunload` handler (line 215-220), and unmount save (lines 242-268). However, the `beforeunload` handler fires silently in some browsers, and SPA navigation (via Wouter) bypasses `beforeunload` entirely -- it relies on the unmount `fetch(keepalive: true)` which is fire-and-forget with no guarantee.

2. **Cruise Detail Learn More** (`cruise-detail.tsx`): Saves on unmount with `fetch(keepalive: true)` (lines 210-234). No user warning. If the fetch fails, changes are lost silently.

3. **Public Form** (`public-form.tsx`): Has draft persistence to localStorage (line 65-74) but no `beforeunload` warning dialog. Users might accidentally close the tab mid-form.

## Affected Files

| File | Path | Role |
|------|------|------|
| Form Builder | `client/src/pages/form-builder.tsx` | Autosave + unsaved state (lines 37, 186-195) |
| Cruise Detail | `client/src/pages/cruise-detail.tsx` | Learn More unsaved refs (lines 71-75, 199-207) |
| Public Form | `client/src/pages/public-form.tsx` | Draft persistence (lines 65-74, 190) |
| New Hook | `client/src/hooks/use-navigation-guard.ts` | Reusable navigation guard |
| New Component | `client/src/components/unsaved-changes-dialog.tsx` | Warning dialog |

## Solution

### Step 1: Create navigation guard hook

Create `client/src/hooks/use-navigation-guard.ts`:

```typescript
import { useEffect, useRef, useState, useCallback } from "react";

interface NavigationGuardOptions {
  /** Returns true if there are unsaved changes */
  hasUnsavedChanges: () => boolean;
  /** Optional: called when user confirms they want to leave */
  onConfirmLeave?: () => void;
  /** Message for the browser's beforeunload dialog */
  message?: string;
}

export function useNavigationGuard({
  hasUnsavedChanges,
  onConfirmLeave,
  message = "You have unsaved changes. Are you sure you want to leave?",
}: NavigationGuardOptions) {
  const [showDialog, setShowDialog] = useState(false);
  const pendingNavigationRef = useRef<string | null>(null);
  const hasUnsavedRef = useRef(hasUnsavedChanges);

  // Keep ref in sync
  useEffect(() => {
    hasUnsavedRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  // Browser tab close / refresh warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedRef.current()) {
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [message]);

  // Intercept Wouter navigation
  // Override the pushState/replaceState to intercept SPA navigation
  useEffect(() => {
    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);

    const interceptNavigation = (url: string) => {
      if (hasUnsavedRef.current()) {
        pendingNavigationRef.current = url;
        setShowDialog(true);
        return false; // Block navigation
      }
      return true; // Allow navigation
    };

    history.pushState = function (...args) {
      const url = args[2]?.toString() || "";
      if (interceptNavigation(url)) {
        return originalPushState(...args);
      }
    };

    return () => {
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    };
  }, []);

  const confirmLeave = useCallback(() => {
    setShowDialog(false);
    onConfirmLeave?.();
    if (pendingNavigationRef.current) {
      // Temporarily disable guard, then navigate
      const url = pendingNavigationRef.current;
      pendingNavigationRef.current = null;
      window.location.href = url;
    }
  }, [onConfirmLeave]);

  const cancelLeave = useCallback(() => {
    setShowDialog(false);
    pendingNavigationRef.current = null;
  }, []);

  return {
    showDialog,
    confirmLeave,
    cancelLeave,
  };
}
```

### Step 2: Create unsaved changes dialog component

Create `client/src/components/unsaved-changes-dialog.tsx`:

```tsx
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface UnsavedChangesDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  description?: string;
}

export function UnsavedChangesDialog({
  open,
  onConfirm,
  onCancel,
  description = "You have unsaved changes that will be lost if you leave this page.",
}: UnsavedChangesDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Stay on Page</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Leave Without Saving
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

### Step 3: Integrate into Form Builder

In `form-builder.tsx`:

```tsx
import { useNavigationGuard } from "@/hooks/use-navigation-guard";
import { UnsavedChangesDialog } from "@/components/unsaved-changes-dialog";

// Inside FormBuilder component:
const { showDialog, confirmLeave, cancelLeave } = useNavigationGuard({
  hasUnsavedChanges: () => pendingChangesRef.current,
  onConfirmLeave: () => {
    // Fire off save before leaving
    const currentGraph = graphRef.current;
    const currentName = templateNameRef.current;
    if (currentGraph && currentName && pendingChangesRef.current) {
      fetch(`/api/templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: currentName, graph: currentGraph }),
        credentials: "include",
        keepalive: true,
      });
    }
  },
});

// In the JSX, add the dialog:
<UnsavedChangesDialog
  open={showDialog}
  onConfirm={confirmLeave}
  onCancel={cancelLeave}
  description="Your form has unsaved changes. They will be auto-saved, but you may want to wait for the save to complete."
/>
```

Note: The form builder already has autosave, so the dialog is more of a safety net. The `onConfirmLeave` callback fires off a save attempt. The dialog text acknowledges autosave exists.

### Step 4: Integrate into Cruise Detail (Learn More)

In `cruise-detail.tsx`:

```tsx
import { useNavigationGuard } from "@/hooks/use-navigation-guard";
import { UnsavedChangesDialog } from "@/components/unsaved-changes-dialog";

const { showDialog, confirmLeave, cancelLeave } = useNavigationGuard({
  hasUnsavedChanges: () => hasUnsavedLearnMoreRef.current,
  onConfirmLeave: () => {
    // Fire off save before leaving (same as existing unmount logic)
    if (hasUnsavedLearnMoreRef.current && id) {
      fetch(`/api/cruises/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          learnMoreHeader: learnMoreHeaderRef.current || null,
          learnMoreImages: learnMoreImagesRef.current.length > 0 ? learnMoreImagesRef.current : null,
          learnMoreDescription: learnMoreDescriptionRef.current || null,
        }),
        credentials: "include",
        keepalive: true,
      });
    }
  },
});

// In JSX:
<UnsavedChangesDialog
  open={showDialog}
  onConfirm={confirmLeave}
  onCancel={cancelLeave}
  description="Your Learn More content has unsaved changes. Click 'Save Learn More Content' to save, or leave without saving."
/>
```

### Step 5: Integrate into Public Form

In `public-form.tsx`:

```tsx
// The public form already has draft persistence, so this is lighter:
useEffect(() => {
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    // Only warn if user has started filling (has at least 1 answer)
    if (Object.keys(answers).length > 0 && phase !== "submitted") {
      saveDraft(); // Save draft before showing warning
      e.preventDefault();
      e.returnValue = "Your form progress has been saved as a draft. Are you sure you want to leave?";
    }
  };

  window.addEventListener("beforeunload", handleBeforeUnload);
  return () => window.removeEventListener("beforeunload", handleBeforeUnload);
}, [answers, phase]);
```

Note: For the public form, we only add the `beforeunload` warning (browser-level). We don't intercept SPA navigation since the public form is a single-page flow without internal navigation links that could lose data.

### Step 6: Handle the alert-dialog Radix component

Check if `alert-dialog.tsx` exists in the UI components. If not, it needs to be added:

```bash
# Check for existing alert-dialog component
ls client/src/components/ui/alert-dialog.tsx
```

If it doesn't exist, create it using the standard shadcn/ui pattern (it's part of the Radix UI primitives already in the project's dependencies).

## Data Flow

```
FORM BUILDER:
  User edits graph -> pendingChangesRef.current = true
  User clicks Back button:
    -> history.pushState intercepted
    -> hasUnsavedChanges() returns true
    -> Dialog shown: "Unsaved Changes"
    -> User clicks "Stay on Page" -> navigation cancelled
    -> User clicks "Leave Without Saving" -> onConfirmLeave fires save, then navigates

CRUISE DETAIL:
  User edits Learn More content -> hasUnsavedLearnMoreRef.current = true
  User clicks Back arrow:
    -> Same interception flow
    -> Dialog: "Your Learn More content has unsaved changes"
    -> "Stay on Page" or "Leave Without Saving"

PUBLIC FORM:
  User starts filling form -> answers has entries
  User closes browser tab:
    -> beforeunload fires
    -> saveDraft() saves to localStorage
    -> Browser shows "Leave site?" dialog
    -> If user leaves: draft is saved for later
    -> If user stays: continues filling
```

## Annotations

- **History.pushState interception**: This is the only reliable way to intercept Wouter navigation since Wouter uses `pushState` internally. This is a common pattern in SPA navigation guards.
- **Alert dialog vs custom dialog**: Using AlertDialog from Radix ensures proper focus management, Escape handling, and accessibility. It's the right component for "are you sure?" patterns.
- **Existing save-on-unmount preserved**: The `useNavigationGuard` adds a visual warning BEFORE unmount. The existing unmount save logic (`fetch` with `keepalive`) remains as a safety net.
- **Form builder has autosave**: The dialog text acknowledges this. It's a "belt and suspenders" approach -- autosave handles most cases, the dialog catches edge cases.
- **Public form uses localStorage**: Draft persistence already works. The `beforeunload` warning is an additional signal to the user that their progress is saved.
- **No server changes**: This is entirely client-side UX.

## Verification

1. Form Builder: Edit a step, click Back immediately (before autosave) -> dialog appears
2. Form Builder: Click "Stay on Page" -> remains on builder, autosave completes
3. Form Builder: Click "Leave Without Saving" -> navigates, save attempt fires
4. Form Builder: Wait for autosave to complete, click Back -> no dialog (no unsaved changes)
5. Cruise Detail: Edit Learn More text, click Back -> dialog appears
6. Cruise Detail: Click "Save Learn More Content" first, then Back -> no dialog
7. Public Form: Fill 2 answers, close tab -> browser shows leave warning
8. Public Form: Close and reopen -> draft restoration banner appears
9. All dialogs are accessible: Escape to cancel, Tab between buttons
