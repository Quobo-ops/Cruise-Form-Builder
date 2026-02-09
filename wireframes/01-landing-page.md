# Landing Page

**Route:** `/`  
**File:** `client/src/pages/landing.tsx`  
**Audience:** Public (unauthenticated users)

---

## What the User Sees & Can Do

### Header
- CruiseBook logo (ship icon + "CruiseBook" text) — links back to `/`
- Theme toggle button (light/dark mode)

### Hero Section
- "Set Sail With Us" badge with compass icon
- Large heading: "Join the Voyage"
- Subtitle: "Discover extraordinary cruises and book your next adventure in just a few simple steps."
- Decorative wave SVG in background

### Available Cruises Section
- Section heading: "Available Cruises" with anchor icon
- **For each published cruise, a card showing:**
  - Cruise name (serif heading)
  - Description (if provided, truncated to 2 lines)
  - Date range (if start/end dates set, with calendar icon and gold accent)
  - **If multiple forms are attached:** One button per active form (first is primary style, rest are outline), each labeled with the form's label text
  - **If single form attached:** One "Book Now" button (or the form's custom label)
  - **If no forms attached:** Fallback "Book Now" button using cruise shareId
  - "Learn More" button (outline style) — navigates to `/cruise/:shareId/learn-more`

### Empty State (no cruises available)
- Ship icon in circle
- Heading: "No cruises available"
- Message: "Check back soon for upcoming voyage opportunities."

### Loading State
- Skeleton cards (3 placeholder cards while data loads)

### Footer
- CruiseBook logo (smaller)
- "Smooth sailing ahead" text
- "Admin Portal" link — navigates to `/admin/login`
