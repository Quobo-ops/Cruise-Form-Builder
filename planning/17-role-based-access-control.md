# 17: Role-Based Access Control (RBAC)

## Issue

The application currently has a single-tier authentication system:

1. **Users table is minimal**: Only `id`, `username`, `password` (schema.ts lines 57-61)
2. **No roles or permissions**: Every authenticated user has full access to all templates, cruises, submissions, and settings
3. **No user management UI**: Users can only be created programmatically (no admin panel for user CRUD)
4. **No data isolation**: All cruises and templates are globally visible to every user
5. **No concept of ownership**: Templates and cruises have no `createdBy` or `ownerId` field

For a single-operator deployment this is fine, but as soon as multiple team members need access (sales staff viewing submissions, marketing managing cruise pages, operations managing inventory), the lack of roles becomes a hard blocker.

## Affected Files

| File | Path | Role |
|------|------|------|
| Schema | `shared/schema.ts` | Add role to users, ownerId to templates/cruises |
| Storage | `server/storage.ts` | Role-aware queries, user CRUD |
| Server Routes | `server/routes.ts` | Role-checking middleware, user management endpoints |
| Auth Hook | `client/src/hooks/use-auth.ts` | Expose user role to frontend |
| Admin Dashboard | `client/src/pages/admin-dashboard.tsx` | Role-based UI visibility |
| New Page | `client/src/pages/user-management.tsx` | User management page (new) |
| App Router | `client/src/App.tsx` | Route for user management |

## Solution

### Step 1: Define roles

Three roles, ordered by permission level:

| Role | Templates | Cruises | Submissions | Inventory | Users | Audit | Analytics |
|------|-----------|---------|-------------|-----------|-------|-------|-----------|
| **viewer** | View own | View own | View | View | - | - | View own |
| **editor** | Create/Edit own | Create/Edit own | View/Export | Edit | - | - | View own |
| **admin** | Full CRUD all | Full CRUD all | Full access | Full access | Manage | View | View all |

### Step 2: Schema changes

In `shared/schema.ts`, update the users table:

```typescript
export const userRoleEnum = z.enum(["admin", "editor", "viewer"]);
export type UserRole = z.infer<typeof userRoleEnum>;

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("viewer"),  // NEW
  displayName: text("display_name"),                // NEW
  isActive: boolean("is_active").default(true),     // NEW
  createdAt: timestamp("created_at").defaultNow(),  // NEW
  lastLoginAt: timestamp("last_login_at"),          // NEW
});
```

Add `createdBy` to templates and cruises:

```typescript
// In templates table, add:
createdBy: varchar("created_by").references(() => users.id),

// In cruises table, add:
createdBy: varchar("created_by").references(() => users.id),
```

### Step 3: Role-checking middleware

In `server/routes.ts`, create role-aware middleware:

```typescript
function requireRole(...allowedRoles: UserRole[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: "Account disabled" });
    }
    if (!allowedRoles.includes(user.role as UserRole)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    // Attach user to request for downstream use
    (req as any).user = user;
    next();
  };
}
```

### Step 4: Apply role checks to existing routes

Replace `requireAuth` with role-specific middleware:

```typescript
// Templates
app.post("/api/templates", requireRole("admin", "editor"), ...);
app.patch("/api/templates/:id", requireRole("admin", "editor"), ...);  // + ownership check
app.delete("/api/templates/:id", requireRole("admin"), ...);

// Cruises
app.post("/api/cruises", requireRole("admin", "editor"), ...);
app.patch("/api/cruises/:id", requireRole("admin", "editor"), ...);  // + ownership check
app.delete("/api/cruises/:id", requireRole("admin"), ...);

// Inventory
app.patch("/api/cruises/:id/inventory", requireRole("admin", "editor"), ...);

// User management
app.get("/api/users", requireRole("admin"), ...);
app.post("/api/users", requireRole("admin"), ...);
app.patch("/api/users/:id", requireRole("admin"), ...);
app.delete("/api/users/:id", requireRole("admin"), ...);

// Audit logs
app.get("/api/audit-logs", requireRole("admin"), ...);

// Submissions, analytics - all authenticated roles can view
app.get("/api/cruises/:id/submissions", requireRole("admin", "editor", "viewer"), ...);
```

### Step 5: Ownership checks for editors

Editors can only modify resources they created:

```typescript
// Helper: check if user owns the resource or is admin
function canModify(user: User, resource: { createdBy?: string | null }): boolean {
  if (user.role === "admin") return true;
  return resource.createdBy === user.id;
}

// In PATCH /api/templates/:id handler:
const template = await storage.getTemplate(id);
if (!template) return res.status(404).json({ error: "Not found" });
if (!canModify(req.user, template)) {
  return res.status(403).json({ error: "You can only edit templates you created" });
}
```

### Step 6: User management endpoints

```typescript
// List users (admin only)
app.get("/api/users", requireRole("admin"), async (req, res) => {
  const users = await storage.getAllUsers();
  // Strip passwords from response
  res.json(users.map(({ password, ...u }) => u));
});

// Create user (admin only)
app.post("/api/users", requireRole("admin"), async (req, res) => {
  const { username, password, role, displayName } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await storage.createUser({
    username,
    password: hashedPassword,
    role: role || "viewer",
    displayName,
  });
  const { password: _, ...safeUser } = user;
  res.status(201).json(safeUser);
});

// Update user (admin only)
app.patch("/api/users/:id", requireRole("admin"), async (req, res) => {
  const { role, displayName, isActive } = req.body;
  const updated = await storage.updateUser(param(req, "id"), {
    role, displayName, isActive,
  });
  if (!updated) return res.status(404).json({ error: "User not found" });
  const { password: _, ...safeUser } = updated;
  res.json(safeUser);
});

// Reset password (admin only)
app.post("/api/users/:id/reset-password", requireRole("admin"), async (req, res) => {
  const { newPassword } = req.body;
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await storage.updateUser(param(req, "id"), { password: hashedPassword });
  res.json({ success: true });
});
```

### Step 7: User management page

Create `client/src/pages/user-management.tsx`:

```tsx
export default function UserManagement() {
  // Table showing: username, display name, role, active status, last login, actions
  // Actions: Edit role, Activate/Deactivate, Reset password
  // "Add User" button opens a dialog with username, password, role, display name
}
```

Table columns:

| Column | Description |
|--------|-------------|
| Username | Login identifier |
| Display Name | Friendly name |
| Role | Badge: Admin (red), Editor (blue), Viewer (gray) |
| Status | Active/Inactive toggle |
| Last Login | Relative timestamp |
| Actions | Edit, Reset Password, Deactivate |

### Step 8: Frontend role-aware rendering

Update `use-auth.ts` to return the user's role:

```typescript
// The /api/user endpoint should return role along with username
interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
  displayName?: string;
}
```

Conditionally render UI elements based on role:

```tsx
const { user } = useAuth();

// Hide delete buttons from non-admins
{user?.role === "admin" && (
  <Button variant="destructive" onClick={handleDelete}>Delete</Button>
)}

// Hide user management link from non-admins
{user?.role === "admin" && (
  <Link href="/admin/users">Manage Users</Link>
)}

// Show read-only badge for viewers
{user?.role === "viewer" && (
  <Badge variant="outline">View Only</Badge>
)}
```

### Step 9: Database migration

```sql
-- Add columns to users
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE users ADD COLUMN display_name TEXT;
ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT now();
ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP;

-- Add createdBy to templates and cruises
ALTER TABLE templates ADD COLUMN created_by VARCHAR REFERENCES users(id);
ALTER TABLE cruises ADD COLUMN created_by VARCHAR REFERENCES users(id);

-- Set existing users as admins (backward compatible)
UPDATE users SET role = 'admin';

-- Set existing templates/cruises createdBy to the first admin user
UPDATE templates SET created_by = (SELECT id FROM users LIMIT 1) WHERE created_by IS NULL;
UPDATE cruises SET created_by = (SELECT id FROM users LIMIT 1) WHERE created_by IS NULL;
```

## Data Flow

```
Admin creates a new user
  -> POST /api/users { username, password, role: "editor", displayName: "Jane" }
  -> Password hashed with bcrypt
  -> User created with role "editor"
  -> Audit event logged

Editor logs in
  -> POST /api/login { username, password }
  -> Session created with userId
  -> GET /api/user returns { id, username, role: "editor", displayName: "Jane" }
  -> Frontend renders role-appropriate UI (no delete buttons, no user management)

Editor creates a template
  -> POST /api/templates { name, graph }
  -> createdBy set to editor's userId
  -> Template visible to this editor and all admins

Editor tries to delete another user's cruise
  -> DELETE /api/cruises/:id
  -> requireRole("admin") blocks with 403

Viewer logs in
  -> Dashboard shows cruises and submissions (read-only)
  -> No create/edit/delete buttons visible
  -> Can view and search submissions
  -> Can export CSV
```

## Annotations

- **Backward compatible**: Existing users default to "admin" role. The migration sets all current users as admins. No existing functionality is lost.
- **Ownership is advisory for admins**: Admins can modify any resource regardless of `createdBy`. Editors are restricted to their own resources. Viewers are read-only.
- **No multi-tenancy**: This plan adds roles within a single organization, not full multi-tenant isolation. Multi-tenancy (separate organizations with isolated data) would be a separate, larger effort.
- **Password never returned**: All user-facing endpoints strip the `password` field before responding. The `use-auth` hook should never receive password data.
- **Session invalidation**: When an admin deactivates a user, their existing sessions continue until expiry. For immediate revocation, add a check in the `requireRole` middleware that verifies `isActive` on every request.
- **Audit integration**: All user management actions (create, role change, deactivate, password reset) should be logged via the existing `audit()` helper.

## Verification

1. Existing user logs in -> role is "admin", full access
2. Admin creates a new "editor" user -> editor can log in
3. Editor creates template -> template has `createdBy` set to editor's ID
4. Editor cannot delete templates created by others -> 403 error
5. Editor cannot access /admin/users -> 403 error
6. Admin creates a "viewer" user -> viewer can log in
7. Viewer sees dashboard (read-only) -> no create/edit/delete buttons
8. Viewer can view submissions and export CSV
9. Viewer cannot create templates or cruises -> 403 error
10. Admin deactivates a user -> user cannot log in
11. Admin resets a user's password -> user can log in with new password
12. Admin changes user's role -> role reflected immediately on next page load
13. Migration sets all existing users to admin role
