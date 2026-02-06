# 05: Submission Viewed-Status Tracking

## Issue

The `isViewed` field exists on the submissions table (`shared/schema.ts:140`) and the dashboard shows "X new" badges on cruise cards (`admin-dashboard.tsx:464-468`), but the marking-as-viewed behavior is incomplete:

1. **Bulk marking on page load**: `server/routes.ts:627` marks ALL submissions as viewed when the submissions list is loaded (`storage.markSubmissionsViewed(cruiseId)`). This means simply loading the Clients tab marks everything as read, even if the user didn't look at individual submissions.

2. **No per-submission marking**: There's no API call when a user opens a specific submission in the side sheet (`cruise-detail.tsx:637`). Opening a submission should mark that specific submission as viewed.

3. **No visual distinction**: The submissions list doesn't visually differentiate between viewed and unviewed submissions.

4. **Badge count resets too aggressively**: Because `markSubmissionsViewed` runs on every list fetch, the "X new" badge on cruise cards resets to 0 even if the user just glanced at the tab.

## Affected Files

| File | Path | Role |
|------|------|------|
| Server Routes | `server/routes.ts` | Submission fetch + mark viewed (lines 619-633) |
| Storage | `server/storage.ts` | `markSubmissionsViewed()` method |
| Schema | `shared/schema.ts` | `isViewed` field on submissions (line 140) |
| Cruise Detail | `client/src/pages/cruise-detail.tsx` | Submission list + detail sheet (lines 629-710) |
| Admin Dashboard | `client/src/pages/admin-dashboard.tsx` | "X new" badge (lines 464-468) |

## Solution

### Step 1: Add per-submission mark-as-viewed API endpoint

In `server/routes.ts`, add a new endpoint:

```typescript
// Mark a single submission as viewed
app.patch("/api/submissions/:id/viewed", requireAuth, async (req, res) => {
  try {
    const submission = await storage.markSubmissionViewed(req.params.id);
    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Mark submission viewed error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
```

### Step 2: Add storage method for single submission

In `server/storage.ts`, add:

```typescript
async markSubmissionViewed(submissionId: string): Promise<Submission | undefined> {
  const [result] = await db
    .update(submissions)
    .set({ isViewed: true })
    .where(eq(submissions.id, submissionId))
    .returning();
  return result;
}
```

### Step 3: Remove aggressive bulk marking from list fetch

In `server/routes.ts` line 627, remove or conditionally skip the bulk mark:

**Before:**
```typescript
const result = await storage.getSubmissionsByCruisePaginated(req.params.id, { page, limit, search });
// Mark as viewed
await storage.markSubmissionsViewed(req.params.id);
res.json(result);
```

**After:**
```typescript
const result = await storage.getSubmissionsByCruisePaginated(req.params.id, { page, limit, search });
// Don't auto-mark all as viewed; let client mark individually
res.json(result);
```

### Step 4: Include `isViewed` in submission list response

Ensure the paginated submissions response includes `isViewed` so the client can render differently. Check `storage.getSubmissionsByCruisePaginated` returns this field -- it should already since it's on the table.

### Step 5: Call mark-as-viewed when opening submission detail

In `cruise-detail.tsx`, when a submission is selected for the side sheet, call the API:

```tsx
const markViewedMutation = useMutation({
  mutationFn: async (submissionId: string) => {
    return await apiRequest("PATCH", `/api/submissions/${submissionId}/viewed`);
  },
  onSuccess: () => {
    // Invalidate to refresh badge counts
    queryClient.invalidateQueries({ queryKey: ["/api/cruises", id] });
    queryClient.invalidateQueries({ queryKey: ["/api/cruises", id, "submissions"] });
    queryClient.invalidateQueries({ queryKey: ["/api/cruises"] });
  },
});

// When selecting a submission:
const handleSelectSubmission = (submission: Submission) => {
  setSelectedSubmission(submission);
  if (!submission.isViewed) {
    markViewedMutation.mutate(submission.id);
  }
};
```

Update the click handlers at lines 637 and 690:

**Before:**
```tsx
onClick={() => setSelectedSubmission(submission)}
```

**After:**
```tsx
onClick={() => handleSelectSubmission(submission)}
```

### Step 6: Visual distinction for unviewed submissions

In `cruise-detail.tsx`, add visual indicators for unviewed submissions:

**Mobile cards (line 634):**
```tsx
<div
  key={submission.id}
  className={`p-4 border rounded-md hover-elevate cursor-pointer ${
    !submission.isViewed ? "border-primary/50 bg-primary/5" : ""
  }`}
  onClick={() => handleSelectSubmission(submission)}
>
  {!submission.isViewed && (
    <div className="w-2 h-2 rounded-full bg-primary absolute top-3 right-3" />
  )}
```

**Desktop table rows (line 676):**
```tsx
<TableRow key={submission.id} className={!submission.isViewed ? "bg-primary/5" : ""}>
  <TableCell className="font-medium">
    <div className="flex items-center gap-2">
      {!submission.isViewed && (
        <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
      )}
      {submission.customerName || "Unknown"}
    </div>
  </TableCell>
```

### Step 7: Add "Mark All as Read" button

Add a bulk action button in the Clients tab header:

```tsx
<CardHeader className="pb-3">
  <div className="flex items-center justify-between">
    <div>
      <CardTitle className="text-base">Client Submissions</CardTitle>
      <CardDescription>View all signups for this cruise.</CardDescription>
    </div>
    {submissions?.some(s => !s.isViewed) && (
      <Button
        variant="outline"
        size="sm"
        onClick={() => markAllViewedMutation.mutate()}
      >
        Mark All as Read
      </Button>
    )}
  </div>
</CardHeader>
```

Add the mutation:
```tsx
const markAllViewedMutation = useMutation({
  mutationFn: async () => {
    return await apiRequest("POST", `/api/cruises/${id}/submissions/mark-all-viewed`);
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["/api/cruises", id] });
    queryClient.invalidateQueries({ queryKey: ["/api/cruises", id, "submissions"] });
    queryClient.invalidateQueries({ queryKey: ["/api/cruises"] });
  },
});
```

Add the server endpoint:
```typescript
app.post("/api/cruises/:id/submissions/mark-all-viewed", requireAuth, async (req, res) => {
  try {
    await storage.markSubmissionsViewed(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});
```

## Data Flow

```
User opens Cruise Detail -> Clients tab
  -> GET /api/cruises/:id/submissions (returns submissions with isViewed field)
  -> Unviewed submissions shown with blue dot + light background
  -> Badge on dashboard card shows correct unviewed count

User clicks a submission row
  -> Side sheet opens with details
  -> If !isViewed: PATCH /api/submissions/:id/viewed
  -> Invalidate queries -> badge count decrements by 1
  -> Submission row loses "unviewed" styling on refetch

User clicks "Mark All as Read"
  -> POST /api/cruises/:id/submissions/mark-all-viewed
  -> All submissions marked as viewed
  -> Badge count goes to 0
  -> All rows lose "unviewed" styling
```

## Annotations

- **Optimistic update possible**: Could optimistically update the local submission list to remove unviewed styling immediately, before the API call completes. But the simple approach (invalidate + refetch) is safer for v1.
- **Badge count source**: The `unviewedCount` on cruise cards comes from `storage.getUnviewedSubmissionCount(cruise.id)` called in `GET /api/cruises/:id` at `routes.ts:457`. This count is refreshed when `queryClient.invalidateQueries({ queryKey: ["/api/cruises"] })` is called.
- **No schema changes**: The `isViewed` field already exists. Only new API endpoints and client-side changes needed.
- **Backward compatible**: The bulk `markSubmissionsViewed` function stays for "Mark All as Read". The per-submission endpoint is additive.

## Verification

1. Create a cruise, submit 3 forms publicly
2. Dashboard shows "3 new" badge on the cruise card
3. Open Cruise Detail -> Clients tab -> 3 submissions with blue dots
4. Click first submission -> sheet opens, blue dot removed after refetch
5. Dashboard badge now shows "2 new"
6. Click "Mark All as Read" -> all blue dots removed, badge shows 0
7. Re-opening Clients tab keeps everything as viewed (no regression)
