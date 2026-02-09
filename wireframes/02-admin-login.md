# Admin Login

**Route:** `/admin/login`  
**File:** `client/src/pages/admin-login.tsx`  
**Audience:** Admin users

---

## What the User Sees & Can Do

### Header
- CruiseBook logo (ship icon + "CruiseBook" text) — links back to `/`
- Theme toggle button (light/dark mode)

### Main Content
- "Back to home" link with left arrow — navigates to `/`
- **Login card centered on page:**
  - Heading: "Admin Login"
  - Subtitle: "Sign in to manage your booking forms"
  - **Username field** — text input, placeholder "Enter your username", required
  - **Password field** — password input, placeholder "Enter your password", required
  - **"Sign In" button** — submits the login form
    - Shows loading spinner + "Signing in..." text while authenticating
    - On success: toast "Welcome back!" and redirect to `/admin/dashboard`
    - On failure: toast with error message "Login failed"

### Background
- Subtle gradient from background to primary/5
