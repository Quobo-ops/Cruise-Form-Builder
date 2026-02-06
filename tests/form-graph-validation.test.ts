import { describe, it, expect } from "vitest";
import { graphSchema, stepSchema } from "@shared/schema";

describe("Form Graph Validation", () => {
  describe("valid graphs", () => {
    it("accepts a minimal graph with one text step", () => {
      const result = graphSchema.safeParse({
        rootStepId: "step-1",
        steps: {
          "step-1": {
            id: "step-1",
            type: "text",
            question: "What is your name?",
          },
        },
      });
      expect(result.success).toBe(true);
    });

    it("accepts a multi-step decision tree", () => {
      const result = graphSchema.safeParse({
        rootStepId: "step-1",
        steps: {
          "step-1": {
            id: "step-1",
            type: "text",
            question: "What is your name?",
            nextStepId: "step-2",
          },
          "step-2": {
            id: "step-2",
            type: "choice",
            question: "Which package?",
            choices: [
              { id: "c1", label: "Basic", nextStepId: "step-3" },
              { id: "c2", label: "Premium", nextStepId: "step-4" },
            ],
          },
          "step-3": {
            id: "step-3",
            type: "text",
            question: "Any preferences?",
            nextStepId: null,
          },
          "step-4": {
            id: "step-4",
            type: "quantity",
            question: "How many extras?",
            quantityChoices: [
              { id: "qc1", label: "Kayak", price: 50, limit: 10 },
              { id: "qc2", label: "Snorkel", price: 25, limit: null },
              { id: "qc3", label: "No thanks", price: 0, isNoThanks: true },
            ],
          },
        },
      });
      expect(result.success).toBe(true);
    });

    it("accepts a conclusion step with custom messages", () => {
      const result = graphSchema.safeParse({
        rootStepId: "step-1",
        steps: {
          "step-1": {
            id: "step-1",
            type: "conclusion",
            question: "All done!",
            thankYouMessage: "Thanks for booking!",
            submitButtonText: "Confirm Booking",
          },
        },
      });
      expect(result.success).toBe(true);
    });

    it("accepts a step with info popup", () => {
      const result = graphSchema.safeParse({
        rootStepId: "step-1",
        steps: {
          "step-1": {
            id: "step-1",
            type: "text",
            question: "Choose your cabin",
            infoPopup: {
              enabled: true,
              header: "Cabin Types",
              images: ["https://example.com/cabin1.jpg"],
              description: "We offer various cabin types...",
            },
          },
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe("invalid graphs", () => {
    it("rejects missing rootStepId", () => {
      const result = graphSchema.safeParse({
        steps: {
          "step-1": {
            id: "step-1",
            type: "text",
            question: "Test",
          },
        },
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing steps", () => {
      const result = graphSchema.safeParse({
        rootStepId: "step-1",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid step type", () => {
      const result = stepSchema.safeParse({
        id: "step-1",
        type: "invalid",
        question: "Test",
      });
      expect(result.success).toBe(false);
    });

    it("rejects step without question", () => {
      const result = stepSchema.safeParse({
        id: "step-1",
        type: "text",
      });
      expect(result.success).toBe(false);
    });

    it("rejects step without id", () => {
      const result = stepSchema.safeParse({
        type: "text",
        question: "Test",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("quantity choice validation", () => {
    it("accepts valid quantity choices", () => {
      const step = stepSchema.safeParse({
        id: "step-1",
        type: "quantity",
        question: "Select extras",
        quantityChoices: [
          { id: "qc1", label: "Item 1", price: 10, limit: 5 },
          { id: "qc2", label: "Item 2", price: 0 },
        ],
      });
      expect(step.success).toBe(true);
    });

    it("rejects negative price in quantity choice", () => {
      const step = stepSchema.safeParse({
        id: "step-1",
        type: "quantity",
        question: "Select extras",
        quantityChoices: [
          { id: "qc1", label: "Item 1", price: -10 },
        ],
      });
      expect(step.success).toBe(false);
    });

    it("rejects negative limit in quantity choice", () => {
      const step = stepSchema.safeParse({
        id: "step-1",
        type: "quantity",
        question: "Select extras",
        quantityChoices: [
          { id: "qc1", label: "Item 1", price: 10, limit: -1 },
        ],
      });
      expect(step.success).toBe(false);
    });
  });
});

describe("Template Deletion Constraints", () => {
  // Test the business logic for template deletion with linked cruises
  // This simulates what storage.deleteTemplate checks

  interface TemplateDeletionCheck {
    linkedCruiseCount: number;
    canDelete: boolean;
    errorMessage?: string;
  }

  function checkTemplateDeletion(linkedCruiseCount: number): TemplateDeletionCheck {
    if (linkedCruiseCount > 0) {
      return {
        linkedCruiseCount,
        canDelete: false,
        errorMessage: `Cannot delete template: ${linkedCruiseCount} cruise(s) are using it. Delete the cruises first.`,
      };
    }
    return { linkedCruiseCount: 0, canDelete: true };
  }

  it("allows deletion when no cruises are linked", () => {
    const result = checkTemplateDeletion(0);
    expect(result.canDelete).toBe(true);
    expect(result.errorMessage).toBeUndefined();
  });

  it("prevents deletion with 1 linked cruise", () => {
    const result = checkTemplateDeletion(1);
    expect(result.canDelete).toBe(false);
    expect(result.errorMessage).toContain("1 cruise(s)");
  });

  it("prevents deletion with multiple linked cruises", () => {
    const result = checkTemplateDeletion(5);
    expect(result.canDelete).toBe(false);
    expect(result.errorMessage).toContain("5 cruise(s)");
  });

  it("error message instructs to delete cruises first", () => {
    const result = checkTemplateDeletion(3);
    expect(result.errorMessage).toContain("Delete the cruises first");
  });
});

describe("Concurrent Inventory Update Logic", () => {
  // Simulate the atomic check-and-update logic from storage.checkAndUpdateInventory
  // This tests the business logic without a real database

  interface InventoryItem {
    cruiseId: string;
    stepId: string;
    choiceId: string;
    choiceLabel: string;
    totalOrdered: number;
    stockLimit: number | null;
  }

  interface UpdateRequest {
    stepId: string;
    choiceId: string;
    quantity: number;
    label: string;
  }

  function simulateAtomicInventoryUpdate(
    inventory: InventoryItem[],
    cruiseId: string,
    items: UpdateRequest[]
  ): { success: boolean; error?: string; updatedInventory: InventoryItem[] } {
    // Clone inventory for atomic simulation
    const updated = inventory.map((i) => ({ ...i }));

    for (const item of items) {
      if (item.quantity <= 0) continue;

      const inv = updated.find(
        (i) =>
          i.cruiseId === cruiseId &&
          i.stepId === item.stepId &&
          i.choiceId === item.choiceId
      );

      if (!inv) continue;

      if (inv.stockLimit !== null) {
        const remaining = inv.stockLimit - inv.totalOrdered;
        if (item.quantity > remaining) {
          return {
            success: false,
            error: `Not enough stock for ${item.label}. Only ${Math.max(0, remaining)} remaining.`,
            updatedInventory: inventory, // Return original (no changes)
          };
        }
      }

      inv.totalOrdered += item.quantity;
    }

    return { success: true, updatedInventory: updated };
  }

  const baseInventory: InventoryItem[] = [
    {
      cruiseId: "cruise-1",
      stepId: "step-1",
      choiceId: "c1",
      choiceLabel: "Kayak Tour",
      totalOrdered: 5,
      stockLimit: 10,
    },
    {
      cruiseId: "cruise-1",
      stepId: "step-1",
      choiceId: "c2",
      choiceLabel: "Snorkel Set",
      totalOrdered: 8,
      stockLimit: 10,
    },
    {
      cruiseId: "cruise-1",
      stepId: "step-2",
      choiceId: "c3",
      choiceLabel: "Unlimited Drinks",
      totalOrdered: 20,
      stockLimit: null, // unlimited
    },
  ];

  it("allows order within stock limits", () => {
    const result = simulateAtomicInventoryUpdate(
      baseInventory,
      "cruise-1",
      [{ stepId: "step-1", choiceId: "c1", quantity: 3, label: "Kayak Tour" }]
    );
    expect(result.success).toBe(true);
    const kayak = result.updatedInventory.find((i) => i.choiceId === "c1");
    expect(kayak!.totalOrdered).toBe(8);
  });

  it("rejects order exceeding stock limit", () => {
    const result = simulateAtomicInventoryUpdate(
      baseInventory,
      "cruise-1",
      [{ stepId: "step-1", choiceId: "c1", quantity: 6, label: "Kayak Tour" }]
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("Not enough stock");
    expect(result.error).toContain("5 remaining");
  });

  it("allows exact remaining quantity", () => {
    const result = simulateAtomicInventoryUpdate(
      baseInventory,
      "cruise-1",
      [{ stepId: "step-1", choiceId: "c1", quantity: 5, label: "Kayak Tour" }]
    );
    expect(result.success).toBe(true);
    const kayak = result.updatedInventory.find((i) => i.choiceId === "c1");
    expect(kayak!.totalOrdered).toBe(10); // Exactly at limit
  });

  it("rejects when item is sold out (0 remaining)", () => {
    const soldOutInventory = baseInventory.map((i) =>
      i.choiceId === "c2" ? { ...i, totalOrdered: 10 } : { ...i }
    );
    const result = simulateAtomicInventoryUpdate(
      soldOutInventory,
      "cruise-1",
      [{ stepId: "step-1", choiceId: "c2", quantity: 1, label: "Snorkel Set" }]
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("0 remaining");
  });

  it("allows unlimited stock items", () => {
    const result = simulateAtomicInventoryUpdate(
      baseInventory,
      "cruise-1",
      [{ stepId: "step-2", choiceId: "c3", quantity: 100, label: "Unlimited Drinks" }]
    );
    expect(result.success).toBe(true);
    const drinks = result.updatedInventory.find((i) => i.choiceId === "c3");
    expect(drinks!.totalOrdered).toBe(120);
  });

  it("handles multiple items in one order - all or nothing", () => {
    const result = simulateAtomicInventoryUpdate(
      baseInventory,
      "cruise-1",
      [
        { stepId: "step-1", choiceId: "c1", quantity: 3, label: "Kayak Tour" },
        { stepId: "step-1", choiceId: "c2", quantity: 5, label: "Snorkel Set" }, // Only 2 remaining
      ]
    );
    // Should fail because Snorkel Set doesn't have enough stock
    expect(result.success).toBe(false);
    expect(result.error).toContain("Snorkel Set");
    // Inventory should not be modified (atomic - all or nothing)
    const kayak = result.updatedInventory.find((i) => i.choiceId === "c1");
    expect(kayak!.totalOrdered).toBe(5); // Unchanged
  });

  it("skips items with zero quantity", () => {
    const result = simulateAtomicInventoryUpdate(
      baseInventory,
      "cruise-1",
      [
        { stepId: "step-1", choiceId: "c1", quantity: 0, label: "Kayak Tour" },
        { stepId: "step-1", choiceId: "c2", quantity: 2, label: "Snorkel Set" },
      ]
    );
    expect(result.success).toBe(true);
    const kayak = result.updatedInventory.find((i) => i.choiceId === "c1");
    expect(kayak!.totalOrdered).toBe(5); // Unchanged
    const snorkel = result.updatedInventory.find((i) => i.choiceId === "c2");
    expect(snorkel!.totalOrdered).toBe(10);
  });

  describe("concurrent submission simulation", () => {
    it("second submission fails when first depletes stock", () => {
      // Submission 1: takes 5 kayaks (fills stock)
      const result1 = simulateAtomicInventoryUpdate(
        baseInventory,
        "cruise-1",
        [{ stepId: "step-1", choiceId: "c1", quantity: 5, label: "Kayak Tour" }]
      );
      expect(result1.success).toBe(true);

      // Submission 2: tries to take 1 kayak (stock depleted by submission 1)
      const result2 = simulateAtomicInventoryUpdate(
        result1.updatedInventory,
        "cruise-1",
        [{ stepId: "step-1", choiceId: "c1", quantity: 1, label: "Kayak Tour" }]
      );
      expect(result2.success).toBe(false);
      expect(result2.error).toContain("Not enough stock");
    });

    it("both submissions succeed when stock is sufficient", () => {
      const result1 = simulateAtomicInventoryUpdate(
        baseInventory,
        "cruise-1",
        [{ stepId: "step-1", choiceId: "c1", quantity: 2, label: "Kayak Tour" }]
      );
      expect(result1.success).toBe(true);

      const result2 = simulateAtomicInventoryUpdate(
        result1.updatedInventory,
        "cruise-1",
        [{ stepId: "step-1", choiceId: "c1", quantity: 3, label: "Kayak Tour" }]
      );
      expect(result2.success).toBe(true);

      const kayak = result2.updatedInventory.find((i) => i.choiceId === "c1");
      expect(kayak!.totalOrdered).toBe(10); // 5 + 2 + 3
    });

    it("race condition: last submission wins (inventory tracks cumulative total)", () => {
      // Simulate 3 concurrent submissions all requesting same item
      const requests = [
        [{ stepId: "step-1", choiceId: "c1", quantity: 2, label: "Kayak Tour" }],
        [{ stepId: "step-1", choiceId: "c1", quantity: 2, label: "Kayak Tour" }],
        [{ stepId: "step-1", choiceId: "c1", quantity: 2, label: "Kayak Tour" }],
      ];

      let currentInventory = baseInventory;
      let successCount = 0;
      let failCount = 0;

      for (const request of requests) {
        const result = simulateAtomicInventoryUpdate(
          currentInventory,
          "cruise-1",
          request
        );
        if (result.success) {
          currentInventory = result.updatedInventory;
          successCount++;
        } else {
          failCount++;
        }
      }

      // 5 remaining, each wants 2 = first 2 succeed (taking 4), third fails
      // Actually: 5 + 2 = 7, 7 + 2 = 9, 9 + 2 = 11 > 10, so third fails
      expect(successCount).toBe(2);
      expect(failCount).toBe(1);

      const kayak = currentInventory.find((i) => i.choiceId === "c1");
      expect(kayak!.totalOrdered).toBe(9); // 5 + 2 + 2
    });
  });
});
