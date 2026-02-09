# Cruise Learn More Page

**Route:** `/cruise/:shareId/learn-more`  
**File:** `client/src/pages/cruise-learn-more.tsx`  
**Audience:** Public (unauthenticated users)

---

## What the User Sees & Can Do

### Header (sticky)
- CruiseBook logo (ship icon + "CruiseBook" text) — links to `/`
- Theme toggle button

### Main Content (centered, max-width ~672px)
- **Page header** — large serif heading showing the Learn More header (or falls back to cruise name)
- **Image carousel** (if images uploaded):
  - Large image preview (280px tall, object-cover)
  - **Previous/Next arrow buttons** (only shown when multiple images)
  - **Dot indicators** at bottom of image (one per image, clickable to jump to specific image)
  - Current dot is highlighted white, others are semi-transparent
- **Description text** — full cruise description displayed as a prose block, whitespace preserved (pre-wrap)
- **Action buttons** (side-by-side on desktop, stacked on mobile):
  - **"Book Now" button** (primary) — navigates to `/form/:shareId`
  - **"Back to Cruises" button** (outline) — navigates to `/`

### Error State (cruise not found)
- Anchor icon in red circle
- "Page Not Found" heading
- "This cruise page is not available or the link is invalid."
- "Go to Homepage" button

### Loading State
- Skeleton header (3/4 width)
- Skeleton image area (full width, tall)
- Skeleton description block

### Footer
- CruiseBook logo (smaller)
- "Smooth sailing ahead" text
