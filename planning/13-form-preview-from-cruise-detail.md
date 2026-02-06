# 13: Form Preview from Cruise Detail

## Issue

When an admin is on the Cruise Detail page (`cruise-detail.tsx`), there is no way to preview or test the form that is attached to the cruise. To preview the form, the admin must:

1. Note the template ID
2. Navigate back to the dashboard
3. Switch to the Templates tab
4. Find the template
5. Open its dropdown menu
6. Click "Preview"

This is a 6-step process for a very common task. Admins frequently want to see what their customers will see when filling out the form.

Additionally, the current preview (`/admin/preview/:id`) previews the template in isolation -- it doesn't show cruise-specific data like inventory stock limits or the cruise name in the header.

## Affected Files

| File | Path | Role |
|------|------|------|
| Cruise Detail | `client/src/pages/cruise-detail.tsx` | Add preview button/link |
| Form Preview | `client/src/pages/form-preview.tsx` | Support cruise context |
| App Router | `client/src/App.tsx` | New route for cruise-scoped preview |
| Server Routes | `server/routes.ts` | Optional: cruise-scoped preview endpoint |

## Solution

### Step 1: Add "Preview Form" button to Cruise Detail header

In `cruise-detail.tsx`, add a button in the header action bar (lines 374-384):

```tsx
<div className="flex items-center gap-2 flex-wrap">
  <ThemeToggle />
  {/* NEW: Preview Form button */}
  <Button
    variant="outline"
    className="gap-2"
    onClick={() => setLocation(`/admin/preview/${cruise.templateId}?cruise=${cruise.id}`)}
    data-testid="button-preview-form"
  >
    <Eye className="w-4 h-4" />
    <span className="hidden sm:inline">Preview Form</span>
  </Button>
  <Button variant="outline" onClick={copyShareLink} className="gap-2" data-testid="button-copy-link">
    <Copy className="w-4 h-4" />
    <span className="hidden sm:inline">Copy Link</span>
  </Button>
  <Button variant="outline" onClick={startEditing} className="gap-2" data-testid="button-edit-cruise">
    <Edit className="w-4 h-4" />
    <span className="hidden sm:inline">Edit</span>
  </Button>
</div>
```

Import `Eye` from lucide-react (add to existing import at line 37).

### Step 2: Add "Edit Template" button to Cruise Detail

While we're adding buttons, also add a way to jump to the form builder directly from the cruise detail:

```tsx
<Button
  variant="outline"
  className="gap-2"
  onClick={() => setLocation(`/admin/builder/${cruise.templateId}?from=cruise-${cruise.id}`)}
  data-testid="button-edit-template"
>
  <ClipboardEdit className="w-4 h-4" />
  <span className="hidden sm:inline">Edit Form</span>
</Button>
```

This uses the `?from=cruise-${id}` pattern from Plan 02 so the builder's Back button returns to this cruise detail page.

### Step 3: Update Form Preview to support cruise context

In `form-preview.tsx`, read the optional `cruise` query parameter:

```tsx
export default function FormPreview() {
  const { id } = useParams<{ id: string }>();
  // Read cruise context from query params
  const searchParams = new URLSearchParams(window.location.search);
  const cruiseId = searchParams.get("cruise");

  // Fetch template (existing)
  const { data: template, isLoading } = useQuery<Template>({
    queryKey: ["/api/templates", id],
    enabled: isAuthenticated,
  });

  // Fetch cruise data if cruiseId is provided
  const { data: cruise } = useQuery<CruiseWithCounts>({
    queryKey: ["/api/cruises", cruiseId],
    enabled: !!cruiseId && isAuthenticated,
  });

  // Fetch cruise inventory if cruiseId is provided
  const { data: inventory } = useQuery<CruiseInventory[]>({
    queryKey: ["/api/cruises", cruiseId, "inventory"],
    enabled: !!cruiseId && isAuthenticated,
  });
```

### Step 4: Show cruise context in preview header

When previewed in cruise context, show the cruise name and inventory info:

```tsx
{cruise && (
  <div className="bg-primary/5 border border-primary/20 rounded-md px-4 py-2 mb-4">
    <div className="flex items-center gap-2 text-sm">
      <Ship className="w-4 h-4 text-primary" />
      <span className="font-medium">Previewing for cruise: {cruise.name}</span>
      {inventory && inventory.length > 0 && (
        <Badge variant="outline" className="ml-2">
          {inventory.length} tracked items
        </Badge>
      )}
    </div>
  </div>
)}
```

### Step 5: Apply inventory constraints in preview

When viewing in cruise context, the preview form should show stock availability just like the public form would (from Plan 06):

```tsx
// Pass inventory data to the form rendering component
// For quantity steps, show remaining stock:
{inventoryItem && (
  <span className="text-xs text-muted-foreground">
    {inventoryItem.stockLimit
      ? `${Math.max(0, inventoryItem.stockLimit - inventoryItem.totalOrdered)} remaining`
      : "Unlimited"}
  </span>
)}
```

### Step 6: Update preview back button

The preview page's back button should return to the correct context:

```tsx
const backHref = cruiseId
  ? `/admin/cruises/${cruiseId}`    // Back to cruise detail
  : `/admin/builder/${id}`;         // Back to form builder

<Link href={backHref} className="flex items-center gap-2 text-muted-foreground">
  <ArrowLeft className="w-4 h-4" />
  <span className="hidden sm:inline">
    {cruiseId ? "Back to Cruise" : "Back to Builder"}
  </span>
</Link>
```

### Step 7: Add "Open Public Form" link

In addition to the admin preview, add a link to open the actual public form URL (so the admin can see exactly what customers see):

```tsx
{cruise && (
  <Button
    variant="ghost"
    size="sm"
    className="gap-2"
    onClick={() => window.open(`/form/${cruise.shareId}`, "_blank")}
    data-testid="button-open-public-form"
  >
    <ExternalLink className="w-4 h-4" />
    Open Public Form
  </Button>
)}
```

### Step 8: Add route for cruise-scoped preview (optional)

Optionally, add a dedicated route for cruise-scoped preview:

In `App.tsx`:
```tsx
<Route path="/admin/cruises/:cruiseId/preview" component={FormPreview} />
```

This is cleaner than query params but requires `FormPreview` to handle both URL patterns. The query param approach from Steps 1-6 is simpler and doesn't require a new route.

## Data Flow

```
Admin on Cruise Detail page (/admin/cruises/:id)
  -> Clicks "Preview Form"
  -> Navigates to /admin/preview/:templateId?cruise=:cruiseId
  -> FormPreview loads
  -> Reads cruiseId from query params
  -> Fetches template (existing) + cruise data + inventory
  -> Renders form preview with:
     - Cruise name banner at top
     - Inventory stock indicators on quantity steps
     - "Open Public Form" link
  -> Back button returns to /admin/cruises/:cruiseId

Admin on Cruise Detail page
  -> Clicks "Edit Form"
  -> Navigates to /admin/builder/:templateId?from=cruise-:cruiseId
  -> FormBuilder opens with breadcrumbs showing cruise context
  -> Back button returns to /admin/cruises/:cruiseId (from Plan 02)
```

## Annotations

- **Query param approach**: Using `?cruise=:id` is simpler than creating a new route and doesn't require changes to `App.tsx`. The preview component reads the param and conditionally fetches cruise data.
- **Existing preview preserved**: Without the `?cruise=` param, the preview works exactly as before (template-only preview). This is backward compatible.
- **Inventory in preview**: Shows real stock data so the admin can see how the form will look with current inventory. Quantity items at 0 stock will show as sold out.
- **"Open Public Form" link**: Opens in a new tab so the admin can see the exact customer experience (including any learn-more page, draft persistence, etc.) without leaving the admin context.
- **Import additions needed**:
  - `cruise-detail.tsx`: Add `Eye` to the lucide imports at line 37
  - `form-preview.tsx`: Add `Ship`, `ExternalLink` imports, add `CruiseInventory` type import
- **No API changes needed**: All data is already available via existing endpoints (`GET /api/cruises/:id`, `GET /api/cruises/:id/inventory`, `GET /api/templates/:id`).

## Verification

1. Cruise Detail: "Preview Form" button visible in header
2. Click "Preview Form" -> preview page opens with cruise name banner
3. Preview shows stock/inventory on quantity steps
4. Back button in preview -> returns to cruise detail
5. "Edit Form" button -> opens form builder with cruise context breadcrumbs
6. Back button in builder -> returns to cruise detail (Plan 02)
7. "Open Public Form" -> opens public form URL in new tab
8. Template-only preview (no cruise param) -> works as before
9. Preview without cruise context: no inventory, no cruise banner
10. Mobile: buttons show icons only, labels hidden on small screens
