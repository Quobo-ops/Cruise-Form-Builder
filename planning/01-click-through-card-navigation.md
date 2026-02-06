# 01: Click-Through Card Navigation

## Issue

Template cards in the admin dashboard are not directly clickable. Unlike cruise cards (which navigate on click at `admin-dashboard.tsx:458`), template cards require users to open a 3-dot dropdown menu and select "Edit" to navigate to the form builder. This creates an inconsistent UX where cruises respond to direct clicks but templates do not.

**Current behavior:**
- Cruise cards: Click anywhere on card -> navigates to `/admin/cruises/:id` (line 458)
- Template cards: Must click 3-dot menu -> click "Edit" -> navigates to `/admin/builder/:id` (lines 641-645)

**Expected behavior:**
- Both cruise cards AND template cards should navigate on click
- Clicking a cruise card -> `/admin/cruises/:id` (already works)
- Clicking a template card -> `/admin/builder/:id` (needs implementation)

## Affected Files

| File | Path | Role |
|------|------|------|
| Admin Dashboard | `client/src/pages/admin-dashboard.tsx` | Template card rendering (lines 624-680) |

## Solution

### Step 1: Add onClick handler to template cards

In `admin-dashboard.tsx`, modify the template card at line 625:

**Before:**
```tsx
<Card key={template.id} className="hover-elevate">
```

**After:**
```tsx
<Card key={template.id} className="hover-elevate cursor-pointer" onClick={() => setLocation(`/admin/builder/${template.id}`)}>
```

### Step 2: Add stopPropagation to dropdown trigger

The dropdown menu trigger already exists at line 635. Add `onClick={(e) => e.stopPropagation()}` to prevent the card click from firing when the dropdown is opened, mirroring the pattern used for cruise cards at line 475.

**Before:**
```tsx
<DropdownMenuTrigger asChild>
  <Button variant="ghost" size="icon" data-testid={`button-menu-${template.id}`}>
```

**After:**
```tsx
<DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
  <Button variant="ghost" size="icon" data-testid={`button-menu-${template.id}`}>
```

### Step 3: Add stopPropagation to dropdown menu items

Each `DropdownMenuItem` that performs an action (duplicate, delete) should call `e.stopPropagation()` to prevent the card's onClick from also firing. The `Link`-based items (Edit, Preview) already navigate, so their propagation behavior is acceptable but should still be stopped for consistency.

**Lines to modify:** 653 (duplicate), 661 (delete)

```tsx
<DropdownMenuItem
  onClick={(e) => { e.stopPropagation(); duplicateMutation.mutate(template.id); }}
  className="flex items-center gap-2"
>
```

```tsx
<DropdownMenuItem
  onClick={(e) => { e.stopPropagation(); setDeleteTemplateId(template.id); }}
  className="flex items-center gap-2 text-destructive"
>
```

## Data Flow

```
User clicks template card
  -> Card onClick fires
  -> setLocation(`/admin/builder/${template.id}`) called
  -> Wouter routes to FormBuilder component
  -> FormBuilder loads template via useQuery(["/api/templates", id])
  -> Template data renders in editor

User clicks dropdown menu on template card
  -> e.stopPropagation() prevents Card onClick
  -> Dropdown opens normally
  -> Menu item actions work as before
```

## Annotations

- **Pattern Reference**: This mirrors the exact pattern used for cruise cards at lines 458-504
- **No API changes needed**: Navigation is purely client-side
- **No state changes**: The dropdown menu items continue to work as before
- **Accessibility**: The `cursor-pointer` class gives visual affordance that the card is clickable
- **Test IDs**: Existing test IDs on dropdown items remain unchanged

## Verification

1. Click a template card -> should navigate to `/admin/builder/:id`
2. Click the 3-dot menu -> dropdown should open (card should NOT navigate)
3. Click "Duplicate" in dropdown -> template duplicated (card should NOT navigate)
4. Click "Delete" in dropdown -> delete dialog opens (card should NOT navigate)
5. Verify cruise card click behavior is unchanged
