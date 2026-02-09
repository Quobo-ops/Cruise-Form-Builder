# 12: Quick Inline Actions on Cards

> **Status: Implemented**

## Issue

Currently, actions on cruise and template cards require opening a dropdown menu (3-dot button). This adds an extra click for every action. Common actions like "Copy Link", "Preview", and status indicators should be visible directly on the card surface.

**Current flow (template card):**
1. Find the template card
2. Click the 3-dot menu button
3. Wait for dropdown to open
4. Click the desired action (Edit, Preview, Duplicate, Delete)
5. Dropdown closes

That's 2 clicks minimum for any action. For frequent actions like "Copy Link" on cruise cards, this friction adds up.

**Current flow (cruise card):**
1. Click 3-dot menu
2. Click "Copy Link" or "View Details"

## Affected Files

| File | Path | Role |
|------|------|------|
| Admin Dashboard | `client/src/pages/admin-dashboard.tsx` | Cruise cards (457-524), Template cards (624-680) |

## Solution

### Approach: Surface primary actions on cards, keep secondary actions in dropdown

**Primary actions** (shown directly on card): Most frequent actions users perform.
**Secondary actions** (kept in dropdown): Less frequent or destructive actions.

### Step 1: Redesign Cruise Card Layout

Replace the current cruise card (lines 457-524) with a card that surfaces key actions:

```tsx
<Card
  key={cruise.id}
  className="hover-elevate cursor-pointer group"
  onClick={() => setLocation(`/admin/cruises/${cruise.id}`)}
>
  <CardHeader className="pb-3">
    <div className="flex items-start justify-between gap-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <CardTitle className="text-lg truncate">{cruise.name}</CardTitle>
          {cruise.unviewedCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              {cruise.unviewedCount} new
            </Badge>
          )}
        </div>
        <CardDescription className="mt-1 truncate">
          {cruise.description || getTemplateName(cruise.templateId)}
        </CardDescription>
      </div>
      {/* Keep dropdown for secondary actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
            <MoreVertical className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setDeleteCruiseId(cruise.id); }} className="flex items-center gap-2 text-destructive">
            <Trash2 className="w-4 h-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </CardHeader>
  <CardContent>
    <div className="flex items-center gap-4 flex-wrap text-sm text-muted-foreground mb-3">
      <div className="flex items-center gap-1">
        <Users className="w-4 h-4" />
        {cruise.submissionCount} signups
      </div>
      {cruise.isPublished ? (
        <Badge variant="default" className="bg-green-600">Published</Badge>
      ) : (
        <Badge variant="secondary">Draft</Badge>
      )}
      {!cruise.isActive && (
        <Badge variant="outline">Inactive</Badge>
      )}
    </div>
    {/* Inline quick actions */}
    <div className="flex items-center gap-2 pt-2 border-t" onClick={(e) => e.stopPropagation()}>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs gap-1.5"
        onClick={() => copyCruiseLink(cruise.shareId)}
      >
        <ExternalLink className="w-3 h-3" />
        Copy Link
      </Button>
      {cruise.startDate && (
        <span className="text-xs text-muted-foreground ml-auto">
          {new Date(cruise.startDate).toLocaleDateString()}
        </span>
      )}
    </div>
  </CardContent>
</Card>
```

**Key changes:**
- 3-dot menu only appears on hover (`opacity-0 group-hover:opacity-100`)
- "Copy Link" is a visible button at the bottom of the card
- Dropdown only contains "Delete" (the rare/destructive action)
- "View Details" removed from dropdown (clicking card does this)
- Date shown inline if available

### Step 2: Redesign Template Card Layout

Replace template cards (lines 624-680):

```tsx
<Card
  key={template.id}
  className="hover-elevate cursor-pointer group"
  onClick={() => setLocation(`/admin/builder/${template.id}`)}
  tabIndex={0}
  role="link"
>
  <CardHeader className="pb-3">
    <div className="flex items-start justify-between gap-2">
      <div className="flex-1 min-w-0">
        <CardTitle className="text-lg truncate">{template.name}</CardTitle>
        <CardDescription className="mt-1">
          {Object.keys(template.graph?.steps || {}).length} steps
        </CardDescription>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
            <MoreVertical className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={(e) => { e.stopPropagation(); duplicateMutation.mutate(template.id); }}
            className="flex items-center gap-2"
          >
            <Copy className="w-4 h-4" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={(e) => { e.stopPropagation(); setDeleteTemplateId(template.id); }}
            className="flex items-center gap-2 text-destructive"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </CardHeader>
  <CardContent>
    <div className="flex items-center gap-2 mb-3">
      <Badge variant="secondary">
        {template.cruiseCount || 0} {template.cruiseCount === 1 ? 'cruise' : 'cruises'}
      </Badge>
      {template.published && (
        <Badge variant="default" className="bg-green-600 text-xs">Published</Badge>
      )}
    </div>
    {/* Inline quick actions */}
    <div className="flex items-center gap-2 pt-2 border-t" onClick={(e) => e.stopPropagation()}>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs gap-1.5"
        onClick={() => setLocation(`/admin/preview/${template.id}`)}
      >
        <Eye className="w-3 h-3" />
        Preview
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs gap-1.5"
        onClick={() => setLocation(`/admin/builder/${template.id}`)}
      >
        <Edit className="w-3 h-3" />
        Edit
      </Button>
    </div>
  </CardContent>
</Card>
```

**Key changes:**
- Card is directly clickable (navigates to builder, from Plan 01)
- "Preview" and "Edit" buttons shown inline at bottom
- "Duplicate" and "Delete" remain in dropdown (less frequent)
- "Published" badge shown if template is published
- 3-dot menu fades in on hover

### Step 3: Touch device support

On touch devices, hover states don't work. The 3-dot menu should always be visible on mobile:

```tsx
<Button
  variant="ghost"
  size="icon"
  className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
>
  <MoreVertical className="w-4 h-4" />
</Button>
```

The `sm:opacity-0 sm:group-hover:opacity-100` means: always visible on mobile (below `sm` breakpoint), hover-reveal on desktop.

### Step 4: Tooltip hints on inline actions

Add tooltips to inline action buttons for clarity:

```tsx
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

<Tooltip>
  <TooltipTrigger asChild>
    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={() => copyCruiseLink(cruise.shareId)}>
      <ExternalLink className="w-3 h-3" />
      Copy Link
    </Button>
  </TooltipTrigger>
  <TooltipContent>Copy shareable form link to clipboard</TooltipContent>
</Tooltip>
```

## Data Flow

```
User sees cruise card:
  -> Card surface shows: name, description, signups count, status badges
  -> Bottom row shows: [Copy Link] button + date
  -> 3-dot menu (visible on hover or always on mobile): [Delete]

User wants to copy link (most common action):
  -> Click "Copy Link" directly on card (1 click, no dropdown)
  -> e.stopPropagation() prevents card navigation
  -> copyCruiseLink() copies to clipboard
  -> Toast shows confirmation

User wants to view details (second most common):
  -> Click anywhere else on card (1 click)
  -> Navigates to cruise detail

User wants to delete (rare action):
  -> Hover card -> 3-dot menu appears
  -> Click menu -> click Delete
  -> Confirmation dialog opens
```

## Annotations

- **Action frequency hierarchy**:
  - View details: most frequent -> full card click
  - Copy link / Preview: frequent -> inline buttons
  - Duplicate: occasional -> dropdown
  - Delete: rare/destructive -> dropdown only
- **stopPropagation pattern**: Inline action buttons must call `e.stopPropagation()` on their parent container to prevent the card's onClick from also firing. The container div wrapping the buttons handles this.
- **Group hover**: Tailwind's `group` class on the card and `group-hover:` on child elements creates the reveal-on-hover effect for the 3-dot menu.
- **Mobile-first**: All inline actions are always visible. Only the 3-dot menu uses hover reveal, and it's always visible below `sm` breakpoint.
- **No API changes**: All actions use existing mutations and functions.
- **Consistent styling**: Using `variant="ghost" size="sm" className="h-7 text-xs"` for inline buttons keeps them visually lightweight and not competing with the card content.

## Verification

1. Cruise card: "Copy Link" button visible at card bottom
2. Click "Copy Link" -> link copied, card does NOT navigate
3. Click anywhere else on card -> navigates to cruise detail
4. Hover cruise card -> 3-dot menu appears (desktop)
5. Mobile: 3-dot menu always visible
6. Template card: "Preview" and "Edit" buttons at bottom
7. Click "Preview" -> navigates to preview (card doesn't navigate to builder)
8. Click "Edit" -> navigates to builder
9. Click card body (not buttons) -> navigates to builder
10. Hover template card -> 3-dot menu with Duplicate/Delete appears
