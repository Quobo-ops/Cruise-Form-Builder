# 03: Multiple Forms Per Cruise

> **Status: Implemented**

## Issue

Currently, each cruise has exactly one `templateId` foreign key (`shared/schema.ts:100`), meaning each cruise is linked to a single form template. Users need to create multiple forms for different stages of informational gathering -- e.g., an initial interest form, a detailed booking form, a dietary preferences form, and a post-cruise feedback form.

**Current data model:**
```
Cruise ---(1:1)---> Template
  templateId: varchar, NOT NULL, FK to templates.id
```

**Desired data model:**
```
Cruise ---(1:many)---> CruiseForm ---(many:1)---> Template
  Each CruiseForm has: label, stage, sortOrder, isActive
```

## Affected Files

| File | Path | Role |
|------|------|------|
| Schema | `shared/schema.ts` | Data model - cruises table, new junction table |
| Server Routes | `server/routes.ts` | API endpoints for CRUD on cruise forms |
| Storage | `server/storage.ts` | Database access layer |
| DB | `server/db.ts` | Drizzle ORM setup |
| Admin Dashboard | `client/src/pages/admin-dashboard.tsx` | Cruise creation dialog (template select) |
| Cruise Detail | `client/src/pages/cruise-detail.tsx` | Display/manage multiple forms |
| Public Form | `client/src/pages/public-form.tsx` | Resolve which form to show |
| Landing | `client/src/pages/landing.tsx` | Multiple form links per cruise |

## Solution

### Phase 1: Schema Changes

#### 1A: Create `cruiseForms` junction table

In `shared/schema.ts`, add a new table:

```typescript
export const cruiseForms = pgTable("cruise_forms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cruiseId: varchar("cruise_id").notNull().references(() => cruises.id, { onDelete: "cascade" }),
  templateId: varchar("template_id").notNull().references(() => templates.id),
  label: text("label").notNull(),           // e.g., "Initial Interest", "Booking Details"
  stage: text("stage").notNull(),            // e.g., "pre-booking", "booking", "post-cruise"
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").default(true),
  shareId: varchar("share_id").unique().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCruiseFormSchema = createInsertSchema(cruiseForms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCruiseForm = z.infer<typeof insertCruiseFormSchema>;
export type CruiseForm = typeof cruiseForms.$inferSelect;
```

#### 1B: Keep `templateId` on cruises for backward compatibility

The existing `cruises.templateId` column remains as the "primary" or "default" form. New cruise forms are added via the junction table. This allows a gradual migration.

#### 1C: Update submissions table

Add optional `cruiseFormId` to track which specific form a submission came from:

```typescript
// In submissions table, add:
cruiseFormId: varchar("cruise_form_id").references(() => cruiseForms.id),
```

### Phase 2: Database Migration

Create a migration script that:
1. Creates the `cruise_forms` table
2. For each existing cruise, creates a default `cruiseForm` entry using the existing `templateId`
3. Adds `cruise_form_id` column to `submissions` table

```sql
-- Migration SQL
CREATE TABLE cruise_forms (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  cruise_id VARCHAR NOT NULL REFERENCES cruises(id) ON DELETE CASCADE,
  template_id VARCHAR NOT NULL REFERENCES templates(id),
  label TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'booking',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  share_id VARCHAR UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Migrate existing cruise->template relationships
INSERT INTO cruise_forms (cruise_id, template_id, label, stage, sort_order, share_id)
SELECT id, template_id, 'Booking Form', 'booking', 0, share_id
FROM cruises;

-- Add cruise_form_id to submissions
ALTER TABLE submissions ADD COLUMN cruise_form_id VARCHAR REFERENCES cruise_forms(id);
```

### Phase 3: API Changes

#### 3A: New endpoints for cruise forms

```
GET    /api/cruises/:id/forms              -> List all forms for a cruise
POST   /api/cruises/:id/forms              -> Add a new form to a cruise
PATCH  /api/cruises/:id/forms/:formId      -> Update form label/stage/order/active
DELETE /api/cruises/:id/forms/:formId      -> Remove a form from a cruise
```

#### 3B: Update public form resolution

In `server/routes.ts` at the `GET /api/forms/:shareId` endpoint (line 723), update to check `cruise_forms` table first:

```typescript
// 1. Check cruise_forms table for shareId
const cruiseForm = await storage.getCruiseFormByShareId(shareId);
if (cruiseForm) {
  const cruise = await storage.getCruise(cruiseForm.cruiseId);
  if (!cruise?.isPublished || !cruise?.isActive || !cruiseForm.isActive) {
    return res.status(404).json({ error: "Form not available" });
  }
  const template = await storage.getTemplate(cruiseForm.templateId);
  // Return template + cruise + cruiseForm metadata
  return res.json({ ...template, cruise, cruiseForm, inventory: ... });
}
// 2. Fall back to existing cruise.shareId logic
// 3. Fall back to template.shareId logic
```

#### 3C: Update submission endpoint

In `POST /api/forms/:shareId/submit` (line 761), capture `cruiseFormId` when submitting:

```typescript
const submission = await storage.createSubmission({
  templateId,
  cruiseId,
  cruiseFormId: cruiseForm?.id || null,  // NEW
  answers,
  customerName,
  customerPhone,
  isViewed: false,
});
```

### Phase 4: UI Changes

#### 4A: Cruise Detail - Forms Tab

Add a new "Forms" tab to `cruise-detail.tsx` between the existing tabs:

```tsx
<TabsTrigger value="forms" className="gap-1.5">
  <ClipboardList className="w-4 h-4" />
  <span className="hidden sm:inline">Forms</span>
</TabsTrigger>

<TabsContent value="forms">
  {/* List of cruise forms with:
    - Form label, stage, template name
    - Active/inactive toggle
    - Copy share link button
    - Edit template button (links to builder)
    - Reorder via drag or up/down arrows
    - "Add Form" button to create new form
  */}
</TabsContent>
```

#### 4B: Add Form Dialog

When clicking "Add Form" on the cruise detail page:

```tsx
<Dialog>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Add Form to Cruise</DialogTitle>
    </DialogHeader>
    <Input label="Form Label" placeholder="e.g., Dietary Preferences" />
    <Select label="Stage">
      <SelectItem value="pre-booking">Pre-Booking</SelectItem>
      <SelectItem value="booking">Booking</SelectItem>
      <SelectItem value="post-booking">Post-Booking</SelectItem>
      <SelectItem value="pre-cruise">Pre-Cruise</SelectItem>
      <SelectItem value="post-cruise">Post-Cruise</SelectItem>
    </Select>
    <Select label="Template">
      {/* List of available templates */}
    </Select>
    <Button>Create New Template</Button> {/* Or select existing */}
  </DialogContent>
</Dialog>
```

#### 4C: Landing Page - Multiple Form CTAs

In `landing.tsx`, update cruise cards to show form-stage-specific buttons:

```tsx
{cruise.forms?.map((form) => (
  <Button key={form.id} onClick={() => setLocation(`/form/${form.shareId}`)}>
    {form.label}
  </Button>
))}
```

#### 4D: Cruise Creation Dialog

Update the cruise creation dialog in `admin-dashboard.tsx` (lines 304-425) to optionally select multiple templates or just create with a default template (current behavior):

- Keep existing "Form Template" select as the "primary" form
- After creation, additional forms can be added via cruise detail

### Phase 5: Storage Layer

Add to `server/storage.ts`:

```typescript
// New methods
async getCruiseForms(cruiseId: string): Promise<CruiseForm[]>
async getCruiseFormByShareId(shareId: string): Promise<CruiseForm | undefined>
async createCruiseForm(data: InsertCruiseForm): Promise<CruiseForm>
async updateCruiseForm(id: string, data: Partial<CruiseForm>): Promise<CruiseForm | undefined>
async deleteCruiseForm(id: string): Promise<void>
async reorderCruiseForms(cruiseId: string, orderedIds: string[]): Promise<void>
```

## Data Flow

```
ADMIN: Creating a cruise with multiple forms
  1. Admin creates cruise (existing flow, sets primary template)
  2. System auto-creates first CruiseForm entry for the primary template
  3. Admin navigates to Cruise Detail -> Forms tab
  4. Admin clicks "Add Form" -> selects template + label + stage
  5. System creates CruiseForm entry with unique shareId
  6. Admin can reorder forms, toggle active/inactive

PUBLIC: Filling out forms
  1. Landing page shows cruise with multiple form buttons (one per active CruiseForm)
  2. User clicks a form button -> /form/:cruiseFormShareId
  3. PublicForm resolves CruiseForm -> Template + Cruise
  4. User fills form -> submission saved with cruiseFormId

ADMIN: Viewing submissions
  1. Cruise Detail -> Clients tab shows all submissions
  2. Filter by form stage/label (new filter control)
  3. Each submission shows which form it came from
```

## Annotations

- **Backward compatibility**: Existing `cruises.templateId` remains. The migration creates CruiseForm entries from existing data. Old share links continue to work via the fallback logic.
- **Inventory handling**: Inventory is per-cruise, not per-form. Multiple forms can reference the same quantity steps -- inventory tracks at the cruise level.
- **Share IDs**: Each CruiseForm gets its own unique shareId. The cruise's top-level shareId can serve as a "landing" that lists all available forms, or can redirect to the primary form.
- **Stages are advisory**: The `stage` field is metadata for organization, not enforcement. Forms can be filled in any order unless the admin specifically deactivates out-of-sequence forms.
- **Template reuse**: Multiple cruise forms can reference the same template. E.g., two cruises both use the "Dietary Preferences" template.

## Verification

1. Create a cruise with default template -> CruiseForm auto-created
2. Add 2 more forms to the cruise via cruise detail
3. Verify each form has its own share link
4. Fill each form publicly -> submissions tracked with correct cruiseFormId
5. Landing page shows all active forms for the cruise
6. Deactivate a form -> it disappears from landing page
7. Existing cruise share links still work (backward compat)
8. Submissions tab can filter by form
