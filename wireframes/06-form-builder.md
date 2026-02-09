# Form Builder (Decision Tree Editor)

**Route:** `/admin/builder/:id`  
**File:** `client/src/pages/form-builder.tsx`  
**Audience:** Authenticated admin users

---

## What the User Sees & Can Do

### Header (sticky, full-width)
- CruiseBook ship icon
- **Breadcrumbs** (context-aware):
  - If from templates: Templates > [Template Name]
  - If from a cruise: Cruises > Cruise > [Template Name]
- **Template name input** — editable inline text field to rename the template
- **Undo button** (Ctrl+Z) — reverts to previous graph state
- **Redo button** (Ctrl+Shift+Z or Ctrl+Y) — re-applies undone change
- **Autosave status indicator:**
  - "Saved" with green checkmark
  - "Saving..." with spinner
  - "Unsaved" with cloud icon
- **Theme toggle**
- **Preview button** — navigates to `/admin/preview/:id`
- **Publish button** — opens Publish dialog

### Decision Tree Builder Area
- **Sub-header bar:**
  - Git-branch icon + "Decision Tree Builder" heading
  - Step count badge (e.g., "5 steps")
  - Branch count badge (e.g., "3 branches")
  - Helper text: "Click on any node to edit it. Use the + buttons to add new steps or end branches."
- **Interactive Decision Tree Visualization:**
  - Visual graph/tree of all form steps
  - Clickable nodes to select and edit steps
  - "+" buttons to add new steps or end branches
  - Supports step types: text, choice, quantity, conclusion
  - Drag and visual editing within the `DecisionTreeEditor` component

### Keyboard Shortcuts
- **Ctrl+Z** — Undo
- **Ctrl+Shift+Z** / **Ctrl+Y** — Redo
- **Ctrl+S** — Force save
- **Ctrl+Shift+P** — Open form preview

### Publish Dialog
- Heading: "Publish Template"
- Description: "Publishing will generate a shareable link that customers can use to fill out this form."
- Note: "Once published, changes to this template will be reflected in the live form."
- Cancel button
- **"Publish & Copy Link" button** — publishes and copies shareable URL to clipboard

### Unsaved Changes Dialog
- Appears when navigating away with pending autosave
- "Your form has unsaved changes. They will be auto-saved, but you may want to wait for the save to complete."
- Confirm leave or cancel options

### Auto-Save Behavior
- Debounced auto-save (1.5 second delay after last change)
- Saves on visibility change (tab switch)
- Saves on beforeunload (browser close/refresh)
- Saves on component unmount (SPA navigation)

### Loading State
- Skeleton header and full-height content area
