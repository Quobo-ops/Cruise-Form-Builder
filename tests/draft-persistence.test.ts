import { describe, it, expect, beforeEach, vi } from "vitest";

// --- Inline the draft persistence helpers to test them independently ---

const DRAFT_EXPIRY_MS = 24 * 60 * 60 * 1000;

interface FormDraft {
  answers: Record<string, string | Array<{ choiceId: string; label: string; quantity: number; price: number }>>;
  history: string[];
  currentStepId: string | null;
  customerName: string;
  customerPhone: string;
  quantitySelections: Record<string, number>;
  showPhoneInput: boolean;
  inputValue: string;
  savedAt: number;
}

function getDraftKey(formId: string): string {
  return `cruise-form-draft-${formId}`;
}

function loadDraft(formId: string, storage: Storage): FormDraft | null {
  try {
    const raw = storage.getItem(getDraftKey(formId));
    if (!raw) return null;
    const draft: FormDraft = JSON.parse(raw);
    if (Date.now() - draft.savedAt > DRAFT_EXPIRY_MS) {
      storage.removeItem(getDraftKey(formId));
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

function saveDraft(formId: string, draft: Omit<FormDraft, "savedAt">, storage: Storage): void {
  try {
    storage.setItem(
      getDraftKey(formId),
      JSON.stringify({ ...draft, savedAt: Date.now() })
    );
  } catch {
    // ignore
  }
}

function clearDraft(formId: string, storage: Storage): void {
  try {
    storage.removeItem(getDraftKey(formId));
  } catch {
    // ignore
  }
}

// --- Mock localStorage ---

function createMockStorage(): Storage {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
}

// --- Tests ---

describe("Draft Persistence", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createMockStorage();
  });

  const sampleDraft: Omit<FormDraft, "savedAt"> = {
    answers: {
      "step-1": "John Doe",
      "step-2": "Option A",
      "step-3": [
        { choiceId: "c1", label: "Kayak", quantity: 2, price: 25 },
        { choiceId: "c2", label: "Snorkel", quantity: 0, price: 15 },
      ],
    },
    history: ["step-1", "step-2", "step-3"],
    currentStepId: "step-3",
    customerName: "John Doe",
    customerPhone: "+1 555 1234",
    quantitySelections: { c1: 2, c2: 0 },
    showPhoneInput: false,
    inputValue: "",
  };

  describe("getDraftKey", () => {
    it("generates a unique key per form ID", () => {
      expect(getDraftKey("abc123")).toBe("cruise-form-draft-abc123");
      expect(getDraftKey("xyz789")).toBe("cruise-form-draft-xyz789");
    });
  });

  describe("saveDraft / loadDraft", () => {
    it("saves and loads a draft round-trip", () => {
      saveDraft("form-1", sampleDraft, storage);
      const loaded = loadDraft("form-1", storage);

      expect(loaded).not.toBeNull();
      expect(loaded!.answers).toEqual(sampleDraft.answers);
      expect(loaded!.history).toEqual(sampleDraft.history);
      expect(loaded!.currentStepId).toBe("step-3");
      expect(loaded!.customerName).toBe("John Doe");
      expect(loaded!.customerPhone).toBe("+1 555 1234");
      expect(loaded!.quantitySelections).toEqual({ c1: 2, c2: 0 });
      expect(loaded!.showPhoneInput).toBe(false);
      expect(loaded!.savedAt).toBeGreaterThan(0);
    });

    it("returns null for non-existent draft", () => {
      const loaded = loadDraft("nonexistent", storage);
      expect(loaded).toBeNull();
    });

    it("handles different form IDs independently", () => {
      saveDraft("form-1", sampleDraft, storage);
      saveDraft("form-2", { ...sampleDraft, customerName: "Jane" }, storage);

      expect(loadDraft("form-1", storage)!.customerName).toBe("John Doe");
      expect(loadDraft("form-2", storage)!.customerName).toBe("Jane");
    });

    it("overwrites existing draft for same form", () => {
      saveDraft("form-1", sampleDraft, storage);
      saveDraft("form-1", { ...sampleDraft, customerName: "Updated" }, storage);

      const loaded = loadDraft("form-1", storage);
      expect(loaded!.customerName).toBe("Updated");
    });

    it("preserves quantity answer arrays correctly", () => {
      saveDraft("form-1", sampleDraft, storage);
      const loaded = loadDraft("form-1", storage);

      const qa = loaded!.answers["step-3"];
      expect(Array.isArray(qa)).toBe(true);
      const qaArray = qa as Array<{ choiceId: string; label: string; quantity: number; price: number }>;
      expect(qaArray).toHaveLength(2);
      expect(qaArray[0].choiceId).toBe("c1");
      expect(qaArray[0].quantity).toBe(2);
      expect(qaArray[0].price).toBe(25);
    });
  });

  describe("draft expiry", () => {
    it("expires drafts older than 24 hours", () => {
      saveDraft("form-1", sampleDraft, storage);

      // Manually set savedAt to 25 hours ago
      const key = getDraftKey("form-1");
      const raw = JSON.parse(storage.getItem(key)!);
      raw.savedAt = Date.now() - (25 * 60 * 60 * 1000);
      storage.setItem(key, JSON.stringify(raw));

      const loaded = loadDraft("form-1", storage);
      expect(loaded).toBeNull();
      // Should also clean up the expired entry
      expect(storage.getItem(key)).toBeNull();
    });

    it("keeps drafts younger than 24 hours", () => {
      saveDraft("form-1", sampleDraft, storage);

      // Set savedAt to 23 hours ago
      const key = getDraftKey("form-1");
      const raw = JSON.parse(storage.getItem(key)!);
      raw.savedAt = Date.now() - (23 * 60 * 60 * 1000);
      storage.setItem(key, JSON.stringify(raw));

      const loaded = loadDraft("form-1", storage);
      expect(loaded).not.toBeNull();
    });
  });

  describe("clearDraft", () => {
    it("removes the draft from storage", () => {
      saveDraft("form-1", sampleDraft, storage);
      expect(loadDraft("form-1", storage)).not.toBeNull();

      clearDraft("form-1", storage);
      expect(loadDraft("form-1", storage)).toBeNull();
    });

    it("does not throw for non-existent draft", () => {
      expect(() => clearDraft("nonexistent", storage)).not.toThrow();
    });

    it("does not affect other forms", () => {
      saveDraft("form-1", sampleDraft, storage);
      saveDraft("form-2", sampleDraft, storage);

      clearDraft("form-1", storage);
      expect(loadDraft("form-1", storage)).toBeNull();
      expect(loadDraft("form-2", storage)).not.toBeNull();
    });
  });

  describe("error handling", () => {
    it("loadDraft returns null for corrupted JSON", () => {
      storage.setItem(getDraftKey("form-1"), "not valid json{{{");
      const loaded = loadDraft("form-1", storage);
      expect(loaded).toBeNull();
    });

    it("saveDraft does not throw when storage is full", () => {
      const fullStorage: Storage = {
        ...createMockStorage(),
        setItem: () => { throw new DOMException("QuotaExceededError"); },
      };
      expect(() => saveDraft("form-1", sampleDraft, fullStorage)).not.toThrow();
    });
  });

  describe("draft state completeness", () => {
    it("saves all form state fields", () => {
      const fullDraft: Omit<FormDraft, "savedAt"> = {
        answers: { "s1": "answer1" },
        history: ["s1"],
        currentStepId: "s2",
        customerName: "Test User",
        customerPhone: "+1234567890",
        quantitySelections: { "q1": 3 },
        showPhoneInput: true,
        inputValue: "partial input",
      };
      saveDraft("form-1", fullDraft, storage);
      const loaded = loadDraft("form-1", storage);

      expect(loaded!.answers).toEqual(fullDraft.answers);
      expect(loaded!.history).toEqual(fullDraft.history);
      expect(loaded!.currentStepId).toBe(fullDraft.currentStepId);
      expect(loaded!.customerName).toBe(fullDraft.customerName);
      expect(loaded!.customerPhone).toBe(fullDraft.customerPhone);
      expect(loaded!.quantitySelections).toEqual(fullDraft.quantitySelections);
      expect(loaded!.showPhoneInput).toBe(true);
      expect(loaded!.inputValue).toBe("partial input");
    });

    it("handles empty answers object", () => {
      const emptyDraft: Omit<FormDraft, "savedAt"> = {
        answers: {},
        history: [],
        currentStepId: null,
        customerName: "",
        customerPhone: "",
        quantitySelections: {},
        showPhoneInput: false,
        inputValue: "",
      };
      saveDraft("form-1", emptyDraft, storage);
      const loaded = loadDraft("form-1", storage);
      expect(loaded!.answers).toEqual({});
      expect(loaded!.history).toEqual([]);
    });
  });
});
