# 08: Keyboard Shortcuts and Accessibility

> **Status: Implemented**

## Issue

The application lacks keyboard shortcuts for common actions. Power users must use the mouse for everything. The form builder is particularly affected -- undo/redo requires clicking small buttons (`form-builder.tsx:361-380`), and there's no way to save, preview, or navigate using the keyboard.

Additionally, several accessibility gaps exist:
- Focus management is not handled when dialogs open/close
- Card navigation doesn't support Enter/Space key activation
- No skip-to-content links for screen reader users
- Form builder steps lack keyboard navigation

## Affected Files

| File | Path | Role |
|------|------|------|
| New Hook | `client/src/hooks/use-keyboard-shortcuts.ts` | Central keyboard shortcut handler |
| Form Builder | `client/src/pages/form-builder.tsx` | Undo/redo, save, preview shortcuts |
| Admin Dashboard | `client/src/pages/admin-dashboard.tsx` | Card keyboard navigation |
| Cruise Detail | `client/src/pages/cruise-detail.tsx` | Tab navigation, sheet close |
| Public Form | `client/src/pages/public-form.tsx` | Form navigation (Enter to proceed) |
| App | `client/src/App.tsx` | Skip-to-content link |

## Solution

### Step 1: Create keyboard shortcut hook

Create `client/src/hooks/use-keyboard-shortcuts.ts`:

```typescript
import { useEffect, useCallback } from "react";

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: () => void;
  description: string;
  // Don't fire when user is typing in an input/textarea
  ignoreInputs?: boolean;
}

export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Skip if user is in an input, textarea, or contenteditable
    const target = e.target as HTMLElement;
    const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

    for (const shortcut of shortcuts) {
      const ctrlMatch = shortcut.ctrl ? (e.ctrlKey || e.metaKey) : !(e.ctrlKey || e.metaKey);
      const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
      const altMatch = shortcut.alt ? e.altKey : !e.altKey;
      const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();

      if (ctrlMatch && shiftMatch && altMatch && keyMatch) {
        if (isInput && shortcut.ignoreInputs !== false) {
          // For Ctrl+key combos, still fire even in inputs
          if (!shortcut.ctrl) continue;
        }
        e.preventDefault();
        shortcut.handler();
        return;
      }
    }
  }, [shortcuts]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
```

### Step 2: Add shortcuts to Form Builder

In `form-builder.tsx`, after the existing hooks:

```tsx
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

// Inside FormBuilder component:
useKeyboardShortcuts([
  {
    key: "z",
    ctrl: true,
    handler: handleUndo,
    description: "Undo",
  },
  {
    key: "z",
    ctrl: true,
    shift: true,
    handler: handleRedo,
    description: "Redo",
  },
  {
    key: "y",
    ctrl: true,
    handler: handleRedo,
    description: "Redo (alt)",
  },
  {
    key: "s",
    ctrl: true,
    handler: () => performAutoSave(),
    description: "Force save",
  },
  {
    key: "p",
    ctrl: true,
    shift: true,
    handler: () => setLocation(`/admin/preview/${id}`),
    description: "Preview form",
  },
]);
```

### Step 3: Add keyboard navigation to dashboard cards

In `admin-dashboard.tsx`, make cards focusable and respond to Enter/Space:

```tsx
// Cruise cards (line 458)
<Card
  key={cruise.id}
  className="hover-elevate cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
  onClick={() => setLocation(`/admin/cruises/${cruise.id}`)}
  onKeyDown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setLocation(`/admin/cruises/${cruise.id}`);
    }
  }}
  tabIndex={0}
  role="link"
  aria-label={`Open cruise: ${cruise.name}`}
>

// Template cards (line 625) -- after Plan 01 adds onClick
<Card
  key={template.id}
  className="hover-elevate cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
  onClick={() => setLocation(`/admin/builder/${template.id}`)}
  onKeyDown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setLocation(`/admin/builder/${template.id}`);
    }
  }}
  tabIndex={0}
  role="link"
  aria-label={`Edit template: ${template.name}`}
>
```

### Step 4: Add Escape key to close modals/sheets

Most radix UI components handle Escape already, but verify and add explicit support where missing:

In `cruise-detail.tsx`, the submission sheet (line 910):
```tsx
// Sheet already handles Escape via Radix. Verify it works.
// The onOpenChange={() => setSelectedSubmission(null)} should fire on Escape.
```

### Step 5: Public form Enter key to proceed

In `public-form.tsx`, allow Enter key to advance:

```tsx
// For text steps: Enter submits current answer and moves to next step
// Find the text input section and add:
onKeyDown={(e) => {
  if (e.key === "Enter" && inputValue.trim()) {
    e.preventDefault();
    handleTextSubmit();
  }
}}
```

For choice steps, choices are already buttons that respond to Enter/Space natively.

### Step 6: Focus management

When navigating between steps in the public form, focus the new step's primary input:

```tsx
// In public-form.tsx, when currentStepId changes:
useEffect(() => {
  // Focus the first input/button in the new step after a brief delay
  const timer = setTimeout(() => {
    const stepContainer = document.querySelector('[data-step-container]');
    const focusable = stepContainer?.querySelector<HTMLElement>(
      'input, button:not([data-navigation]), [tabindex="0"]'
    );
    focusable?.focus();
  }, 100); // Small delay for animation to complete
  return () => clearTimeout(timer);
}, [currentStepId]);
```

### Step 7: Add shortcut hints to button tooltips

Update button titles in form builder to show shortcuts:

```tsx
// Undo button (line 366)
title="Undo (Ctrl+Z)"

// Redo button (line 376)
title="Redo (Ctrl+Shift+Z)"

// Preview button (line 407-410)
title="Preview (Ctrl+Shift+P)"
```

### Step 8: Skip-to-content link

In `App.tsx`, add a skip link for screen readers:

```tsx
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:p-4 focus:bg-background focus:text-foreground focus:border"
        >
          Skip to main content
        </a>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
```

Then add `id="main-content"` to the `<main>` element in each page.

## Data Flow

```
Keyboard event fires
  -> useKeyboardShortcuts hook checks against registered shortcuts
  -> If match found and not in ignored input:
     -> e.preventDefault() called
     -> Handler function executed
  -> If no match: event passes through normally

Form Builder shortcuts:
  Ctrl+Z -> handleUndo() -> restores previous graph from history
  Ctrl+Shift+Z / Ctrl+Y -> handleRedo() -> moves forward in history
  Ctrl+S -> performAutoSave() -> triggers immediate save
  Ctrl+Shift+P -> setLocation() -> navigates to preview

Dashboard card keyboard:
  Tab -> moves focus between cards
  Enter/Space on focused card -> navigates to detail/builder

Public form:
  Enter on text input -> advances to next step
  Tab between choice buttons -> standard focus behavior
  Step change -> auto-focuses first interactive element
```

## Annotations

- **Platform-aware Ctrl/Cmd**: The hook checks `e.ctrlKey || e.metaKey` so Ctrl on Windows/Linux and Cmd on Mac both work.
- **Input exclusion**: Non-Ctrl shortcuts (like Escape) don't fire when the user is typing in inputs. Ctrl-based shortcuts (Ctrl+S, Ctrl+Z) fire even in inputs since that's expected behavior.
- **Radix handles modals**: Dialog, Sheet, and other Radix components already handle Escape key to close. No need to duplicate that logic.
- **Focus-visible ring**: Using Tailwind's `focus-visible:ring-2` ensures focus indicators only show for keyboard users, not mouse clicks.
- **Existing test IDs preserved**: All `data-testid` attributes remain unchanged.
- **No API changes**: This is entirely a client-side UX enhancement.

## Verification

1. Form Builder: Ctrl+Z undoes last change
2. Form Builder: Ctrl+Shift+Z redoes undone change
3. Form Builder: Ctrl+S triggers immediate save (status shows "Saving...")
4. Form Builder: Ctrl+Shift+P opens preview
5. Dashboard: Tab through cards -> focus ring visible
6. Dashboard: Enter on focused card -> navigates
7. Public form: Enter on text input -> advances to next step
8. Public form: Step change -> first input auto-focused
9. Skip-to-content link visible on Tab from page top
10. All shortcuts work on both Mac (Cmd) and Windows/Linux (Ctrl)
