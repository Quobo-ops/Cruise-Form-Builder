import { describe, it, expect } from "vitest";
import { z } from "zod";
import { graphSchema, quantityAnswerSchema } from "@shared/schema";

/**
 * Integration-style tests that validate the API contracts,
 * pagination logic, CSV export formatting, rate limiter behavior,
 * and audit log schema without requiring a running database.
 */

// ─── Pagination Logic Tests ─────────────────────────────────────────────────

describe("Pagination", () => {
  function paginate<T>(items: T[], page: number, limit: number) {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safePage = Math.max(page, 1);
    const offset = (safePage - 1) * safeLimit;
    const data = items.slice(offset, offset + safeLimit);
    return {
      data,
      total: items.length,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(items.length / safeLimit),
    };
  }

  const items = Array.from({ length: 55 }, (_, i) => ({ id: i + 1 }));

  it("returns first page with correct metadata", () => {
    const result = paginate(items, 1, 20);
    expect(result.data).toHaveLength(20);
    expect(result.total).toBe(55);
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(3);
  });

  it("returns last page with remaining items", () => {
    const result = paginate(items, 3, 20);
    expect(result.data).toHaveLength(15);
    expect(result.page).toBe(3);
  });

  it("returns empty data for page beyond total", () => {
    const result = paginate(items, 10, 20);
    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(55);
  });

  it("clamps limit to max 100", () => {
    const result = paginate(items, 1, 500);
    expect(result.limit).toBe(100);
  });

  it("handles page=0 as page=1", () => {
    const result = paginate(items, 0, 20);
    expect(result.page).toBe(1);
    expect(result.data).toHaveLength(20);
  });

  it("handles empty collections", () => {
    const result = paginate([], 1, 20);
    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
  });

  it("single item collection", () => {
    const result = paginate([{ id: 1 }], 1, 20);
    expect(result.data).toHaveLength(1);
    expect(result.totalPages).toBe(1);
  });
});

// ─── CSV Export Formatting Tests ────────────────────────────────────────────

describe("CSV Export", () => {
  function escapeCsvField(value: string): string {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  function formatQuantityAnswer(answers: Array<{ quantity: number; label: string; price: number }>): string {
    return answers
      .filter(a => a.quantity > 0)
      .map(a => `${a.quantity}x ${a.label} ($${a.price})`)
      .join("; ");
  }

  it("escapes fields containing commas", () => {
    expect(escapeCsvField("hello, world")).toBe('"hello, world"');
  });

  it("escapes fields containing double quotes", () => {
    expect(escapeCsvField('say "hello"')).toBe('"say ""hello"""');
  });

  it("escapes fields containing newlines", () => {
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
  });

  it("does not escape plain fields", () => {
    expect(escapeCsvField("hello")).toBe("hello");
  });

  it("handles empty string", () => {
    expect(escapeCsvField("")).toBe("");
  });

  it("formats quantity answers correctly", () => {
    const answers = [
      { quantity: 2, label: "Kayak Tour", price: 50 },
      { quantity: 0, label: "Snorkel Set", price: 25 },
      { quantity: 1, label: "Spa Package", price: 100 },
    ];
    expect(formatQuantityAnswer(answers)).toBe("2x Kayak Tour ($50); 1x Spa Package ($100)");
  });

  it("handles all-zero quantities", () => {
    const answers = [
      { quantity: 0, label: "A", price: 10 },
      { quantity: 0, label: "B", price: 20 },
    ];
    expect(formatQuantityAnswer(answers)).toBe("");
  });

  it("generates valid CSV row from mixed data", () => {
    const row = [
      "sub-123",
      "John Doe",
      "+1 555 123 4567",
      "2026-01-15T10:30:00.000Z",
      "VIP Package",
      "2x Kayak ($50); 1x Spa ($100)",
    ];
    const csvRow = row.map(escapeCsvField).join(",");
    expect(csvRow).toBe(
      "sub-123,John Doe,+1 555 123 4567,2026-01-15T10:30:00.000Z,VIP Package,2x Kayak ($50); 1x Spa ($100)"
    );
  });

  it("properly escapes customer names with special characters", () => {
    const row = ['O\'Brien, "The Great"', "+1 555,000,1234"];
    const csvRow = row.map(escapeCsvField).join(",");
    expect(csvRow).toContain('"');
  });
});

// ─── Rate Limiter Tests ─────────────────────────────────────────────────────

describe("RateLimiter", () => {
  class RateLimiter {
    private entries = new Map<string, { count: number; resetAt: number }>();

    constructor(private windowMs: number, private maxRequests: number) {}

    check(key: string): boolean {
      const now = Date.now();
      const entry = this.entries.get(key);

      if (!entry || now >= entry.resetAt) {
        this.entries.set(key, { count: 1, resetAt: now + this.windowMs });
        return true;
      }

      if (entry.count >= this.maxRequests) {
        return false;
      }

      entry.count++;
      return true;
    }
  }

  it("allows requests within limit", () => {
    const limiter = new RateLimiter(60000, 5);
    for (let i = 0; i < 5; i++) {
      expect(limiter.check("ip1")).toBe(true);
    }
  });

  it("blocks requests exceeding limit", () => {
    const limiter = new RateLimiter(60000, 3);
    expect(limiter.check("ip1")).toBe(true);
    expect(limiter.check("ip1")).toBe(true);
    expect(limiter.check("ip1")).toBe(true);
    expect(limiter.check("ip1")).toBe(false);
    expect(limiter.check("ip1")).toBe(false);
  });

  it("tracks different keys independently", () => {
    const limiter = new RateLimiter(60000, 2);
    expect(limiter.check("ip1")).toBe(true);
    expect(limiter.check("ip1")).toBe(true);
    expect(limiter.check("ip1")).toBe(false);
    expect(limiter.check("ip2")).toBe(true); // Different key, should work
  });

  it("supports namespaced keys for login vs submission", () => {
    const limiter = new RateLimiter(60000, 2);
    expect(limiter.check("login:192.168.1.1")).toBe(true);
    expect(limiter.check("login:192.168.1.1")).toBe(true);
    expect(limiter.check("login:192.168.1.1")).toBe(false);
    expect(limiter.check("submit:192.168.1.1")).toBe(true); // Different namespace
  });

  it("resets after window expires", () => {
    const limiter = new RateLimiter(10, 1); // 10ms window
    expect(limiter.check("ip1")).toBe(true);
    expect(limiter.check("ip1")).toBe(false);

    // Wait for window to expire
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(limiter.check("ip1")).toBe(true);
        resolve();
      }, 20);
    });
  });

  it("allows first request for new IP", () => {
    const limiter = new RateLimiter(60000, 10);
    expect(limiter.check("brand-new-ip")).toBe(true);
  });
});

// ─── Audit Log Schema Tests ────────────────────────────────────────────────

describe("Audit Log Schema", () => {
  const auditLogSchema = z.object({
    userId: z.string().nullable(),
    action: z.string().min(1),
    entityType: z.string().min(1),
    entityId: z.string().nullable(),
    details: z.record(z.unknown()).nullable(),
    ipAddress: z.string().nullable(),
  });

  it("validates a complete audit log entry", () => {
    const result = auditLogSchema.safeParse({
      userId: "user-123",
      action: "template.create",
      entityType: "template",
      entityId: "tmpl-456",
      details: { name: "My Template" },
      ipAddress: "192.168.1.1",
    });
    expect(result.success).toBe(true);
  });

  it("validates audit log with null userId (public action)", () => {
    const result = auditLogSchema.safeParse({
      userId: null,
      action: "submission.create",
      entityType: "submission",
      entityId: "sub-789",
      details: { cruiseId: "cruise-123", customerPhone: "+1555000" },
      ipAddress: "10.0.0.1",
    });
    expect(result.success).toBe(true);
  });

  it("validates audit log with null details", () => {
    const result = auditLogSchema.safeParse({
      userId: "user-123",
      action: "auth.login",
      entityType: "user",
      entityId: "user-123",
      details: null,
      ipAddress: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects audit log with empty action", () => {
    const result = auditLogSchema.safeParse({
      userId: "user-123",
      action: "",
      entityType: "template",
      entityId: null,
      details: null,
      ipAddress: null,
    });
    expect(result.success).toBe(false);
  });

  it("validates all expected action types", () => {
    const actions = [
      "auth.login",
      "auth.login_failed",
      "template.create",
      "template.update",
      "template.delete",
      "template.duplicate",
      "template.publish",
      "cruise.create",
      "cruise.update",
      "cruise.delete",
      "inventory.update_limit",
      "submission.create",
      "submission.export",
    ];

    for (const action of actions) {
      const result = auditLogSchema.safeParse({
        userId: "user-1",
        action,
        entityType: action.split(".")[0],
        entityId: "entity-1",
        details: null,
        ipAddress: null,
      });
      expect(result.success).toBe(true);
    }
  });
});

// ─── Notification Settings Schema Tests ─────────────────────────────────────

describe("Notification Settings", () => {
  const notificationSettingsSchema = z.object({
    emailOnSubmission: z.boolean().optional(),
    emailAddress: z.string().email().nullable().optional(),
  });

  it("accepts valid email settings", () => {
    const result = notificationSettingsSchema.safeParse({
      emailOnSubmission: true,
      emailAddress: "admin@cruise.com",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null email address", () => {
    const result = notificationSettingsSchema.safeParse({
      emailOnSubmission: false,
      emailAddress: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts partial update", () => {
    const result = notificationSettingsSchema.safeParse({
      emailOnSubmission: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = notificationSettingsSchema.safeParse({
      emailAddress: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("accepts empty object", () => {
    const result = notificationSettingsSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

// ─── Soft Delete Behavior Tests ─────────────────────────────────────────────

describe("Soft Delete Logic", () => {
  interface SoftDeletable {
    id: string;
    deletedAt: Date | null;
  }

  function filterActive<T extends SoftDeletable>(items: T[]): T[] {
    return items.filter(item => item.deletedAt === null);
  }

  function softDelete<T extends SoftDeletable>(item: T): T {
    return { ...item, deletedAt: new Date() };
  }

  it("filters out soft-deleted items", () => {
    const items: SoftDeletable[] = [
      { id: "1", deletedAt: null },
      { id: "2", deletedAt: new Date() },
      { id: "3", deletedAt: null },
    ];
    expect(filterActive(items)).toHaveLength(2);
    expect(filterActive(items).map(i => i.id)).toEqual(["1", "3"]);
  });

  it("returns all items when none are deleted", () => {
    const items: SoftDeletable[] = [
      { id: "1", deletedAt: null },
      { id: "2", deletedAt: null },
    ];
    expect(filterActive(items)).toHaveLength(2);
  });

  it("returns empty when all are deleted", () => {
    const items: SoftDeletable[] = [
      { id: "1", deletedAt: new Date() },
      { id: "2", deletedAt: new Date() },
    ];
    expect(filterActive(items)).toHaveLength(0);
  });

  it("soft delete sets deletedAt timestamp", () => {
    const before = Date.now();
    const item: SoftDeletable = { id: "1", deletedAt: null };
    const deleted = softDelete(item);
    expect(deleted.deletedAt).not.toBeNull();
    expect(deleted.deletedAt!.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("original item remains unchanged after soft delete", () => {
    const item: SoftDeletable = { id: "1", deletedAt: null };
    softDelete(item);
    expect(item.deletedAt).toBeNull();
  });
});

// ─── Health Check Response Shape Tests ──────────────────────────────────────

describe("Health Check", () => {
  const healthResponseSchema = z.object({
    status: z.enum(["ok", "unhealthy"]),
    timestamp: z.string().datetime(),
  });

  it("validates healthy response", () => {
    const result = healthResponseSchema.safeParse({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it("validates unhealthy response", () => {
    const result = healthResponseSchema.safeParse({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const result = healthResponseSchema.safeParse({
      status: "degraded",
      timestamp: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });
});

// ─── Paginated API Response Shape Tests ────────────────────────────────────

describe("Paginated Response Shape", () => {
  const paginatedResponseSchema = z.object({
    data: z.array(z.unknown()),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(100),
    totalPages: z.number().int().min(0),
  });

  it("validates a typical paginated response", () => {
    const result = paginatedResponseSchema.safeParse({
      data: [{ id: "1" }, { id: "2" }],
      total: 50,
      page: 1,
      limit: 20,
      totalPages: 3,
    });
    expect(result.success).toBe(true);
  });

  it("validates empty paginated response", () => {
    const result = paginatedResponseSchema.safeParse({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });
    expect(result.success).toBe(true);
  });

  it("rejects limit > 100", () => {
    const result = paginatedResponseSchema.safeParse({
      data: [],
      total: 0,
      page: 1,
      limit: 200,
      totalPages: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects page < 1", () => {
    const result = paginatedResponseSchema.safeParse({
      data: [],
      total: 0,
      page: 0,
      limit: 20,
      totalPages: 0,
    });
    expect(result.success).toBe(false);
  });
});

// ─── Graph Schema with Soft Delete Fields Tests ────────────────────────────

describe("Template Schema with Soft Delete", () => {
  it("validates graph schema is unchanged", () => {
    const result = graphSchema.safeParse({
      rootStepId: "step-1",
      steps: {
        "step-1": {
          id: "step-1",
          type: "text",
          question: "Your name?",
          nextStepId: null,
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("validates a template-like object with deletedAt null", () => {
    const templateLikeSchema = z.object({
      id: z.string(),
      name: z.string(),
      deletedAt: z.date().nullable(),
    });

    const result = templateLikeSchema.safeParse({
      id: "tmpl-1",
      name: "Test Template",
      deletedAt: null,
    });
    expect(result.success).toBe(true);
  });

  it("validates a template-like object with deletedAt set", () => {
    const templateLikeSchema = z.object({
      id: z.string(),
      name: z.string(),
      deletedAt: z.date().nullable(),
    });

    const result = templateLikeSchema.safeParse({
      id: "tmpl-1",
      name: "Deleted Template",
      deletedAt: new Date(),
    });
    expect(result.success).toBe(true);
  });
});

// ─── Search Query Sanitization Tests ────────────────────────────────────────

describe("Search Query Handling", () => {
  function sanitizeSearch(input: string): string {
    // SQL ILIKE pattern: wrap with % for contains search
    return `%${input}%`;
  }

  it("wraps search term with wildcards", () => {
    expect(sanitizeSearch("caribbean")).toBe("%caribbean%");
  });

  it("handles empty search", () => {
    expect(sanitizeSearch("")).toBe("%%");
  });

  it("handles search with special characters", () => {
    expect(sanitizeSearch("O'Brien")).toBe("%O'Brien%");
  });

  it("handles search with spaces", () => {
    expect(sanitizeSearch("luxury cruise")).toBe("%luxury cruise%");
  });
});
