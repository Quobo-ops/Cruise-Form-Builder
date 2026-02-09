# Form Preview

**Route:** `/admin/preview/:id`  
**File:** `client/src/pages/form-preview.tsx`  
**Audience:** Authenticated admin users

---

## What the User Sees & Can Do

### Header (sticky)
- CruiseBook ship icon
- **Breadcrumbs:** Templates > [Template Name] > Preview
- "PREVIEW MODE" badge (yellow/warning)
- **Theme toggle**
- **"Edit Template" button** — navigates back to the form builder

### Preview Banner
- Yellow/warning alert: "This is a preview of how the form will appear to users. Submissions are not recorded."

### Form Preview (mirrors the Public Form experience)
- **Cruise/template name** as heading (with ship icon)
- **Cruise description** (if previewing with a cruise context via `?cruise=:id`)
- **Progress bar** — shows percentage complete
- **Step-by-step form walkthrough:**

  #### Text Steps
  - Question heading
  - Text input with placeholder
  - Back button (if not first step)
  - Next button

  #### Choice Steps
  - Question heading
  - List of choice buttons (full-width, outline style)
  - Back button (if not first step)

  #### Quantity Steps
  - Question heading
  - For each quantity choice:
    - Choice label
    - Price per unit
    - Remaining stock / Sold Out badge (if inventory data available)
    - Minus / quantity display / Plus buttons
  - "No thanks" style buttons (simple selection, no quantity)
  - Back button + Next button

  #### Conclusion Steps
  - Thank you message
  - Summary of all answers (clickable to edit)
  - Total price calculation (if quantity items selected)
  - Submit button text (customizable)

  #### Info Popup
  - Floating info button (if step has info popup enabled)
  - Opens popup overlay with additional step information

### Review Screen
- List of all answered questions with responses
- Quantity answers show itemized breakdown (quantity x price)
- Phone number display
- Total price summary (if applicable)
- Each answer is clickable to go back and edit
- Back button + "Submit Booking" button (disabled in preview)

### Screen Reader Support
- Live region for step change announcements
- Focus management on step transitions
