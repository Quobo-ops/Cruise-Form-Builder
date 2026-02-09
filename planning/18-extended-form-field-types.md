# 18: Extended Form Field Types

## Issue

The form builder currently supports only four step types (defined in `shared/schema.ts` line 30):

```typescript
type: z.enum(["choice", "text", "quantity", "conclusion"])
```

This limits the kinds of data cruise operators can collect. Real-world booking and pre-cruise workflows need:

- **Email addresses** (with validation) for confirmation emails and marketing
- **Date selection** (e.g., preferred embarkation date, birthday for passenger manifest)
- **Phone numbers** (formatted, currently only collected at submission time -- not as a form step)
- **Long text / textarea** (dietary restrictions, special requests, medical notes)
- **File uploads** (passport scans, vaccination records, travel documents)
- **Rating / NPS** (post-cruise feedback, satisfaction surveys)

Currently, operators work around these limitations by using "text" steps for everything (email, date, phone) with no format validation, which results in messy data.

## Affected Files

| File | Path | Role |
|------|------|------|
| Schema | `shared/schema.ts` | Add new step types to the enum |
| Form Builder | `client/src/components/decision-tree-editor.tsx` | New step type options in builder |
| Public Form | `client/src/pages/public-form.tsx` | Render new input types |
| Form Preview | `client/src/pages/form-preview.tsx` | Preview rendering for new types |
| Submission View | `client/src/pages/cruise-detail.tsx` | Display new answer types in submission details |
| CSV Export | `server/routes.ts` | Format new answer types for CSV export |

## Solution

### Step 1: Extend the step type enum

In `shared/schema.ts`, expand the type enum:

```typescript
export const stepSchema = z.object({
  id: z.string(),
  type: z.enum([
    "choice",       // Existing: single select from options
    "text",         // Existing: single-line text input
    "quantity",     // Existing: quantity selectors with pricing
    "conclusion",   // Existing: form end / thank-you
    "email",        // NEW: email input with validation
    "date",         // NEW: date picker
    "phone",        // NEW: formatted phone input
    "textarea",     // NEW: multi-line text area
    "file",         // NEW: file upload
    "rating",       // NEW: 1-5 star / numeric rating
  ]),
  question: z.string(),
  placeholder: z.string().optional(),
  // Existing fields...
  choices: z.array(z.object({
    id: z.string(),
    label: z.string(),
    nextStepId: z.string().nullable(),
  })).optional(),
  quantityChoices: z.array(quantityChoiceSchema).optional(),
  nextStepId: z.string().nullable().optional(),
  thankYouMessage: z.string().optional(),
  submitButtonText: z.string().optional(),
  infoPopup: infoPopupSchema.optional(),
  // NEW field-type-specific configuration
  fieldConfig: z.object({
    required: z.boolean().optional().default(true),
    // Date-specific
    minDate: z.string().optional(),       // ISO date string
    maxDate: z.string().optional(),       // ISO date string
    // Textarea-specific
    maxLength: z.number().optional(),     // Character limit
    rows: z.number().optional().default(4),
    // File-specific
    acceptedTypes: z.array(z.string()).optional(), // e.g. [".pdf", ".jpg", ".png"]
    maxFileSizeMb: z.number().optional().default(10),
    // Rating-specific
    maxRating: z.number().optional().default(5),
    ratingLabels: z.object({
      low: z.string().optional(),         // e.g. "Poor"
      high: z.string().optional(),        // e.g. "Excellent"
    }).optional(),
    // Phone-specific
    defaultCountryCode: z.string().optional().default("+1"),
  }).optional(),
});
```

### Step 2: Form builder -- add new step types to the "Add Step" menu

In `decision-tree-editor.tsx`, update the step type selector dropdown to include new types:

```tsx
const stepTypes = [
  { value: "choice", label: "Multiple Choice", icon: ListChecks, description: "Single select from options" },
  { value: "text", label: "Short Text", icon: Type, description: "Single-line text input" },
  { value: "textarea", label: "Long Text", icon: AlignLeft, description: "Multi-line text area" },
  { value: "quantity", label: "Quantity", icon: Hash, description: "Quantity selectors with pricing" },
  { value: "email", label: "Email", icon: Mail, description: "Email address with validation" },
  { value: "phone", label: "Phone", icon: Phone, description: "Formatted phone number" },
  { value: "date", label: "Date", icon: Calendar, description: "Date picker" },
  { value: "rating", label: "Rating", icon: Star, description: "Star rating (1-5)" },
  { value: "file", label: "File Upload", icon: Upload, description: "Document or image upload" },
  { value: "conclusion", label: "Conclusion", icon: CheckCircle, description: "Form end / thank you" },
];
```

### Step 3: Form builder -- field configuration panel

When a new step type is selected, show relevant configuration options in the step editor:

```tsx
{step.type === "date" && (
  <div className="space-y-2">
    <Label>Minimum Date</Label>
    <Input type="date" value={step.fieldConfig?.minDate || ""} onChange={...} />
    <Label>Maximum Date</Label>
    <Input type="date" value={step.fieldConfig?.maxDate || ""} onChange={...} />
  </div>
)}

{step.type === "textarea" && (
  <div className="space-y-2">
    <Label>Max Characters</Label>
    <Input type="number" value={step.fieldConfig?.maxLength || ""} onChange={...} />
    <Label>Rows</Label>
    <Input type="number" min={2} max={10} value={step.fieldConfig?.rows || 4} onChange={...} />
  </div>
)}

{step.type === "file" && (
  <div className="space-y-2">
    <Label>Accepted File Types</Label>
    <Input placeholder=".pdf, .jpg, .png" value={step.fieldConfig?.acceptedTypes?.join(", ") || ""} onChange={...} />
    <Label>Max File Size (MB)</Label>
    <Input type="number" value={step.fieldConfig?.maxFileSizeMb || 10} onChange={...} />
  </div>
)}

{step.type === "rating" && (
  <div className="space-y-2">
    <Label>Max Rating</Label>
    <Input type="number" min={3} max={10} value={step.fieldConfig?.maxRating || 5} onChange={...} />
    <div className="grid grid-cols-2 gap-2">
      <div>
        <Label>Low Label</Label>
        <Input placeholder="Poor" value={step.fieldConfig?.ratingLabels?.low || ""} onChange={...} />
      </div>
      <div>
        <Label>High Label</Label>
        <Input placeholder="Excellent" value={step.fieldConfig?.ratingLabels?.high || ""} onChange={...} />
      </div>
    </div>
  </div>
)}
```

### Step 4: Public form -- render new input types

In `public-form.tsx`, add rendering for each new step type in the step rendering section:

**Email:**
```tsx
case "email":
  return (
    <Input
      type="email"
      placeholder={step.placeholder || "your@email.com"}
      value={answers[step.id] as string || ""}
      onChange={(e) => setAnswer(step.id, e.target.value)}
    />
  );
  // Validate on "Next": /^[^\s@]+@[^\s@]+\.[^\s@]+$/
```

**Date:**
```tsx
case "date":
  return (
    <Input
      type="date"
      min={step.fieldConfig?.minDate}
      max={step.fieldConfig?.maxDate}
      value={answers[step.id] as string || ""}
      onChange={(e) => setAnswer(step.id, e.target.value)}
    />
  );
```

**Phone:**
```tsx
case "phone":
  return (
    <Input
      type="tel"
      placeholder={step.placeholder || "(555) 123-4567"}
      value={answers[step.id] as string || ""}
      onChange={(e) => setAnswer(step.id, formatPhoneNumber(e.target.value))}
    />
  );
  // Auto-format as user types: (XXX) XXX-XXXX
```

**Textarea:**
```tsx
case "textarea":
  return (
    <div>
      <Textarea
        placeholder={step.placeholder || "Type your response..."}
        rows={step.fieldConfig?.rows || 4}
        maxLength={step.fieldConfig?.maxLength}
        value={answers[step.id] as string || ""}
        onChange={(e) => setAnswer(step.id, e.target.value)}
      />
      {step.fieldConfig?.maxLength && (
        <p className="text-xs text-muted-foreground mt-1">
          {(answers[step.id] as string || "").length} / {step.fieldConfig.maxLength}
        </p>
      )}
    </div>
  );
```

**Rating:**
```tsx
case "rating":
  const maxRating = step.fieldConfig?.maxRating || 5;
  const currentRating = parseInt(answers[step.id] as string || "0");
  return (
    <div>
      <div className="flex gap-1">
        {Array.from({ length: maxRating }, (_, i) => (
          <button
            key={i}
            onClick={() => setAnswer(step.id, String(i + 1))}
            className="p-1 transition-colors"
          >
            <Star
              className={`w-8 h-8 ${i < currentRating
                ? "fill-yellow-400 text-yellow-400"
                : "text-muted-foreground"
              }`}
            />
          </button>
        ))}
      </div>
      {step.fieldConfig?.ratingLabels && (
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>{step.fieldConfig.ratingLabels.low}</span>
          <span>{step.fieldConfig.ratingLabels.high}</span>
        </div>
      )}
    </div>
  );
```

**File Upload:**
```tsx
case "file":
  return (
    <div>
      <Input
        type="file"
        accept={step.fieldConfig?.acceptedTypes?.join(",")}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (step.fieldConfig?.maxFileSizeMb && file.size > step.fieldConfig.maxFileSizeMb * 1024 * 1024) {
            toast({ title: "File too large", variant: "destructive" });
            return;
          }
          // Upload to object storage via existing Uppy/S3 integration
          const url = await uploadFile(file);
          setAnswer(step.id, url);
        }}
      />
      {answers[step.id] && (
        <p className="text-sm text-muted-foreground mt-1">File uploaded successfully</p>
      )}
    </div>
  );
```

### Step 5: Validation for new types

Add client-side validation when the user clicks "Next":

```typescript
function validateStepAnswer(step: Step, answer: string | QuantityAnswer[]): string | null {
  if (!answer && step.fieldConfig?.required !== false) {
    return "This field is required";
  }
  if (typeof answer !== "string") return null;

  switch (step.type) {
    case "email":
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answer)) {
        return "Please enter a valid email address";
      }
      break;
    case "phone":
      if (answer.replace(/\D/g, "").length < 7) {
        return "Please enter a valid phone number";
      }
      break;
    case "date":
      if (step.fieldConfig?.minDate && answer < step.fieldConfig.minDate) {
        return `Date must be after ${step.fieldConfig.minDate}`;
      }
      if (step.fieldConfig?.maxDate && answer > step.fieldConfig.maxDate) {
        return `Date must be before ${step.fieldConfig.maxDate}`;
      }
      break;
    case "textarea":
      if (step.fieldConfig?.maxLength && answer.length > step.fieldConfig.maxLength) {
        return `Maximum ${step.fieldConfig.maxLength} characters`;
      }
      break;
    case "rating":
      const rating = parseInt(answer);
      if (isNaN(rating) || rating < 1 || rating > (step.fieldConfig?.maxRating || 5)) {
        return "Please select a rating";
      }
      break;
  }
  return null; // Valid
}
```

### Step 6: Graph behavior for new types

All new types behave like the existing "text" type in terms of graph navigation: they have a `nextStepId` field and advance linearly (no branching). Only "choice" type supports branching via per-choice `nextStepId`.

No changes needed to the graph traversal logic.

### Step 7: CSV export formatting

In `server/routes.ts`, update the CSV export to handle new answer types:

```typescript
// In the CSV export handler:
function formatAnswerForCsv(answer: string | QuantityAnswer[]): string {
  if (typeof answer === "string") {
    // File URLs: just include the URL
    // Dates: already ISO format
    // Ratings: just the number
    // Everything else: the string value
    return answer;
  }
  // Quantity answers: existing formatting
  return answer.map(a => `${a.label}: ${a.quantity} x $${a.price}`).join("; ");
}
```

### Step 8: Submission detail display

In `cruise-detail.tsx` submission detail view, render new types appropriately:

```tsx
// File answers: render as clickable link
{isFileUrl(answer) && (
  <a href={answer} target="_blank" className="text-primary underline">View uploaded file</a>
)}

// Rating answers: render as stars
{step.type === "rating" && (
  <div className="flex gap-0.5">
    {Array.from({ length: parseInt(answer) }, (_, i) => (
      <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
    ))}
  </div>
)}

// Date answers: format to locale string
{step.type === "date" && (
  <span>{new Date(answer).toLocaleDateString()}</span>
)}
```

## Data Flow

```
Admin builds form with new field types
  -> Form builder shows expanded step type menu
  -> Admin selects "email" step type -> configures placeholder
  -> Admin selects "date" step type -> sets min/max dates
  -> Admin selects "rating" step type -> sets max rating and labels
  -> Graph saved with new step types (backward compatible -- just new enum values)

Customer fills form
  -> Public form encounters "email" step -> shows email input with validation
  -> Customer enters email -> validated on "Next" click
  -> Public form encounters "date" step -> shows date picker
  -> Public form encounters "rating" step -> shows star selector
  -> Answers saved as strings (same format as text answers)

Admin views submission
  -> Submission detail shows formatted answers
  -> Email: clickable mailto link
  -> Date: formatted locale date
  -> Rating: star visualization
  -> File: clickable download link
```

## Annotations

- **Backward compatible**: New step types are additive to the enum. Existing forms with "choice", "text", "quantity", "conclusion" continue to work unchanged. The `fieldConfig` field is optional.
- **Answers remain strings**: All new types store answers as strings (email address, ISO date, phone number, rating number, file URL). No changes needed to the `answers` JSONB column format.
- **File upload reuses existing infrastructure**: The application already has Uppy with S3/Google Cloud Storage integration for learn-more images. File upload steps use the same upload pipeline.
- **No server-side validation yet**: Server-side validation of new field types (email format, date range) should be added to the submission endpoint for defense-in-depth. Client-side validation is sufficient for UX but not security.
- **Progressive rollout**: Implement types in phases. Phase 1: email, phone, textarea (simple text variants). Phase 2: date, rating (need UI components). Phase 3: file upload (needs storage integration).
- **Graph traversal unchanged**: All new types use `nextStepId` for linear navigation, same as "text" type. No branching support needed.

## Verification

1. Form builder: "Add Step" menu shows all new types with icons
2. Select "email" type -> shows email-specific placeholder
3. Select "date" type -> shows min/max date config
4. Select "rating" type -> shows max rating and label config
5. Select "textarea" type -> shows rows and max length config
6. Select "file" type -> shows accepted types and max size config
7. Public form: email step validates format on "Next"
8. Public form: date step respects min/max constraints
9. Public form: rating step shows clickable stars
10. Public form: textarea shows character count
11. Public form: file upload works and shows success message
12. Submission detail: each type renders appropriately
13. CSV export: all types export cleanly
14. Existing forms with old types: no regressions
15. Form preview: all new types render correctly
