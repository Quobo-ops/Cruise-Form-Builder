# Admin Dashboard — Cruises Tab

**Route:** `/admin/cruises` (also `/admin/dashboard`)  
**File:** `client/src/pages/admin-dashboard.tsx`  
**Audience:** Authenticated admin users

---

## What the User Sees & Can Do

### Header (sticky)
- CruiseBook logo — links to `/admin/dashboard`
- Theme toggle button
- **Logout button** — logs out and redirects to `/`

### Tab Navigation
- **Cruises tab** (active, highlighted with primary border)
- **Form Templates tab** — navigates to `/admin/templates`

### Page Title Area
- Heading: "Cruises"
- Subtitle: "Manage your cruise bookings and signups"
- **"New Cruise" button** — opens the Create Cruise dialog

### Search Bar
- Search input with magnifying glass icon, placeholder "Search cruises..."
- Clear button (X) appears when there is text in the search field
- Filters cruise cards in real-time by name
- Search term persists in URL query parameter (`?cq=...`)

### Cruise Cards Grid (responsive: 1/2/3 columns)
Each cruise card shows:
- **Cruise name** (truncated if long)
- **"X new" badge** (red, destructive) — if there are unviewed submissions
- **Description** or template name as subtitle
- **Signup count** with users icon (e.g., "5 signups")
- **Published badge** (green) or **Draft badge** (gray)
- **Inactive badge** (outline) — if cruise is not active
- **3-dot menu** (appears on hover on desktop, always visible on mobile):
  - Delete — opens delete confirmation dialog
- **"Copy Link" quick action** — copies the cruise's public form link to clipboard
- **Start date** (if set) — displayed at bottom right
- **Entire card is clickable** — navigates to `/admin/cruises/:id`
- Card has keyboard focus support (Enter/Space to navigate)

### Create Cruise Dialog
- **Cruise Name** — text input, required
- **Description** — textarea, optional
- **Start Date** — date input, optional
- **End Date** — date input, optional (validated to be after start date)
- **Form Template** — dropdown select from existing templates, required
- **Published checkbox** — "Published (visible on public landing page)"
- **Cancel button**
- **Create button** — disabled until name and template are selected; shows spinner while creating
- On success: navigates to `/admin/cruises/:newId`

### Delete Cruise Dialog
- Confirmation: "Are you sure you want to delete this cruise? All submissions will be lost."
- Cancel button
- Delete button (destructive red) with spinner while deleting

### Empty States
- **No cruises + templates exist:** "No cruises yet" with message and "Create Cruise" button
- **No cruises + no templates:** Message directing user to create a template first, with "Go to Templates" button and "Step 1 of 2" indicator
- **No search results:** "No cruises match your search."

### Loading State
- 3 skeleton cards while data loads
