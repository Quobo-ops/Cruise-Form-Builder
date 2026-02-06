# 02: Context-Aware Back Navigation

## Issue

When navigating from the Form Builder back to the dashboard, the user always lands on the Cruises tab (the default), regardless of how they arrived at the form builder. If a user was on the Templates tab, clicked a template to edit it, then clicked "Back", they should return to the Templates tab -- not the Cruises tab.

Similarly, the Cruise Detail page always links back to `/admin/cruises` (line 363 of `cruise-detail.tsx`), which is correct. But the Form Builder links back to `/admin/dashboard` (line 343 of `form-builder.tsx`), which always resolves to the Cruises tab because the `activeTab` logic at line 68-70 of `admin-dashboard.tsx` defaults to `"cruises"`.

**Current behavior:**
- Form Builder "Back" button -> `/admin/dashboard` -> Cruises tab (always)
- Cruise Detail "Back" button -> `/admin/cruises` -> Cruises tab (correct)

**Expected behavior:**
- Form Builder "Back" button -> `/admin/templates` (if came from Templates tab)
- Form Builder "Back" button -> `/admin/cruises/:id` (if came from a Cruise detail page that linked to edit template)
- Cruise Detail "Back" button -> `/admin/cruises` (unchanged, already correct)

## Affected Files

| File | Path | Role |
|------|------|------|
| Form Builder | `client/src/pages/form-builder.tsx` | Back button link (line 343) |
| Admin Dashboard | `client/src/pages/admin-dashboard.tsx` | Tab derivation logic (lines 68-70) |
| Form Preview | `client/src/pages/form-preview.tsx` | Back button (if any) |

## Solution

### Approach: Use referrer-based back navigation

Since Wouter doesn't have built-in history state, use URL query parameters to encode the return destination.

### Step 1: Encode return path in navigation links

When navigating TO the form builder from the Templates tab, append a `?from=templates` query parameter.

In `admin-dashboard.tsx`, the template card onClick (from Plan 01) and dropdown Edit link:

```tsx
// Card onClick (new from Plan 01)
onClick={() => setLocation(`/admin/builder/${template.id}?from=templates`)}

// Dropdown Edit link (line 642)
<Link href={`/admin/builder/${template.id}?from=templates`} className="flex items-center gap-2">
```

When navigating from a cruise detail page to edit its template (if this link is added later), use:
```tsx
setLocation(`/admin/builder/${templateId}?from=cruise-${cruiseId}`)
```

### Step 2: Read the `from` parameter in FormBuilder

In `form-builder.tsx`, parse the query string to determine the back destination:

```tsx
// At the top of the component, after hooks
const searchParams = new URLSearchParams(window.location.search);
const fromParam = searchParams.get("from");

const backHref = fromParam === "templates"
  ? "/admin/templates"
  : fromParam?.startsWith("cruise-")
    ? `/admin/cruises/${fromParam.replace("cruise-", "")}`
    : "/admin/templates"; // Default to templates since forms ARE templates
```

### Step 3: Update the Back button link

In `form-builder.tsx` line 343:

**Before:**
```tsx
<Link href="/admin/dashboard" className="flex items-center gap-2 text-muted-foreground hover-elevate rounded-md px-2 py-1">
```

**After:**
```tsx
<Link href={backHref} className="flex items-center gap-2 text-muted-foreground hover-elevate rounded-md px-2 py-1">
```

### Step 4: Update FormPreview back navigation

The FormPreview page (`form-preview.tsx`) should also propagate the `from` parameter when linking back to the builder, or directly back to the appropriate dashboard tab.

Read the existing file to find the back button and update it similarly.

## Data Flow

```
User on Templates tab
  -> Clicks template card
  -> URL: /admin/builder/:id?from=templates
  -> FormBuilder reads from=templates
  -> Back button href = /admin/templates
  -> User clicks Back
  -> URL: /admin/templates
  -> AdminDashboard activeTab = "templates" (line 68 matches)

User on Cruises tab -> Cruise Detail -> Edit Template (future)
  -> URL: /admin/builder/:id?from=cruise-abc123
  -> FormBuilder reads from=cruise-abc123
  -> Back button href = /admin/cruises/abc123
  -> User clicks Back
  -> URL: /admin/cruises/abc123
  -> CruiseDetail loads

User navigates to builder directly (no from param)
  -> Back button href = /admin/templates (sensible default since builder edits templates)
```

## Annotations

- **Query param approach** chosen over sessionStorage because it's stateless, bookmarkable, and works with browser back/forward
- **No API changes needed**: Entirely client-side routing logic
- **ActiveTab logic already works**: The `activeTab` derivation at lines 68-70 of `admin-dashboard.tsx` already checks `location.includes("/admin/templates")` and `location.includes("/admin/cruises")`, so navigating to `/admin/templates` correctly activates the templates tab
- **FormPreview consideration**: If the user goes Builder -> Preview -> Back, the Preview's back should go to Builder (with the `from` param preserved), not to the dashboard
- **Default changed from `/admin/dashboard` to `/admin/templates`**: Since form builder edits templates, the natural parent is the templates list

## Verification

1. From Templates tab, click template card -> form builder opens
2. Click Back in form builder -> returns to Templates tab (NOT Cruises tab)
3. From Cruises tab, navigate to a cruise detail, then to edit its template
4. Click Back in form builder -> returns to that cruise's detail page
5. Direct URL to `/admin/builder/:id` (no `from` param) -> Back goes to Templates tab
6. Builder -> Preview -> Back to Builder -> Back -> returns to correct origin
