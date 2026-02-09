# 07: Search and Filter State Persistence

> **Status: Implemented**

## Issue

The admin dashboard uses a single `searchTerm` state variable (line 53 of `admin-dashboard.tsx`) that is:

1. **Shared across tabs**: The same search term applies to both Cruises and Templates tabs. Searching for "caribbean" on the Cruises tab, then switching to Templates, applies "caribbean" to templates -- confusing behavior.

2. **Lost on navigation**: Navigating from the dashboard to a cruise detail page and then pressing Back loses the search term entirely since `searchTerm` is local component state (`useState("")`).

3. **No URL persistence**: The search term is not reflected in the URL, so it can't be bookmarked or shared.

## Affected Files

| File | Path | Role |
|------|------|------|
| Admin Dashboard | `client/src/pages/admin-dashboard.tsx` | Search state (line 53), filtering (lines 222-228) |

## Solution

### Step 1: Separate search state per tab

Replace the single `searchTerm` with per-tab search states:

**Before (line 53):**
```tsx
const [searchTerm, setSearchTerm] = useState("");
```

**After:**
```tsx
const [cruiseSearchTerm, setCruiseSearchTerm] = useState("");
const [templateSearchTerm, setTemplateSearchTerm] = useState("");
```

### Step 2: Use the correct search term per tab

**Before (lines 222-228):**
```tsx
const filteredTemplates = templates?.filter((t) =>
  t.name.toLowerCase().includes(searchTerm.toLowerCase())
);
const filteredCruises = cruises?.filter((c) =>
  c.name.toLowerCase().includes(searchTerm.toLowerCase())
);
```

**After:**
```tsx
const filteredTemplates = templates?.filter((t) =>
  t.name.toLowerCase().includes(templateSearchTerm.toLowerCase())
);
const filteredCruises = cruises?.filter((c) =>
  c.name.toLowerCase().includes(cruiseSearchTerm.toLowerCase())
);
```

### Step 3: Update search inputs per tab

**Cruises tab search (lines 431-437):**
```tsx
<Input
  placeholder="Search cruises..."
  value={cruiseSearchTerm}
  onChange={(e) => setCruiseSearchTerm(e.target.value)}
  className="pl-10"
  data-testid="input-search-cruises"
/>
```

**Templates tab search (lines 598-604):**
```tsx
<Input
  placeholder="Search templates..."
  value={templateSearchTerm}
  onChange={(e) => setTemplateSearchTerm(e.target.value)}
  className="pl-10"
  data-testid="input-search-templates"
/>
```

### Step 4: Persist search term in URL query parameters

Use URL search params to preserve search state across navigation:

```tsx
// Read initial state from URL
const urlParams = new URLSearchParams(window.location.search);
const [cruiseSearchTerm, setCruiseSearchTerm] = useState(urlParams.get("cq") || "");
const [templateSearchTerm, setTemplateSearchTerm] = useState(urlParams.get("tq") || "");

// Sync search term changes to URL (debounced to avoid excessive history entries)
const updateUrlRef = useRef<NodeJS.Timeout | null>(null);

useEffect(() => {
  if (updateUrlRef.current) clearTimeout(updateUrlRef.current);
  updateUrlRef.current = setTimeout(() => {
    const params = new URLSearchParams();
    if (activeTab === "cruises" && cruiseSearchTerm) {
      params.set("cq", cruiseSearchTerm);
    }
    if (activeTab === "templates" && templateSearchTerm) {
      params.set("tq", templateSearchTerm);
    }
    const query = params.toString();
    const newUrl = `${window.location.pathname}${query ? `?${query}` : ""}`;
    window.history.replaceState(null, "", newUrl);
  }, 300);
}, [cruiseSearchTerm, templateSearchTerm, activeTab]);
```

### Step 5: Clear search on tab switch (optional UX choice)

Two valid approaches -- pick one:

**Option A: Clear search when switching tabs** (simpler)
```tsx
// In tab buttons
<Button onClick={() => {
  setLocation("/admin/cruises");
  // Don't clear -- search is already per-tab
}}>
```

**Option B: Preserve both searches independently** (recommended)
Both searches persist. When switching tabs, the other tab's search is still there. This is the approach taken in Steps 1-4 above.

### Step 6: Add clear button to search inputs

Add an "X" clear button when search has content:

```tsx
<div className="relative max-w-sm">
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
  <Input
    placeholder="Search cruises..."
    value={cruiseSearchTerm}
    onChange={(e) => setCruiseSearchTerm(e.target.value)}
    className="pl-10 pr-8"
    data-testid="input-search-cruises"
  />
  {cruiseSearchTerm && (
    <button
      onClick={() => setCruiseSearchTerm("")}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      aria-label="Clear search"
    >
      <X className="w-4 h-4" />
    </button>
  )}
</div>
```

## Data Flow

```
User on Cruises tab, types "caribbean"
  -> cruiseSearchTerm = "caribbean"
  -> URL becomes /admin/cruises?cq=caribbean
  -> filteredCruises filters by "caribbean"

User switches to Templates tab
  -> templateSearchTerm is "" (or whatever was previously set)
  -> filteredTemplates shows all templates (no carryover from cruise search)
  -> URL becomes /admin/templates?tq= (or no param if empty)

User navigates to cruise detail, then clicks Back
  -> Browser navigates to /admin/cruises?cq=caribbean (via browser history)
  -> AdminDashboard reads cq from URL
  -> cruiseSearchTerm = "caribbean" (restored!)
  -> Results filtered correctly

User clears search with X button
  -> cruiseSearchTerm = ""
  -> URL becomes /admin/cruises (no params)
  -> All cruises shown
```

## Annotations

- **`replaceState` vs `pushState`**: Using `replaceState` avoids polluting browser history with every keystroke. The URL updates silently for bookmark/share purposes.
- **Debounced URL update**: The 300ms debounce prevents excessive URL updates while typing. The state itself updates immediately (no debounce on the filter).
- **No API changes**: Search is done client-side on already-fetched data. The server does support paginated search (`req.query.search` at routes.ts:440), but the dashboard currently fetches all and filters locally. This plan doesn't change that approach.
- **URL params are short**: `cq` for cruise query, `tq` for template query. Keeps URLs clean.
- **Empty state messages already handle search**: Lines 534 and 690 already show "No cruises/templates match your search" when `searchTerm` is set.

## Verification

1. Search for "caribbean" on Cruises tab -> results filtered
2. Switch to Templates tab -> search is empty, all templates shown
3. Search for "booking" on Templates tab -> results filtered
4. Switch back to Cruises tab -> "caribbean" still shown
5. Navigate to a cruise detail -> press browser Back -> search "caribbean" preserved
6. Refresh the page with ?cq=caribbean -> search restored
7. Click X clear button -> search cleared, URL updated
8. Empty state shows correct message when search yields no results
