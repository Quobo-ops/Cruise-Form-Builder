# 14: Audit Log Viewer

## Issue

The application already records audit events for every significant admin action (template create/update/delete, cruise create/update/delete, submission export, login/logout). The `audit_logs` table stores userId, action, entityType, entityId, details (JSONB), ipAddress, and timestamp. A paginated `GET /api/audit-logs` endpoint exists in the server.

However, there is **no UI to view these logs**. The data is invisible to admins. This means:

1. No way to investigate who deleted a template or cruise
2. No way to audit submission exports for compliance
3. No way to detect suspicious login activity
4. No way to trace changes if something goes wrong

The backend is 100% ready -- this plan is purely a frontend addition.

## Affected Files

| File | Path | Role |
|------|------|------|
| Admin Dashboard | `client/src/pages/admin-dashboard.tsx` | Add "Audit Log" tab or navigation link |
| New Page | `client/src/pages/audit-log.tsx` | Audit log viewer page (new) |
| App Router | `client/src/App.tsx` | Add route for `/admin/audit-log` |
| Breadcrumbs | `client/src/components/breadcrumbs.tsx` | Add breadcrumb entry for audit log |

## Solution

### Step 1: Create the Audit Log page

Create `client/src/pages/audit-log.tsx` with a paginated table displaying audit events.

```tsx
export default function AuditLog() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    action: "",      // e.g. "template.create", "cruise.delete"
    entityType: "",  // e.g. "template", "cruise", "submission"
  });

  const { data, isLoading } = useQuery({
    queryKey: ["/api/audit-logs", { page, limit: 50, ...filters }],
  });
```

### Step 2: Table columns

Display the following columns:

| Column | Source | Format |
|--------|--------|--------|
| Timestamp | `createdAt` | Relative time (e.g. "2 hours ago") with tooltip showing full date |
| Action | `action` | Badge with color coding (create=green, update=blue, delete=red, export=purple) |
| Entity | `entityType` + `entityId` | Clickable link to the entity (e.g. cruise detail, template builder) |
| User | `userId` | Username lookup (join or separate query) |
| IP Address | `ipAddress` | Displayed as-is |
| Details | `details` | Expandable JSON viewer or key-value summary |

### Step 3: Action color mapping

```tsx
const actionColors: Record<string, string> = {
  "create": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  "update": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  "delete": "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  "export": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  "login":  "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

// Extract verb from action string like "template.create" -> "create"
const verb = auditEntry.action.split(".").pop();
```

### Step 4: Filters

Add filter controls above the table:

```tsx
<div className="flex gap-2 mb-4">
  <Select value={filters.entityType} onValueChange={v => setFilters(f => ({ ...f, entityType: v }))}>
    <SelectItem value="">All Entities</SelectItem>
    <SelectItem value="template">Templates</SelectItem>
    <SelectItem value="cruise">Cruises</SelectItem>
    <SelectItem value="submission">Submissions</SelectItem>
    <SelectItem value="auth">Authentication</SelectItem>
  </Select>

  <Select value={filters.action} onValueChange={v => setFilters(f => ({ ...f, action: v }))}>
    <SelectItem value="">All Actions</SelectItem>
    <SelectItem value="create">Created</SelectItem>
    <SelectItem value="update">Updated</SelectItem>
    <SelectItem value="delete">Deleted</SelectItem>
    <SelectItem value="export">Exported</SelectItem>
  </Select>
</div>
```

### Step 5: Update the server endpoint to support filters

The existing `GET /api/audit-logs` endpoint uses `PaginationParams` (page, limit, search). Extend it to accept `entityType` and `action` query parameters:

```typescript
// In routes.ts, update the audit-logs GET handler:
app.get("/api/audit-logs", requireAuth, async (req, res) => {
  const params = {
    page: parseInt(req.query.page as string) || 1,
    limit: parseInt(req.query.limit as string) || 50,
    search: req.query.search as string,
  };
  const entityType = req.query.entityType as string;
  const action = req.query.action as string;

  // Pass filters to storage method
  const result = await storage.getAuditLogs(params, { entityType, action });
  res.json(result);
});
```

Update `storage.ts` `getAuditLogs` to apply WHERE clauses for entityType and action filters.

### Step 6: Add route and navigation

In `App.tsx`, add the route:
```tsx
<Route path="/admin/audit-log" component={AuditLog} />
```

In the admin dashboard, add a link/button to navigate to the audit log:
```tsx
<Button variant="ghost" onClick={() => setLocation("/admin/audit-log")} className="gap-2">
  <Shield className="w-4 h-4" />
  Audit Log
</Button>
```

### Step 7: Entity links

Make entity references clickable to navigate to the relevant page:

```tsx
function entityLink(entityType: string, entityId: string): string | null {
  switch (entityType) {
    case "template": return `/admin/builder/${entityId}`;
    case "cruise": return `/admin/cruises/${entityId}`;
    default: return null;
  }
}
```

## Data Flow

```
Admin clicks "Audit Log" in dashboard
  -> Navigates to /admin/audit-log
  -> GET /api/audit-logs?page=1&limit=50
  -> Server queries audit_logs table with pagination
  -> Returns paginated list of audit entries
  -> UI renders table with action badges, entity links, timestamps

Admin applies filter (e.g. entityType=cruise)
  -> GET /api/audit-logs?page=1&limit=50&entityType=cruise
  -> Server adds WHERE clause: entity_type = 'cruise'
  -> Returns filtered results

Admin clicks entity link (e.g. cruise ID)
  -> Navigates to /admin/cruises/:id
```

## Annotations

- **No new dependencies**: Uses existing Shadcn Table, Select, Badge components. No new packages needed.
- **Backend already complete**: The `audit_logs` table, `createAuditLog` helper, and `getAuditLogs` query all exist. This is purely a frontend task plus minor filter support on the existing endpoint.
- **Existing audit events**: The `audit()` helper in routes.ts is already called for template CRUD, cruise CRUD, submission exports, and login events. No new audit points needed.
- **Performance**: The audit_logs table will grow over time. Consider adding a database index on `created_at` and `entity_type` if not already present. The existing paginated query limits exposure.
- **Access control**: The endpoint already uses `requireAuth`. In a future RBAC system (Plan 17), this should be restricted to admin-role users only.

## Verification

1. Navigate to /admin/audit-log -> paginated table of events loads
2. Filter by entity type "cruise" -> only cruise-related events shown
3. Filter by action "delete" -> only delete events shown
4. Click an entity link -> navigates to the correct detail page
5. Pagination controls work (next/prev/page numbers)
6. Timestamps show relative time with full date on hover
7. Action badges are color-coded correctly
8. Page is mobile-responsive (table scrolls horizontally on small screens)
9. Empty state shown when no audit events match filters
10. Back button returns to admin dashboard
