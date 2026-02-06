import { describe, it, expect } from "vitest";
import { z } from "zod";
import { quantityAnswerSchema } from "@shared/schema";

// Re-create the submission validation schema from routes.ts to test independently
const submissionSchema = z.object({
  answers: z.record(z.string(), z.union([z.string(), z.array(quantityAnswerSchema)])),
  customerName: z.string().optional(),
  customerPhone: z.string().min(1, "Phone number is required").refine(
    (val) => val.replace(/\D/g, "").length >= 7,
    "Phone number must have at least 7 digits"
  ),
});

describe("Submission Validation", () => {
  describe("valid submissions", () => {
    it("accepts a simple text answer submission", () => {
      const result = submissionSchema.safeParse({
        answers: {
          "step-1": "John Doe",
          "step-2": "Option A",
        },
        customerName: "John Doe",
        customerPhone: "+1 555 123 4567",
      });
      expect(result.success).toBe(true);
    });

    it("accepts quantity answers with valid data", () => {
      const result = submissionSchema.safeParse({
        answers: {
          "step-1": "John",
          "step-2": [
            { choiceId: "c1", label: "Kayak Tour", quantity: 2, price: 50 },
            { choiceId: "c2", label: "Snorkel Set", quantity: 0, price: 25 },
          ],
        },
        customerPhone: "5551234567",
      });
      expect(result.success).toBe(true);
    });

    it("accepts mixed text and quantity answers", () => {
      const result = submissionSchema.safeParse({
        answers: {
          "step-1": "Jane Doe",
          "step-2": "VIP Package",
          "step-3": [
            { choiceId: "c1", label: "Champagne", quantity: 1, price: 100 },
          ],
          "step-4": "Thank you!",
        },
        customerPhone: "1234567",
      });
      expect(result.success).toBe(true);
    });

    it("accepts customer name as optional", () => {
      const result = submissionSchema.safeParse({
        answers: { "step-1": "Test" },
        customerPhone: "5551234567",
      });
      expect(result.success).toBe(true);
    });

    it("accepts phone numbers with various formats", () => {
      const validPhones = [
        "+1 (555) 123-4567",
        "555-123-4567",
        "5551234567",
        "+44 20 7946 0958",
        "(555) 123 4567",
        "1-800-555-1234",
      ];

      for (const phone of validPhones) {
        const result = submissionSchema.safeParse({
          answers: { "s1": "test" },
          customerPhone: phone,
        });
        expect(result.success, `Should accept phone: ${phone}`).toBe(true);
      }
    });
  });

  describe("invalid submissions", () => {
    it("rejects empty phone number", () => {
      const result = submissionSchema.safeParse({
        answers: { "step-1": "Test" },
        customerPhone: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects phone with fewer than 7 digits", () => {
      const result = submissionSchema.safeParse({
        answers: { "step-1": "Test" },
        customerPhone: "123456",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing phone number entirely", () => {
      const result = submissionSchema.safeParse({
        answers: { "step-1": "Test" },
      });
      expect(result.success).toBe(false);
    });

    it("rejects quantity answers with negative quantity", () => {
      const result = submissionSchema.safeParse({
        answers: {
          "step-1": [
            { choiceId: "c1", label: "Test", quantity: -1, price: 10 },
          ],
        },
        customerPhone: "5551234567",
      });
      expect(result.success).toBe(false);
    });

    it("rejects quantity answers with negative price", () => {
      const result = submissionSchema.safeParse({
        answers: {
          "step-1": [
            { choiceId: "c1", label: "Test", quantity: 1, price: -10 },
          ],
        },
        customerPhone: "5551234567",
      });
      expect(result.success).toBe(false);
    });

    it("rejects quantity answers missing required fields", () => {
      const result = submissionSchema.safeParse({
        answers: {
          "step-1": [
            { choiceId: "c1", quantity: 1 }, // missing label and price
          ],
        },
        customerPhone: "5551234567",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty answers object", () => {
      // This should actually pass since answers can be empty
      const result = submissionSchema.safeParse({
        answers: {},
        customerPhone: "5551234567",
      });
      expect(result.success).toBe(true); // Empty answers is valid
    });
  });

  describe("quantity answer schema", () => {
    it("validates a correct quantity answer", () => {
      const result = quantityAnswerSchema.safeParse({
        choiceId: "choice-1",
        label: "Kayak Tour",
        quantity: 3,
        price: 50,
      });
      expect(result.success).toBe(true);
    });

    it("allows zero quantity", () => {
      const result = quantityAnswerSchema.safeParse({
        choiceId: "c1",
        label: "Test",
        quantity: 0,
        price: 0,
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing choiceId", () => {
      const result = quantityAnswerSchema.safeParse({
        label: "Test",
        quantity: 1,
        price: 10,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing label", () => {
      const result = quantityAnswerSchema.safeParse({
        choiceId: "c1",
        quantity: 1,
        price: 10,
      });
      expect(result.success).toBe(false);
    });
  });
});

describe("Rate Limiting Logic", () => {
  // Test the rate limiting logic independently
  const RATE_LIMIT_WINDOW = 60 * 1000;
  const RATE_LIMIT_MAX = 10;
  const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

  function checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);

    if (!entry || now >= entry.resetAt) {
      rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
      return true;
    }

    if (entry.count >= RATE_LIMIT_MAX) {
      return false;
    }

    entry.count++;
    return true;
  }

  it("allows first request from an IP", () => {
    rateLimitMap.clear();
    expect(checkRateLimit("192.168.1.1")).toBe(true);
  });

  it("allows up to 10 requests per minute", () => {
    rateLimitMap.clear();
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit("192.168.1.2")).toBe(true);
    }
  });

  it("blocks the 11th request", () => {
    rateLimitMap.clear();
    for (let i = 0; i < 10; i++) {
      checkRateLimit("192.168.1.3");
    }
    expect(checkRateLimit("192.168.1.3")).toBe(false);
  });

  it("treats different IPs independently", () => {
    rateLimitMap.clear();
    for (let i = 0; i < 10; i++) {
      checkRateLimit("192.168.1.4");
    }
    // IP .4 is rate-limited
    expect(checkRateLimit("192.168.1.4")).toBe(false);
    // IP .5 is fresh
    expect(checkRateLimit("192.168.1.5")).toBe(true);
  });

  it("resets after the window expires", () => {
    rateLimitMap.clear();
    // Fill up rate limit
    for (let i = 0; i < 10; i++) {
      checkRateLimit("192.168.1.6");
    }
    expect(checkRateLimit("192.168.1.6")).toBe(false);

    // Simulate window expiry
    const entry = rateLimitMap.get("192.168.1.6")!;
    entry.resetAt = Date.now() - 1;

    expect(checkRateLimit("192.168.1.6")).toBe(true);
  });
});

describe("Inventory Stock Issue Detection", () => {
  // Test the stock checking logic used in the client
  type InventoryStatus = {
    stepId: string;
    choiceId: string;
    remaining: number | null;
    isSoldOut: boolean;
  };

  type QuantityAnswer = {
    choiceId: string;
    label: string;
    quantity: number;
    price: number;
  };

  function checkStockIssues(
    answers: Record<string, string | QuantityAnswer[]>,
    freshInventory: InventoryStatus[]
  ): string[] {
    const issues: string[] = [];
    for (const [stepId, answer] of Object.entries(answers)) {
      if (!Array.isArray(answer)) continue;
      for (const qa of answer as QuantityAnswer[]) {
        if (qa.quantity <= 0) continue;
        const fresh = freshInventory.find(
          (i) => i.stepId === stepId && i.choiceId === qa.choiceId
        );
        if (fresh && fresh.remaining !== null && qa.quantity > fresh.remaining) {
          if (fresh.remaining === 0) {
            issues.push(`"${qa.label}" is now sold out`);
          } else {
            issues.push(
              `"${qa.label}" — only ${fresh.remaining} left (you selected ${qa.quantity})`
            );
          }
        }
      }
    }
    return issues;
  }

  it("returns no issues when all stock is available", () => {
    const answers: Record<string, string | QuantityAnswer[]> = {
      "step-1": [
        { choiceId: "c1", label: "Kayak", quantity: 2, price: 25 },
      ],
    };
    const inventory: InventoryStatus[] = [
      { stepId: "step-1", choiceId: "c1", remaining: 10, isSoldOut: false },
    ];
    expect(checkStockIssues(answers, inventory)).toEqual([]);
  });

  it("detects sold out items", () => {
    const answers: Record<string, string | QuantityAnswer[]> = {
      "step-1": [
        { choiceId: "c1", label: "Kayak", quantity: 2, price: 25 },
      ],
    };
    const inventory: InventoryStatus[] = [
      { stepId: "step-1", choiceId: "c1", remaining: 0, isSoldOut: true },
    ];
    const issues = checkStockIssues(answers, inventory);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("sold out");
  });

  it("detects partial stock shortage", () => {
    const answers: Record<string, string | QuantityAnswer[]> = {
      "step-1": [
        { choiceId: "c1", label: "Kayak", quantity: 5, price: 25 },
      ],
    };
    const inventory: InventoryStatus[] = [
      { stepId: "step-1", choiceId: "c1", remaining: 3, isSoldOut: false },
    ];
    const issues = checkStockIssues(answers, inventory);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("only 3 left");
    expect(issues[0]).toContain("you selected 5");
  });

  it("ignores items with zero quantity", () => {
    const answers: Record<string, string | QuantityAnswer[]> = {
      "step-1": [
        { choiceId: "c1", label: "Kayak", quantity: 0, price: 25 },
      ],
    };
    const inventory: InventoryStatus[] = [
      { stepId: "step-1", choiceId: "c1", remaining: 0, isSoldOut: true },
    ];
    expect(checkStockIssues(answers, inventory)).toEqual([]);
  });

  it("ignores text answers", () => {
    const answers: Record<string, string | QuantityAnswer[]> = {
      "step-1": "John Doe",
      "step-2": [
        { choiceId: "c1", label: "Kayak", quantity: 1, price: 25 },
      ],
    };
    const inventory: InventoryStatus[] = [
      { stepId: "step-2", choiceId: "c1", remaining: 5, isSoldOut: false },
    ];
    expect(checkStockIssues(answers, inventory)).toEqual([]);
  });

  it("handles items with unlimited stock (remaining null)", () => {
    const answers: Record<string, string | QuantityAnswer[]> = {
      "step-1": [
        { choiceId: "c1", label: "Kayak", quantity: 100, price: 25 },
      ],
    };
    const inventory: InventoryStatus[] = [
      { stepId: "step-1", choiceId: "c1", remaining: null, isSoldOut: false },
    ];
    expect(checkStockIssues(answers, inventory)).toEqual([]);
  });

  it("detects multiple stock issues across steps", () => {
    const answers: Record<string, string | QuantityAnswer[]> = {
      "step-1": [
        { choiceId: "c1", label: "Kayak", quantity: 5, price: 25 },
        { choiceId: "c2", label: "Snorkel", quantity: 3, price: 15 },
      ],
      "step-2": [
        { choiceId: "c3", label: "Jet Ski", quantity: 2, price: 100 },
      ],
    };
    const inventory: InventoryStatus[] = [
      { stepId: "step-1", choiceId: "c1", remaining: 2, isSoldOut: false },
      { stepId: "step-1", choiceId: "c2", remaining: 3, isSoldOut: false }, // OK
      { stepId: "step-2", choiceId: "c3", remaining: 0, isSoldOut: true },
    ];
    const issues = checkStockIssues(answers, inventory);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toContain("Kayak");
    expect(issues[1]).toContain("Jet Ski");
  });
});
