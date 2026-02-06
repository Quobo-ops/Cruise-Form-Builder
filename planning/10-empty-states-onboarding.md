# 10: Empty States and Onboarding Guidance

## Issue

When a new user logs in for the first time, they see empty lists with minimal guidance. The existing empty states (`admin-dashboard.tsx:527-543` for cruises, `682-699` for templates) show an icon, a brief message, and a create button, but they don't explain the workflow or help the user understand what to do first.

**Current empty states:**
- Cruises: "No cruises yet. Create your first cruise to get started." + "Create Cruise" button
- Templates: "No templates yet. Create your first booking form to get started." + "Create Template" button
- Cruise Detail Inventory: "No inventory items to track." (no action button)
- Cruise Detail Submissions: "No submissions yet." (no action button)
- Landing page (public): Shows nothing when no cruises are published

**Problems:**
1. No guidance on the workflow: "Create a template first, THEN create a cruise using that template"
2. The "Create Cruise" button will fail if no templates exist (template select dropdown will be empty)
3. Inventory empty state doesn't explain WHY there are no items
4. Submissions empty state doesn't tell the admin how to get submissions (share the form link)
5. Public landing with no cruises shows nothing helpful

## Affected Files

| File | Path | Role |
|------|------|------|
| Admin Dashboard | `client/src/pages/admin-dashboard.tsx` | Empty states (lines 527-543, 682-699) |
| Cruise Detail | `client/src/pages/cruise-detail.tsx` | Empty states for tabs (lines 611-614, 702-706) |
| Landing | `client/src/pages/landing.tsx` | Empty state for public page |

## Solution

### Step 1: Cruises empty state - guide to create template first

In `admin-dashboard.tsx`, replace the cruises empty state (lines 527-543):

```tsx
<Card className="bg-muted/30">
  <CardContent className="flex flex-col items-center justify-center py-16">
    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
      <Anchor className="w-8 h-8 text-muted-foreground" />
    </div>
    <h3 className="text-lg font-semibold text-foreground mb-2">No cruises yet</h3>
    {templates && templates.length > 0 ? (
      <>
        <p className="text-muted-foreground text-center mb-4 max-w-md">
          Create your first cruise and link it to one of your form templates to start collecting signups.
        </p>
        <Button onClick={() => setIsCreateCruiseDialogOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Create Cruise
        </Button>
      </>
    ) : (
      <>
        <p className="text-muted-foreground text-center mb-4 max-w-md">
          To create a cruise, you first need a form template. Switch to the Templates tab to create one.
        </p>
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <Button onClick={() => setLocation("/admin/templates")} className="gap-2">
            <ClipboardList className="w-4 h-4" />
            Go to Templates
          </Button>
          <span className="text-xs text-muted-foreground">Step 1 of 2</span>
        </div>
      </>
    )}
  </CardContent>
</Card>
```

### Step 2: Templates empty state - explain the workflow

In `admin-dashboard.tsx`, replace the templates empty state (lines 682-699):

```tsx
<Card className="bg-muted/30">
  <CardContent className="flex flex-col items-center justify-center py-16">
    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
      <ClipboardList className="w-8 h-8 text-muted-foreground" />
    </div>
    <h3 className="text-lg font-semibold text-foreground mb-2">No templates yet</h3>
    <p className="text-muted-foreground text-center mb-6 max-w-md">
      Templates are the booking forms your customers fill out. Create a template, then attach it to a cruise to start collecting signups.
    </p>
    <div className="flex flex-col items-center gap-4">
      <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
        <Plus className="w-4 h-4" />
        Create Your First Template
      </Button>
      <div className="flex items-center gap-6 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold">1</div>
          Create template
        </div>
        <ChevronRight className="w-3 h-3" />
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[10px] font-bold">2</div>
          Create cruise
        </div>
        <ChevronRight className="w-3 h-3" />
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[10px] font-bold">3</div>
          Share link
        </div>
      </div>
    </div>
  </CardContent>
</Card>
```

### Step 3: Inventory empty state - explain context

In `cruise-detail.tsx`, replace the inventory empty state (lines 611-614):

```tsx
<div className="py-8 text-center">
  <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
  <h4 className="font-medium mb-2">No inventory items to track</h4>
  <p className="text-sm text-muted-foreground max-w-md mx-auto">
    Inventory tracking appears when your form template includes "quantity" type steps with items that have prices.
    Edit the form template to add quantity steps.
  </p>
  {template && (
    <Button
      variant="outline"
      className="mt-4 gap-2"
      onClick={() => setLocation(`/admin/builder/${template.id}`)}
    >
      <Edit className="w-4 h-4" />
      Edit Form Template
    </Button>
  )}
</div>
```

### Step 4: Submissions empty state - show how to get submissions

In `cruise-detail.tsx`, replace the submissions empty state (lines 702-706):

```tsx
<div className="text-center py-8">
  <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
  <h4 className="font-medium mb-2">No submissions yet</h4>
  <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
    Share the form link with your customers to start collecting signups.
    {!cruise.isPublished && (
      <span className="block mt-2 text-orange-500 font-medium">
        This cruise is not published yet. Publish it to make the form accessible.
      </span>
    )}
  </p>
  <div className="flex items-center justify-center gap-3">
    <Button variant="outline" className="gap-2" onClick={copyShareLink}>
      <Copy className="w-4 h-4" />
      Copy Form Link
    </Button>
    {!cruise.isPublished && (
      <Button className="gap-2" onClick={startEditing}>
        <Edit className="w-4 h-4" />
        Edit & Publish
      </Button>
    )}
  </div>
</div>
```

### Step 5: Public landing empty state

In `landing.tsx`, when no published cruises exist, show a friendly message instead of nothing:

```tsx
// After the loading state, when cruises is empty:
{cruises && cruises.length === 0 && (
  <div className="text-center py-20">
    <Ship className="w-16 h-16 text-muted-foreground mx-auto mb-6" />
    <h2 className="text-2xl font-bold mb-2">No Cruises Available</h2>
    <p className="text-muted-foreground max-w-md mx-auto">
      There are currently no cruises accepting bookings.
      Check back soon for upcoming cruise opportunities.
    </p>
  </div>
)}
```

### Step 6: First-time welcome banner (optional enhancement)

Add a dismissible welcome banner for first-time admin users:

```tsx
// In admin-dashboard.tsx, check localStorage for seen flag
const [showWelcome, setShowWelcome] = useState(
  !localStorage.getItem("cruisebook-welcome-dismissed")
);

const dismissWelcome = () => {
  localStorage.setItem("cruisebook-welcome-dismissed", "true");
  setShowWelcome(false);
};

// Render above the tab content:
{showWelcome && (
  <Card className="mb-6 border-primary/30 bg-primary/5">
    <CardContent className="py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold mb-1">Welcome to CruiseBook</h3>
          <p className="text-sm text-muted-foreground">
            Get started by creating a form template, then create a cruise and share the booking link with your customers.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={dismissWelcome}>
          Dismiss
        </Button>
      </div>
    </CardContent>
  </Card>
)}
```

## Data Flow

```
New admin logs in -> Dashboard loads
  -> templates query returns []
  -> cruises query returns []

Cruises tab (default):
  -> Empty state checks templates.length
  -> If 0 templates: "Create a template first" with link to Templates tab
  -> If templates exist: "Create your first cruise" with Create button

Templates tab:
  -> Empty state shows workflow: Template -> Cruise -> Share
  -> "Create Your First Template" button

After creating template -> navigated to builder
  -> User builds form, returns to dashboard
  -> Cruises tab now shows "Create cruise" (template exists)

After creating cruise -> navigated to cruise detail
  -> Inventory tab: explains quantity steps needed
  -> Clients tab: "Share form link" with copy button
  -> Shows unpublished warning if applicable
```

## Annotations

- **Conditional guidance**: The cruises empty state dynamically checks if templates exist, preventing a dead-end where the user clicks "Create Cruise" but can't select a template.
- **Visual workflow indicator**: The 1-2-3 step indicator in the templates empty state gives a clear overview of the entire onboarding flow.
- **Actionable empty states**: Every empty state includes at least one action button that moves the user forward in the workflow.
- **No new API calls**: All data needed for the empty states is already fetched (templates, cruises, cruise detail data).
- **Welcome banner persistence**: Uses localStorage so it only shows once. Dismissal is permanent.
- **ChevronRight import**: Need to add `ChevronRight` to the lucide-react import at line 37 of `admin-dashboard.tsx`.

## Verification

1. Fresh login (no templates, no cruises):
   - Cruises tab shows "Create a template first" with link
   - Templates tab shows workflow with "Create Your First Template"
   - Welcome banner appears
2. After creating 1 template:
   - Cruises tab shows "Create your first cruise" with Create button
   - Templates tab shows the template card
3. After creating 1 cruise (unpublished):
   - Cruise detail Inventory tab explains quantity steps
   - Cruise detail Clients tab shows "Share form link" + "not published" warning
4. After publishing cruise:
   - Clients tab shows "Share form link" (no warning)
   - Public landing shows the cruise
5. Dismiss welcome banner -> refresh -> banner stays dismissed
6. Public landing with no cruises: shows friendly "No Cruises Available" message
