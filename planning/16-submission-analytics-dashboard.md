# 16: Submission Analytics Dashboard

## Issue

The application stores rich submission data -- customer details, form answers (text, choices, quantities with pricing), timestamps, inventory movements, and viewed status -- but provides no analytical views. Admins see raw submission lists and counts but cannot answer basic business questions:

1. How many submissions are we getting per day/week?
2. Which cruises are most popular?
3. What are the most commonly selected choices?
4. What is the revenue breakdown per quantity item?
5. Are submissions increasing or declining over time?
6. What percentage of form views result in submissions? (conversion)

**Existing assets**: Recharts 2.15.2 is already a dependency. The data is in PostgreSQL. Paginated queries exist.

**Missing**: Analytics queries, aggregation endpoints, and a dashboard UI to visualize the data.

## Affected Files

| File | Path | Role |
|------|------|------|
| New Page | `client/src/pages/analytics.tsx` | Analytics dashboard page (new) |
| Cruise Detail | `client/src/pages/cruise-detail.tsx` | Add "Analytics" tab for per-cruise metrics |
| App Router | `client/src/App.tsx` | Add route for `/admin/analytics` |
| Server Routes | `server/routes.ts` | New analytics API endpoints |
| Storage | `server/storage.ts` | New aggregation queries |
| Schema | `shared/schema.ts` | Optional: types for analytics response shapes |

## Solution

### Step 1: Define analytics API endpoints

```
GET /api/analytics/overview           -> Global metrics (total submissions, cruises, templates)
GET /api/analytics/submissions-trend  -> Submissions per day/week over a date range
GET /api/analytics/top-cruises        -> Cruises ranked by submission count
GET /api/cruises/:id/analytics        -> Per-cruise analytics (choice breakdown, revenue, trend)
```

### Step 2: Global overview endpoint

In `server/routes.ts`:

```typescript
app.get("/api/analytics/overview", requireAuth, async (req, res) => {
  const overview = await storage.getAnalyticsOverview();
  res.json(overview);
});
```

In `server/storage.ts`:

```typescript
async getAnalyticsOverview(): Promise<{
  totalSubmissions: number;
  totalCruises: number;
  totalTemplates: number;
  submissionsToday: number;
  submissionsThisWeek: number;
  submissionsThisMonth: number;
}> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [stats] = await db.select({
    totalSubmissions: sql<number>`count(*)::int`,
    submissionsToday: sql<number>`count(*) FILTER (WHERE ${submissions.createdAt} >= ${todayStart})::int`,
    submissionsThisWeek: sql<number>`count(*) FILTER (WHERE ${submissions.createdAt} >= ${weekStart})::int`,
    submissionsThisMonth: sql<number>`count(*) FILTER (WHERE ${submissions.createdAt} >= ${monthStart})::int`,
  }).from(submissions);

  const [cruiseCount] = await db.select({
    count: sql<number>`count(*)::int`
  }).from(cruises).where(isNull(cruises.deletedAt));

  const [templateCount] = await db.select({
    count: sql<number>`count(*)::int`
  }).from(templates).where(isNull(templates.deletedAt));

  return {
    ...stats,
    totalCruises: cruiseCount.count,
    totalTemplates: templateCount.count,
  };
}
```

### Step 3: Submissions trend endpoint

```typescript
app.get("/api/analytics/submissions-trend", requireAuth, async (req, res) => {
  const days = parseInt(req.query.days as string) || 30;
  const trend = await storage.getSubmissionsTrend(days);
  res.json(trend);
});
```

```typescript
async getSubmissionsTrend(days: number): Promise<Array<{ date: string; count: number }>> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const results = await db.select({
    date: sql<string>`date_trunc('day', ${submissions.createdAt})::date::text`,
    count: sql<number>`count(*)::int`,
  })
    .from(submissions)
    .where(sql`${submissions.createdAt} >= ${startDate}`)
    .groupBy(sql`date_trunc('day', ${submissions.createdAt})`)
    .orderBy(sql`date_trunc('day', ${submissions.createdAt})`);

  return results;
}
```

### Step 4: Top cruises endpoint

```typescript
app.get("/api/analytics/top-cruises", requireAuth, async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 10;
  const topCruises = await storage.getTopCruises(limit);
  res.json(topCruises);
});
```

```typescript
async getTopCruises(limit: number): Promise<Array<{
  cruiseId: string;
  cruiseName: string;
  submissionCount: number;
  unviewedCount: number;
}>> {
  return await db.select({
    cruiseId: cruises.id,
    cruiseName: cruises.name,
    submissionCount: sql<number>`count(${submissions.id})::int`,
    unviewedCount: sql<number>`count(*) FILTER (WHERE ${submissions.isViewed} = false)::int`,
  })
    .from(cruises)
    .leftJoin(submissions, eq(submissions.cruiseId, cruises.id))
    .where(isNull(cruises.deletedAt))
    .groupBy(cruises.id, cruises.name)
    .orderBy(sql`count(${submissions.id}) DESC`)
    .limit(limit);
}
```

### Step 5: Per-cruise analytics endpoint

```typescript
app.get("/api/cruises/:id/analytics", requireAuth, async (req, res) => {
  const cruiseId = param(req, "id");
  const analytics = await storage.getCruiseAnalytics(cruiseId);
  res.json(analytics);
});
```

```typescript
async getCruiseAnalytics(cruiseId: string): Promise<{
  submissionsTrend: Array<{ date: string; count: number }>;
  choiceBreakdown: Array<{ stepId: string; question: string; choiceLabel: string; count: number }>;
  revenueByItem: Array<{ choiceLabel: string; totalQuantity: number; totalRevenue: number }>;
}> {
  // Submissions trend for this cruise (last 30 days)
  const trendStart = new Date();
  trendStart.setDate(trendStart.getDate() - 30);

  const submissionsTrend = await db.select({
    date: sql<string>`date_trunc('day', ${submissions.createdAt})::date::text`,
    count: sql<number>`count(*)::int`,
  })
    .from(submissions)
    .where(and(
      eq(submissions.cruiseId, cruiseId),
      sql`${submissions.createdAt} >= ${trendStart}`
    ))
    .groupBy(sql`date_trunc('day', ${submissions.createdAt})`)
    .orderBy(sql`date_trunc('day', ${submissions.createdAt})`);

  // Revenue from inventory
  const revenueByItem = await db.select({
    choiceLabel: cruiseInventory.choiceLabel,
    totalQuantity: sql<number>`${cruiseInventory.totalOrdered}::int`,
    totalRevenue: sql<number>`(${cruiseInventory.totalOrdered} * ${cruiseInventory.price})::numeric`,
  })
    .from(cruiseInventory)
    .where(eq(cruiseInventory.cruiseId, cruiseId))
    .orderBy(sql`${cruiseInventory.totalOrdered} DESC`);

  // Choice breakdown requires parsing JSONB answers -- compute in application layer
  const allSubmissions = await db.select({ answers: submissions.answers })
    .from(submissions)
    .where(eq(submissions.cruiseId, cruiseId));

  const choiceCounts: Record<string, { stepId: string; choiceLabel: string; count: number }> = {};
  for (const sub of allSubmissions) {
    const answers = sub.answers as Record<string, string | QuantityAnswer[]>;
    for (const [stepId, answer] of Object.entries(answers)) {
      if (typeof answer === "string") {
        const key = `${stepId}:${answer}`;
        if (!choiceCounts[key]) {
          choiceCounts[key] = { stepId, choiceLabel: answer, count: 0 };
        }
        choiceCounts[key].count++;
      }
    }
  }

  return {
    submissionsTrend,
    choiceBreakdown: Object.values(choiceCounts).sort((a, b) => b.count - a.count),
    revenueByItem,
  };
}
```

### Step 6: Global analytics page UI

Create `client/src/pages/analytics.tsx` with four sections:

1. **Summary cards**: Total submissions, today's submissions, active cruises, active templates
2. **Submissions trend chart**: Line chart (Recharts `LineChart`) showing submissions per day over 30 days
3. **Top cruises table**: Ranked list of cruises by submission count
4. **Date range selector**: Toggle between 7, 30, 90 days

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
  <Card>
    <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Submissions</CardTitle></CardHeader>
    <CardContent><div className="text-2xl font-bold">{overview.totalSubmissions}</div></CardContent>
  </Card>
  {/* ... more cards for today, this week, this month */}
</div>

<Card className="mb-8">
  <CardHeader><CardTitle>Submissions Trend</CardTitle></CardHeader>
  <CardContent>
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={trend}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  </CardContent>
</Card>
```

### Step 7: Per-cruise analytics tab

In `cruise-detail.tsx`, add an "Analytics" tab alongside the existing Clients/Inventory tabs:

```tsx
<TabsTrigger value="analytics" className="gap-1.5">
  <BarChart3 className="w-4 h-4" />
  <span className="hidden sm:inline">Analytics</span>
</TabsTrigger>

<TabsContent value="analytics">
  {/* Submission trend chart for this cruise */}
  {/* Choice breakdown bar chart */}
  {/* Revenue by item table */}
</TabsContent>
```

The choice breakdown is best displayed as a horizontal bar chart (Recharts `BarChart` with `layout="vertical"`).

Revenue by item works well as a simple table with columns: Item, Quantity Sold, Revenue.

## Data Flow

```
Admin visits /admin/analytics
  -> GET /api/analytics/overview
  -> GET /api/analytics/submissions-trend?days=30
  -> GET /api/analytics/top-cruises?limit=10
  -> Renders summary cards, line chart, top cruises table

Admin visits cruise detail -> Analytics tab
  -> GET /api/cruises/:id/analytics
  -> Renders per-cruise trend, choice breakdown, revenue table

Admin changes date range (7/30/90 days)
  -> GET /api/analytics/submissions-trend?days=7
  -> Chart re-renders with new data
```

## Annotations

- **Recharts already installed**: No new dependencies needed. Recharts 2.15.2 is in package.json. Import `LineChart`, `BarChart`, `ResponsiveContainer`, etc.
- **Choice breakdown is app-level**: Since answers are stored as JSONB, choice frequency analysis requires fetching and parsing all submissions for a cruise. For cruises with thousands of submissions, this could be slow. Consider caching or pre-computing if this becomes a bottleneck.
- **Revenue calculation**: Revenue data comes from `cruiseInventory.totalOrdered * cruiseInventory.price`, which is already available without scanning submissions. This is efficient.
- **No new tables**: All analytics are derived from existing data. No schema changes needed.
- **Future enhancement -- conversion funnel**: Tracking form view-to-submission conversion would require logging form views (a new event), which is out of scope here but would be a natural follow-up.
- **Dark mode**: Recharts supports custom theming. Use CSS variables from the existing Tailwind dark mode setup for chart colors.

## Verification

1. Navigate to /admin/analytics -> summary cards show correct totals
2. Line chart shows submissions per day for the last 30 days
3. Toggle to 7 days / 90 days -> chart updates
4. Top cruises list shows correct ranking by submission count
5. Click a cruise in the top list -> navigates to cruise detail
6. Cruise detail -> Analytics tab -> shows per-cruise trend
7. Choice breakdown bar chart shows most popular answers
8. Revenue table shows correct quantity * price calculations
9. Empty state shown for cruises with no submissions
10. Charts render correctly in dark mode
11. Page is responsive on mobile (charts resize, cards stack)
