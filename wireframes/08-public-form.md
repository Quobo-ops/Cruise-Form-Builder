# Public Booking Form

**Route:** `/form/:shareId` or `/fill/cruise/:cruiseId`  
**File:** `client/src/pages/public-form.tsx`  
**Audience:** Public (unauthenticated users / customers)

---

## What the User Sees & Can Do

### Header (sticky, minimal)
- Ship icon + "CruiseBook" text
- Theme toggle button

### Form Header
- Ship icon in navy square
- **Cruise or template name** as heading
- **Cruise description** (if available)

### Draft Recovery Banner (conditional)
- Appears if user has unsaved progress from a previous session (within 24 hours)
- Message: "You have unsaved progress from a previous session."
- **"Resume" button** — restores all previous answers, step position, selections
- **"Start Fresh" button** — clears saved draft and starts over

### Progress Bar
- Visual progress bar showing percentage complete
- Text: "X% complete"

### Step-by-Step Form

#### Text Input Steps
- Question as heading (serif font)
- Text input field with placeholder
- **Back button** (if not the first step)
- **Next button** — disabled until text is entered; advances to next step
- Pressing Enter submits the text answer
- Auto-detects name fields to save customer name

#### Choice Selection Steps
- Question as heading
- List of choice buttons (full-width, left-aligned, outline style)
- Clicking a choice immediately advances to the next step (or to the choice's specific branch)
- **Back button** (if not the first step)

#### Quantity Selection Steps
- Question as heading
- For each quantity choice:
  - Choice label + price per unit (with dollar icon)
  - **Remaining stock badge** (e.g., "5 left") or **"Sold Out" badge** (red)
  - **Minus button** / **Quantity display** (large, bold) / **Plus button**
  - Plus button disabled when at stock limit
  - Sold out items are grayed out with no quantity controls
- **"No thanks" buttons** — simple buttons that skip with zero quantity
- **Back button** + **Next button**
- Inventory refreshes automatically when entering a quantity step
- Stock validation before proceeding (toast if stock changed)

#### Conclusion Steps
- Check icon in green circle
- Thank you message (customizable per step)
- Summary of all previous answers (clickable to go back and edit)
- Quantity answers show itemized breakdown
- Total price calculation
- Inline phone number input (if not yet collected)
- Custom submit button text
- **Back button** + **Submit button**

### Phone Number Collection (separate screen)
- Phone icon + "Contact Information" heading
- "Please provide your phone number so we can reach you."
- **Phone number input** — required, validated for minimum 7 digits
- **Back button** + **Continue button**
- Validates inventory before proceeding to review

### Review Screen
- Heading: "Review Your Answers"
- Subtitle: "Tap any answer to edit it before submitting."
- Each answer displayed in a muted card:
  - Question text
  - Answer (text or itemized quantity breakdown)
  - **Clickable** — navigates back to that step to re-answer
- Phone number card (non-editable from here)
- **Total price summary** (if quantity items with prices)
- **Error recovery block** (if submission failed): "Submission failed. Your answers are safe — you can retry." with Retry button
- **Back button** + **"Submit Booking" button**
  - Shows spinner + "Submitting..." while processing
  - Shows "Checking availability..." during inventory re-validation
  - Retries automatically up to 3 times on failure

### Submission Success Screen
- Large check icon in coral/green circle
- Heading: "Welcome Aboard!"
- "Thank you for your booking. We'll be in touch soon."
- "Redirecting you to available cruises..."
- Cruise/template name badge
- Auto-redirects to `/` after 2 seconds
- Clears draft from localStorage

### Error State (form not found)
- Anchor icon in red circle
- "Form Not Found" heading
- "This booking form is no longer available or the link is invalid."
- "Go to Homepage" button

### Loading State
- Pulsing ship icon
- Skeleton heading and content card

### Draft Persistence
- Auto-saves all form state to localStorage every 500ms (debounced)
- Saves on browser close/tab switch (beforeunload)
- Drafts expire after 24 hours
- Draft cleared on successful submission

### Accessibility
- Screen reader live region for step announcements
- Focus management on step transitions
- ARIA labels on all interactive elements
- Keyboard navigation support (Enter to submit, Back button accessible)

### Footer
- Ship icon + "CruiseBook" text (centered)
