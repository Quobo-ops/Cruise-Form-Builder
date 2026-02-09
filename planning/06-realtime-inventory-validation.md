# 06: Real-Time Inventory Validation During Form Filling

> **Status: Implemented**

## Issue

Currently, inventory/stock availability is only validated AFTER the user completes the entire form. The validation happens at two late points in the public form flow:

1. After phone number entry (`public-form.tsx` around line 293 - `validateInventoryAndProceed`)
2. Before final submission

**Problem flow:**
1. User selects quantities for items (no stock check)
2. User answers more form questions (no stock check)
3. User enters name and phone (stock check happens HERE)
4. User sees "sold out" error after investing time filling the entire form

**Desired flow:**
1. User selects quantities -> immediately sees remaining stock
2. Items that are sold out are disabled/greyed out before selection
3. If stock runs out while user is filling the form, they're notified
4. Final validation still happens at submission (defense in depth)

## Affected Files

| File | Path | Role |
|------|------|------|
| Public Form | `client/src/pages/public-form.tsx` | Quantity step rendering + validation |
| Server Routes | `server/routes.ts` | Inventory check endpoint (lines 580-588) |

## Solution

### Step 1: Display stock availability on quantity steps

The public form already receives inventory data in the API response at `GET /api/forms/:shareId` (routes.ts line 736-744):

```typescript
inventory: inventory.map(item => ({
  stepId: item.stepId,
  choiceId: item.choiceId,
  remaining: item.stockLimit ? Math.max(0, item.stockLimit - item.totalOrdered) : null,
  isSoldOut: item.stockLimit ? item.totalOrdered >= item.stockLimit : false,
}))
```

This data is available when the form loads. Use it to show stock status on quantity choices.

### Step 2: Show remaining stock on quantity choice items

In `public-form.tsx`, where quantity choices are rendered (find the quantity step rendering section), add stock indicators:

```tsx
// For each quantity choice in a quantity step:
const inventoryItem = inventory?.find(
  inv => inv.stepId === currentStepId && inv.choiceId === choice.id
);

const isSoldOut = inventoryItem?.isSoldOut ?? false;
const remaining = inventoryItem?.remaining;

<div className={`quantity-choice ${isSoldOut ? "opacity-50 pointer-events-none" : ""}`}>
  <div className="flex items-center justify-between">
    <span>{choice.label} - ${choice.price.toFixed(2)}</span>
    {remaining !== null && remaining !== undefined && (
      <span className={`text-xs ${remaining <= 5 ? "text-orange-500 font-medium" : "text-muted-foreground"}`}>
        {isSoldOut ? "Sold Out" : `${remaining} remaining`}
      </span>
    )}
  </div>
  {isSoldOut && (
    <Badge variant="destructive" className="text-xs">Sold Out</Badge>
  )}
</div>
```

### Step 3: Cap quantity selectors at remaining stock

When the user adjusts quantity for an item, cap the maximum at the remaining stock:

```tsx
const maxQuantity = remaining !== null && remaining !== undefined
  ? remaining
  : (choice.limit || 99);  // Fall back to choice-level limit or 99

<Input
  type="number"
  min={0}
  max={maxQuantity}
  value={quantitySelections[choice.id] || 0}
  onChange={(e) => {
    const val = Math.min(parseInt(e.target.value) || 0, maxQuantity);
    setQuantitySelections(prev => ({ ...prev, [choice.id]: val }));
  }}
  disabled={isSoldOut}
/>
```

### Step 4: Add a lightweight inventory refresh

Add a periodic or on-focus refresh to catch stock changes while the user is filling the form:

```tsx
// Refresh inventory when the user reaches a quantity step
const refreshInventory = useCallback(async () => {
  if (!shareId) return;
  try {
    const response = await fetch(`/api/forms/${shareId}/inventory`);
    if (response.ok) {
      const data = await response.json();
      setInventory(data.inventory);
    }
  } catch {
    // Silent fail - don't disrupt form filling
  }
}, [shareId]);

// Trigger when entering a quantity step
useEffect(() => {
  const currentStep = graph?.steps[currentStepId];
  if (currentStep?.type === "quantity") {
    refreshInventory();
  }
}, [currentStepId]);
```

### Step 5: Add server endpoint for lightweight inventory check

In `server/routes.ts`, add a public inventory-only endpoint:

```typescript
// Lightweight inventory check for active form sessions
app.get("/api/forms/:shareId/inventory", async (req, res) => {
  try {
    const cruise = await storage.getCruiseByShareId(req.params.shareId);
    if (!cruise || !cruise.isPublished || !cruise.isActive) {
      return res.status(404).json({ error: "Form not found" });
    }
    const inventory = await storage.getCruiseInventory(cruise.id);
    res.json({
      inventory: inventory.map(item => ({
        stepId: item.stepId,
        choiceId: item.choiceId,
        remaining: item.stockLimit ? Math.max(0, item.stockLimit - item.totalOrdered) : null,
        isSoldOut: item.stockLimit ? item.totalOrdered >= item.stockLimit : false,
      }))
    });
  } catch (error) {
    console.error("Get form inventory error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
```

### Step 6: Show inline warning if selection exceeds new stock

After an inventory refresh, if the user's current selections exceed the new remaining stock, show a warning:

```tsx
useEffect(() => {
  if (!inventory) return;
  const currentStep = graph?.steps[currentStepId];
  if (currentStep?.type !== "quantity") return;

  const overStockItems: string[] = [];
  for (const [choiceId, qty] of Object.entries(quantitySelections)) {
    const inv = inventory.find(i => i.stepId === currentStepId && i.choiceId === choiceId);
    if (inv?.remaining !== null && inv?.remaining !== undefined && qty > inv.remaining) {
      overStockItems.push(choiceId);
      // Auto-cap the quantity
      setQuantitySelections(prev => ({ ...prev, [choiceId]: inv.remaining }));
    }
  }

  if (overStockItems.length > 0) {
    toast({
      title: "Stock updated",
      description: "Some item quantities were adjusted due to stock changes.",
      variant: "destructive",
    });
  }
}, [inventory]);
```

### Step 7: Keep final validation as defense in depth

The existing `validateInventoryAndProceed` function and the server-side `checkAndUpdateInventory` (routes.ts line 809) remain unchanged. They serve as the authoritative final check. The client-side inventory display is advisory (helps UX) but not a security boundary.

## Data Flow

```
Form loads (GET /api/forms/:shareId)
  -> Response includes inventory array
  -> Stored in state: setInventory(data.inventory)

User reaches a quantity step
  -> GET /api/forms/:shareId/inventory (lightweight refresh)
  -> Update inventory state
  -> Render choices with:
     - Remaining count badge
     - Sold-out items disabled
     - Max quantity capped at remaining

User selects quantities
  -> Client-side max enforced
  -> If inventory changes mid-session, quantities auto-capped

User proceeds to phone/review
  -> validateInventoryAndProceed() runs (existing)
  -> Server-side atomic check on submit (existing)
  -> Double-validation ensures no overselling
```

## Annotations

- **Not a security boundary**: Client-side stock display is for UX only. The server-side atomic transaction in `checkAndUpdateInventory` (storage.ts) is the real guard against overselling.
- **No race condition introduced**: The lightweight inventory endpoint is read-only. The write (stock decrement) only happens during submission in an atomic transaction.
- **Rate limiting**: The `/api/forms/:shareId/inventory` endpoint should be lightweight enough to not need rate limiting since it's a simple DB read. However, if abuse is a concern, a simple per-IP limiter can be added.
- **Graceful degradation**: If the inventory refresh fails (network error), the form continues to work with stale data. The final server-side check catches any issues.
- **Existing validateInventoryAndProceed preserved**: The current validation at phone entry and review stages remains as a safety net.

## Verification

1. Create a cruise with quantity items, set stock limit to 5
2. Open public form -> quantity step shows "5 remaining"
3. Select quantity 3 -> shows "5 remaining" still (hasn't refreshed yet)
4. In another tab, submit a form with quantity 3 -> stock goes to 2 remaining
5. Navigate away from and back to quantity step -> refreshes, shows "2 remaining"
6. Try to select quantity 4 -> capped to 2
7. Item with 0 remaining shows "Sold Out" and is disabled
8. Final submission still validates server-side
