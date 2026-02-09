# 15: Email Notification System

## Issue

The application has scaffolding for email notifications but no actual email delivery:

1. **Schema exists**: `notificationSettings` table in `shared/schema.ts` (lines 197-204) with `emailOnSubmission` boolean and `emailAddress` text field
2. **Storage methods exist**: `getNotificationSettings` and `upsertNotificationSettings` in `server/storage.ts` (lines 493-513)
3. **API endpoints exist**: `GET /api/notification-settings` and `PUT /api/notification-settings` in `server/routes.ts`
4. **Missing**: No email-sending library, no email templates, no trigger to send emails when submissions are created

When a customer submits a booking form, the admin only sees it by manually checking the dashboard. For a booking-centric business, this delay can mean missed opportunities and poor response times.

## Affected Files

| File | Path | Role |
|------|------|------|
| Package Config | `package.json` | Add email library dependency |
| Email Service | `server/email.ts` | New: email sending service |
| Server Routes | `server/routes.ts` | Trigger email after submission creation |
| Storage | `server/storage.ts` | Query notification settings for active users |
| Schema | `shared/schema.ts` | Minor: add email verification fields if needed |
| Admin Dashboard | `client/src/pages/admin-dashboard.tsx` | Notification settings UI (may already exist partially) |

## Solution

### Step 1: Add email dependency

Add a lightweight email library. Two options:

**Option A: Nodemailer** (self-hosted SMTP)
```bash
npm install nodemailer
npm install -D @types/nodemailer
```

**Option B: Resend** (managed API, simpler setup)
```bash
npm install resend
```

Recommendation: Start with **Nodemailer** for flexibility (works with any SMTP provider -- Gmail, SendGrid, AWS SES, Mailgun). Add `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` to environment variables.

### Step 2: Create email service module

Create `server/email.ts`:

```typescript
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM_ADDRESS = process.env.SMTP_FROM || "noreply@cruisebook.app";

export interface SubmissionEmailData {
  cruiseName: string;
  customerName: string;
  customerPhone: string;
  submissionId: string;
  formName?: string;
  answerSummary: string; // Pre-formatted text summary of answers
  submissionCount: number; // Total submissions for this cruise
  cruiseDetailUrl: string;
}

export async function sendSubmissionNotification(
  recipientEmail: string,
  data: SubmissionEmailData
): Promise<boolean> {
  try {
    await transporter.sendMail({
      from: FROM_ADDRESS,
      to: recipientEmail,
      subject: `New booking submission for ${data.cruiseName} - ${data.customerName}`,
      html: buildSubmissionEmailHtml(data),
      text: buildSubmissionEmailText(data),
    });
    return true;
  } catch (error) {
    console.error("Failed to send submission notification:", error);
    return false;
  }
}

function buildSubmissionEmailHtml(data: SubmissionEmailData): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>New Booking Submission</h2>
      <p><strong>Cruise:</strong> ${data.cruiseName}</p>
      <p><strong>Customer:</strong> ${data.customerName}</p>
      <p><strong>Phone:</strong> ${data.customerPhone}</p>
      ${data.formName ? `<p><strong>Form:</strong> ${data.formName}</p>` : ""}
      <hr />
      <h3>Answers</h3>
      <pre style="background: #f5f5f5; padding: 12px; border-radius: 4px; white-space: pre-wrap;">${data.answerSummary}</pre>
      <hr />
      <p style="color: #666; font-size: 14px;">
        This is submission #${data.submissionCount} for this cruise.
      </p>
      <p>
        <a href="${data.cruiseDetailUrl}" style="display: inline-block; padding: 10px 20px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px;">
          View in Dashboard
        </a>
      </p>
    </div>
  `;
}

function buildSubmissionEmailText(data: SubmissionEmailData): string {
  return [
    `New Booking Submission`,
    `Cruise: ${data.cruiseName}`,
    `Customer: ${data.customerName}`,
    `Phone: ${data.customerPhone}`,
    data.formName ? `Form: ${data.formName}` : "",
    ``,
    `Answers:`,
    data.answerSummary,
    ``,
    `Submission #${data.submissionCount}`,
    `View in dashboard: ${data.cruiseDetailUrl}`,
  ].filter(Boolean).join("\n");
}

export function isEmailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}
```

### Step 3: Trigger email on submission creation

In `server/routes.ts`, after the submission is successfully created (in the `POST /api/forms/:shareId/submit` handler), add a fire-and-forget email notification:

```typescript
// After: const submission = await storage.createSubmission({ ... });
// After: audit(req, "submission.create", ...);

// Fire-and-forget email notification
if (isEmailConfigured() && cruise) {
  (async () => {
    try {
      // Get all users with email notifications enabled
      const usersWithNotifications = await storage.getUsersWithEmailNotifications();
      if (usersWithNotifications.length === 0) return;

      const submissionCount = await storage.getSubmissionCountByCruise(cruise.id);
      const answerSummary = formatAnswersForEmail(submission.answers, template.graph);
      const baseUrl = `${req.protocol}://${req.get("host")}`;

      for (const user of usersWithNotifications) {
        await sendSubmissionNotification(user.emailAddress!, {
          cruiseName: cruise.name,
          customerName: submission.customerName || "Anonymous",
          customerPhone: submission.customerPhone || "Not provided",
          submissionId: submission.id,
          answerSummary,
          submissionCount,
          cruiseDetailUrl: `${baseUrl}/admin/cruises/${cruise.id}`,
        });
      }
    } catch (error) {
      console.error("Email notification error (non-blocking):", error);
    }
  })();
}
```

### Step 4: Add storage method for users with notifications enabled

In `server/storage.ts`, add:

```typescript
async getUsersWithEmailNotifications(): Promise<NotificationSettings[]> {
  return await db.select()
    .from(notificationSettings)
    .where(
      and(
        eq(notificationSettings.emailOnSubmission, true),
        sql`${notificationSettings.emailAddress} IS NOT NULL AND ${notificationSettings.emailAddress} != ''`
      )
    );
}
```

Add this method to the `IStorage` interface as well.

### Step 5: Format answers for email

Create a helper to convert the JSONB answers into a readable summary:

```typescript
function formatAnswersForEmail(
  answers: Record<string, string | QuantityAnswer[]>,
  graph: FormGraph
): string {
  const lines: string[] = [];
  for (const [stepId, answer] of Object.entries(answers)) {
    const step = graph.steps[stepId];
    const question = step?.question || stepId;

    if (typeof answer === "string") {
      lines.push(`${question}: ${answer}`);
    } else if (Array.isArray(answer)) {
      // Quantity answers
      const items = answer
        .filter((a: QuantityAnswer) => a.quantity > 0)
        .map((a: QuantityAnswer) => `  - ${a.label}: ${a.quantity} x $${a.price.toFixed(2)}`)
        .join("\n");
      if (items) {
        lines.push(`${question}:\n${items}`);
      }
    }
  }
  return lines.join("\n\n");
}
```

### Step 6: Notification settings UI

If no settings UI exists yet, add a settings section accessible from the admin dashboard. This could be a dialog triggered by a "Settings" button in the dashboard header:

```tsx
<Dialog>
  <DialogTrigger asChild>
    <Button variant="ghost" className="gap-2">
      <Bell className="w-4 h-4" />
      Notifications
    </Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Email Notifications</DialogTitle>
    </DialogHeader>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label htmlFor="email-on-submission">Email me on new submissions</Label>
        <Switch
          id="email-on-submission"
          checked={settings.emailOnSubmission}
          onCheckedChange={(checked) => updateSettings({ emailOnSubmission: checked })}
        />
      </div>
      <div>
        <Label htmlFor="email-address">Email address</Label>
        <Input
          id="email-address"
          type="email"
          value={settings.emailAddress || ""}
          onChange={(e) => updateSettings({ emailAddress: e.target.value })}
          placeholder="admin@example.com"
        />
      </div>
    </div>
  </DialogContent>
</Dialog>
```

### Step 7: Graceful degradation when SMTP is not configured

The `isEmailConfigured()` check ensures that:
- If no SMTP env vars are set, the email code path is never entered
- No errors or warnings in development environments
- The notification settings UI can still be shown (settings are saved for when SMTP is configured)

Optionally, show a banner in the settings dialog when SMTP is not configured:

```tsx
{!smtpConfigured && (
  <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-md p-3 text-sm">
    Email delivery is not configured. Contact your administrator to set up SMTP credentials.
  </div>
)}
```

## Data Flow

```
Customer submits form (POST /api/forms/:shareId/submit)
  -> Submission created in database
  -> Audit event logged (existing)
  -> Email notification triggered (fire-and-forget):
    1. Query notificationSettings for users with emailOnSubmission=true
    2. For each user with a valid emailAddress:
       a. Format submission answers into readable text
       b. Build HTML + plain text email
       c. Send via SMTP transporter
    3. Log any errors but never block the submission response

Admin configures notifications:
  -> Dashboard -> Notifications settings dialog
  -> PUT /api/notification-settings { emailOnSubmission: true, emailAddress: "..." }
  -> Settings saved to notificationSettings table
  -> Next submission triggers email to this address
```

## Annotations

- **Fire-and-forget**: Email sending must never delay or fail the submission response. The async IIFE pattern ensures this. If email fails, the submission is still saved.
- **No email queue**: For simplicity, emails are sent inline (async). If volume grows, consider adding a job queue (e.g., BullMQ with Redis) for retry logic and rate limiting. This is not needed for the initial implementation.
- **SMTP provider flexibility**: Nodemailer works with any SMTP provider. Common options: Gmail (low volume), SendGrid (free tier: 100/day), AWS SES (cheap at scale), Mailgun, Postmark.
- **Environment variables**: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE`. These should be documented in the README.
- **Security**: Email addresses are stored in plain text in the database. This is acceptable for admin notification emails but should be reconsidered if customer emails are ever stored (GDPR/privacy).
- **Future: customer confirmation emails**: This plan only covers admin notifications. Sending confirmation emails to customers who submit forms would require collecting customer email (new form field) and a separate opt-in flow.

## Verification

1. Set SMTP env vars (use a test account like Mailtrap or Gmail)
2. Enable email notifications in settings dialog with a valid email
3. Submit a form publicly -> email received within seconds
4. Email contains cruise name, customer name, phone, answers, link to dashboard
5. Disable email notifications -> no email sent on next submission
6. Remove SMTP env vars -> no errors, submission still works
7. Submit form with quantity answers -> email shows formatted item list with prices
8. Multiple users with notifications -> each receives their own email
9. Invalid email address -> error logged, submission not affected
10. Settings dialog shows SMTP not configured warning when env vars missing
