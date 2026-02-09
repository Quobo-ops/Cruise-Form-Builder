# 04: Breadcrumb Navigation System

> **Status: Implemented**

## Issue

The admin interface lacks a consistent breadcrumb trail. Users can lose context about where they are in the navigation hierarchy. Currently:

- Admin Dashboard has no breadcrumbs (just tab buttons at lines 276-295 of `admin-dashboard.tsx`)
- Cruise Detail has a single "Back" arrow link (`cruise-detail.tsx:363`)
- Form Builder has a single "Back" arrow link (`form-builder.tsx:343`)
- Form Preview has no visible parent context

Users should always see their position in the hierarchy:
```
Dashboard > Cruises > Caribbean Adventure 2025
Dashboard > Templates > Booking Form > Preview
```

## Affected Files

| File | Path | Role |
|------|------|------|
| New Component | `client/src/components/breadcrumbs.tsx` | Reusable breadcrumb component |
| Cruise Detail | `client/src/pages/cruise-detail.tsx` | Replace back button with breadcrumbs (line 362-366) |
| Form Builder | `client/src/pages/form-builder.tsx` | Replace back button with breadcrumbs (line 342-346) |
| Form Preview | `client/src/pages/form-preview.tsx` | Add breadcrumbs |
| Admin Dashboard | `client/src/pages/admin-dashboard.tsx` | Add root breadcrumb |

## Solution

### Step 1: Create Breadcrumb Component

Create `client/src/components/breadcrumbs.tsx`:

```tsx
import { Link } from "wouter";
import { ChevronRight, Home } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  href?: string;  // If undefined, this is the current (non-clickable) item
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
      <Link href="/admin/cruises" className="text-muted-foreground hover:text-foreground transition-colors">
        <Home className="w-4 h-4" />
      </Link>
      {items.map((item, index) => (
        <span key={index} className="flex items-center gap-1.5">
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
          {item.href ? (
            <Link
              href={item.href}
              className="text-muted-foreground hover:text-foreground transition-colors truncate max-w-[150px]"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-foreground font-medium truncate max-w-[200px]">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
```

### Step 2: Integrate into Cruise Detail

In `cruise-detail.tsx`, replace the back button (lines 362-366):

**Before:**
```tsx
<Link href="/admin/cruises" className="flex items-center gap-2 text-muted-foreground hover-elevate rounded-md px-2 py-1">
  <ArrowLeft className="w-4 h-4" />
  <span className="hidden sm:inline">Back</span>
</Link>
```

**After:**
```tsx
<Breadcrumbs items={[
  { label: "Cruises", href: "/admin/cruises" },
  { label: cruise.name },
]} />
```

### Step 3: Integrate into Form Builder

In `form-builder.tsx`, replace the back button (lines 342-346):

**Before:**
```tsx
<Link href="/admin/dashboard" className="flex items-center gap-2 text-muted-foreground hover-elevate rounded-md px-2 py-1">
  <ArrowLeft className="w-4 h-4" />
  <span className="hidden sm:inline">Back</span>
</Link>
```

**After:**
```tsx
<Breadcrumbs items={[
  { label: "Templates", href: backHref },  // backHref from Plan 02
  { label: templateName || "Untitled" },
]} />
```

When accessed from a cruise context (using `from` param from Plan 02):
```tsx
// If from=cruise-abc123
<Breadcrumbs items={[
  { label: "Cruises", href: "/admin/cruises" },
  { label: cruiseName, href: `/admin/cruises/${cruiseId}` },
  { label: templateName || "Untitled" },
]} />
```

### Step 4: Integrate into Form Preview

In `form-preview.tsx`, add breadcrumbs:

```tsx
<Breadcrumbs items={[
  { label: "Templates", href: "/admin/templates" },
  { label: templateName, href: `/admin/builder/${id}` },
  { label: "Preview" },
]} />
```

### Step 5: Mobile Responsive

On small screens, collapse intermediate breadcrumbs:

```tsx
// In the Breadcrumbs component, when items.length > 2 on mobile:
// Show: Home > ... > Current Page
// The "..." expands on click to show all items
```

Add responsive behavior:

```tsx
{items.length > 2 && (
  <span className="sm:hidden flex items-center gap-1.5">
    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
    <button onClick={() => setExpanded(!expanded)} className="text-muted-foreground">
      ...
    </button>
  </span>
)}
```

## Data Flow

```
Breadcrumb items are computed statically per page:

Admin Dashboard:
  items = [] (root page, no breadcrumbs needed -- just tabs)

Cruise Detail:
  items = [
    { label: "Cruises", href: "/admin/cruises" },
    { label: cruise.name }  // loaded from useQuery
  ]

Form Builder (from templates):
  items = [
    { label: "Templates", href: "/admin/templates" },
    { label: templateName }  // loaded from useQuery / local state
  ]

Form Builder (from cruise detail):
  items = [
    { label: "Cruises", href: "/admin/cruises" },
    { label: cruiseName, href: `/admin/cruises/${cruiseId}` },
    { label: templateName }
  ]
  Note: cruiseName needs to be passed via query param or fetched

Form Preview:
  items = [
    { label: "Templates", href: "/admin/templates" },
    { label: templateName, href: `/admin/builder/${id}` },
    { label: "Preview" }
  ]
```

## Annotations

- **Accessibility**: Uses `<nav aria-label="Breadcrumb">` for screen readers. Last item is not a link (current page).
- **Truncation**: Long cruise/template names are truncated with `max-w-[150px] truncate` to prevent layout overflow.
- **No API changes**: All data needed for breadcrumbs is already available on each page (cruise name, template name, etc.).
- **Consistent with shadcn/ui**: Styled to match existing theme variables (`text-muted-foreground`, `text-foreground`).
- **Works with Plan 02**: Uses the `from` query parameter to determine the breadcrumb trail context.
- **Mobile**: Collapses intermediate items on small screens to save space.

## Verification

1. Cruise Detail shows: Home > Cruises > [Cruise Name]
2. Click "Cruises" in breadcrumb -> navigates to cruises list
3. Form Builder (from templates) shows: Home > Templates > [Template Name]
4. Form Builder (from cruise) shows: Home > Cruises > [Cruise] > [Template]
5. Form Preview shows: Home > Templates > [Template] > Preview
6. Click any breadcrumb item -> navigates correctly
7. Long names are truncated with ellipsis
8. Mobile view collapses intermediate breadcrumbs
