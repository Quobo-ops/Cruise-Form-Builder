# Admin Dashboard — Templates Tab

**Route:** `/admin/templates`  
**File:** `client/src/pages/admin-dashboard.tsx`  
**Audience:** Authenticated admin users

---

## What the User Sees & Can Do

### Header (sticky)
- CruiseBook logo — links to `/admin/dashboard`
- Theme toggle button
- **Logout button** — logs out and redirects to `/`

### Tab Navigation
- **Cruises tab** — navigates to `/admin/cruises`
- **Form Templates tab** (active, highlighted with primary border)

### Page Title Area
- Heading: "Form Templates"
- Subtitle: "Create and manage your booking forms"
- **"New Template" button** — opens the Create Template dialog

### Search Bar
- Search input with magnifying glass icon, placeholder "Search templates..."
- Clear button (X) appears when text is entered
- Filters template cards in real-time by name
- Search term persists in URL query parameter (`?tq=...`)

### Template Cards Grid (responsive: 1/2/3 columns)
Each template card shows:
- **Template name** (truncated if long)
- **Step count** (e.g., "5 steps")
- **Cruise count badge** (e.g., "2 cruises" or "0 cruises")
- **3-dot menu** (appears on hover on desktop):
  - **Duplicate** — creates a copy of the template
  - **Delete** — opens delete confirmation dialog
- **Quick action buttons** at bottom of card:
  - **Edit** — navigates to `/admin/builder/:id?from=templates`
  - **Preview** — navigates to `/admin/preview/:id`
- **Entire card is clickable** — navigates to the form builder
- Card has keyboard focus support (Enter/Space to navigate)

### Create Template Dialog
- **Template Name** input — placeholder "e.g., Caribbean Cruise Booking", required
- **Cancel button**
- **Create button** — disabled until name is entered; shows spinner while creating
- On success: navigates to `/admin/builder/:newId`

### Delete Template Dialog
- Confirmation: "Are you sure you want to delete this template? This action cannot be undone."
- **Warning** (if template is in use): "Warning: X cruise(s) are using this template. You must delete them first." (displayed in red)
- Cancel button
- Delete button (destructive red) with spinner while deleting

### Empty States
- **No templates + no search:** Onboarding flow with:
  - ClipboardList icon
  - "No templates yet" heading
  - Explanation: "Templates are the booking forms your customers fill out..."
  - "Create Your First Template" button
  - 3-step progress indicator: Create template → Create cruise → Share link
- **No search results:** "No templates match your search."

### Loading State
- 3 skeleton cards while data loads
