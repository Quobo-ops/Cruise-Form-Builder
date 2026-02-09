# Cruise Detail

**Route:** `/admin/cruises/:id`  
**File:** `client/src/pages/cruise-detail.tsx`  
**Audience:** Authenticated admin users

---

## What the User Sees & Can Do

### Header (sticky)
- CruiseBook ship icon
- **Breadcrumbs:** Cruises > [Cruise Name]
- **Action buttons:**
  - Theme toggle
  - **Copy Link** — copies public form URL to clipboard
  - **Preview Form** — navigates to `/admin/preview/:templateId?cruise=:cruiseId`
  - **Edit** — opens the Edit Cruise dialog

### Cruise Summary Bar
- Cruise name (heading)
- Description (subtitle, if set)
- **Badges:**
  - Submission count (users icon)
  - Inventory item count (package icon)
  - Active/Inactive status badge

### Tab Navigation (4 tabs)

---

#### Tab 1: Forms
- Heading: "Forms"
- Description: "Manage forms for different stages of this cruise. Each form has its own shareable link."
- **"Add Form" button** — opens Add Form dialog
- **For each form, a card showing:**
  - Form label (e.g., "Dietary Preferences")
  - Stage badge (e.g., "booking", "pre-cruise")
  - Active/Inactive badge
  - Template name
  - **Action buttons:**
    - Copy form link
    - Edit template (pencil icon) — navigates to form builder
    - Open form in new tab (external link icon)
    - Active toggle switch
    - Delete form button (only shown if more than 1 form; requires confirmation)
- **Empty state:** "No forms yet. Add a form to get started."

#### Tab 2: Inventory
- Heading: "Inventory Tracking"
- Description: "Manage stock limits for items with quantity selection."
- **Mobile view (cards):** Each inventory item shown as a card with:
  - Choice label
  - Step question (context)
  - Available/Sold Out badge
  - Price, Ordered count, Total revenue, Remaining stock
  - **Editable stock limit** — click to edit inline, save with button
- **Desktop view (table):** Columns:
  - Item (choice label + step question)
  - Price
  - Ordered (total quantity ordered)
  - Total (price × ordered)
  - Limit (editable — click to type a number and save)
  - Remaining
  - Status (Available or Sold Out badge)
- **Empty state:** "No inventory items to track."

#### Tab 3: Clients
- Heading: "Client Submissions"
- Description: "View all signups for this cruise."
- **"Mark All as Read" button** — appears when there are unviewed submissions
- **Mobile view (cards):** Each submission shown as a card with:
  - User avatar circle with icon
  - Customer name
  - Phone number
  - Submission date
  - Blue dot indicator if unviewed
  - Click to open submission detail sheet
- **Desktop view (table):** Columns:
  - Name (with blue dot if unviewed)
  - Phone
  - Submitted date
  - "View Details" button
- **Submission Detail Sheet** (slides in from right):
  - Customer name + phone in header card
  - Full list of form answers (question → answer)
  - For quantity answers: itemized list with quantities, prices, subtotal
  - Submission timestamp
- **Empty state:** "No submissions yet."

#### Tab 4: Learn More
- Heading: "Learn More Content"
- Description: "Create the Learn More page that users see when they click the Learn More button."
- **Page Header** — text input for the Learn More page header
- **Images section:**
  - "Upload Image" button — opens file picker for images
  - Image preview carousel with prev/next buttons and counter
  - List of uploaded images with delete button for each
- **Description** — multi-line textarea for the cruise description
- **"Save Learn More Content" button** — saves all Learn More fields
- Auto-saves on navigation away (unmount)
- Unsaved changes dialog if navigating away with unsaved content

---

### Edit Cruise Dialog
- **Name** — text input
- **Description** — textarea
- **Active toggle** — "Active (accepting new signups)"
- **Published toggle** — "Published (visible on public landing page)"
- Cancel and Save Changes buttons

### Add Form Dialog
- **Form Label** — text input (e.g., "Dietary Preferences")
- **Stage** — dropdown: Pre-Booking, Booking, Post-Booking, Pre-Cruise, Post-Cruise
- **Template** — dropdown select from existing templates
- Cancel and Add Form buttons

### Not Found State
- Ship icon
- "Cruise Not Found" heading
- "This cruise doesn't exist or has been deleted."
- "Back to Cruises" button

### Loading State
- Skeleton header and content blocks
