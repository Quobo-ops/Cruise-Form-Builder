import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Ship, ArrowRight, ChevronLeft, Check, Loader2, Anchor, Minus, Plus, DollarSign, Phone, Info, RefreshCw, RotateCcw } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { apiRequest } from "@/lib/queryClient";
import type { Template, Step, Cruise, QuantityAnswer } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { StepInfoPopup } from "@/components/step-info-popup";

type InventoryStatus = {
  stepId: string;
  choiceId: string;
  remaining: number | null;
  isSoldOut: boolean;
};

type FormResponse = Template & {
  cruise?: Cruise;
  inventory?: InventoryStatus[];
};

// --- Draft persistence helpers ---

const DRAFT_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

interface FormDraft {
  answers: Record<string, string | QuantityAnswer[]>;
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

function loadDraft(formId: string): FormDraft | null {
  try {
    const raw = localStorage.getItem(getDraftKey(formId));
    if (!raw) return null;
    const draft: FormDraft = JSON.parse(raw);
    if (Date.now() - draft.savedAt > DRAFT_EXPIRY_MS) {
      localStorage.removeItem(getDraftKey(formId));
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

function saveDraft(formId: string, draft: Omit<FormDraft, "savedAt">): void {
  try {
    localStorage.setItem(
      getDraftKey(formId),
      JSON.stringify({ ...draft, savedAt: Date.now() })
    );
  } catch {
    // localStorage may be full or unavailable
  }
}

function clearDraft(formId: string): void {
  try {
    localStorage.removeItem(getDraftKey(formId));
  } catch {
    // ignore
  }
}

// --- Component ---

export default function PublicForm() {
  const { shareId, cruiseId } = useParams<{ shareId?: string; cruiseId?: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Form state
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | QuantityAnswer[]>>({});
  const [inputValue, setInputValue] = useState("");
  const [quantitySelections, setQuantitySelections] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<string[]>([]);
  const [isReview, setIsReview] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [showPhoneInput, setShowPhoneInput] = useState(false);
  const [showInfoPopup, setShowInfoPopup] = useState(false);

  // Draft persistence state
  const [pendingDraft, setPendingDraft] = useState<FormDraft | null>(null);
  const [draftChecked, setDraftChecked] = useState(false);

  // Inventory re-validation state
  const [isValidatingInventory, setIsValidatingInventory] = useState(false);

  // Refs
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const liveRegionRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const formId = shareId || cruiseId;

  const { data: formData, isLoading, error } = useQuery<FormResponse>({
    queryKey: ["/api/forms", formId],
    enabled: !!formId,
  });

  const template = formData;
  const cruise = formData?.cruise;
  
  // Local inventory state that can be refreshed
  const [localInventory, setLocalInventory] = useState<InventoryStatus[]>([]);
  const inventory = localInventory.length > 0 ? localInventory : (formData?.inventory || []);
  
  // Initialize local inventory from form data
  useEffect(() => {
    if (formData?.inventory && localInventory.length === 0) {
      setLocalInventory(formData.inventory);
    }
  }, [formData?.inventory, localInventory.length]);

  // --- Screen reader announcements ---

  const announce = useCallback((message: string) => {
    if (liveRegionRef.current) {
      // Clear then set to ensure re-announcement of same text
      liveRegionRef.current.textContent = "";
      requestAnimationFrame(() => {
        if (liveRegionRef.current) {
          liveRegionRef.current.textContent = message;
        }
      });
    }
  }, []);

  // --- Draft persistence ---

  // Check for existing draft once form data loads
  useEffect(() => {
    if (!formId || !formData || draftChecked) return;
    const draft = loadDraft(formId);
    if (draft && Object.keys(draft.answers).length > 0) {
      // Validate draft step IDs still exist in the current form
      const graph = formData.graph;
      if (graph) {
        const validSteps = Object.keys(graph.steps);
        const draftStepsValid = draft.history.every((id) => validSteps.includes(id));
        if (draftStepsValid) {
          setPendingDraft(draft);
        } else {
          clearDraft(formId);
        }
      }
    }
    setDraftChecked(true);
  }, [formId, formData, draftChecked]);

  // Auto-save draft on state changes (debounced, 500ms)
  useEffect(() => {
    if (!formId || !draftChecked || pendingDraft || isSubmitted) return;
    if (Object.keys(answers).length === 0 && !customerPhone && !inputValue) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveDraft(formId, {
        answers,
        history,
        currentStepId,
        customerName,
        customerPhone,
        quantitySelections,
        showPhoneInput,
        inputValue,
      });
    }, 500);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [formId, draftChecked, pendingDraft, isSubmitted, answers, history, currentStepId, customerName, customerPhone, quantitySelections, showPhoneInput, inputValue]);

  // Save draft and warn on beforeunload
  useEffect(() => {
    if (!formId || isSubmitted) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(answers).length > 0 || customerPhone) {
        // Save draft before showing warning
        saveDraft(formId, {
          answers,
          history,
          currentStepId,
          customerName,
          customerPhone,
          quantitySelections,
          showPhoneInput,
          inputValue,
        });
        // Show browser warning
        e.preventDefault();
        e.returnValue = "Your form progress has been saved as a draft. Are you sure you want to leave?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [formId, isSubmitted, answers, history, currentStepId, customerName, customerPhone, quantitySelections, showPhoneInput, inputValue]);

  // Resume / discard draft handlers
  const resumeDraft = useCallback(() => {
    if (!pendingDraft) return;
    setAnswers(pendingDraft.answers);
    setHistory(pendingDraft.history);
    setCurrentStepId(pendingDraft.currentStepId);
    setCustomerName(pendingDraft.customerName);
    setCustomerPhone(pendingDraft.customerPhone);
    setQuantitySelections(pendingDraft.quantitySelections);
    setShowPhoneInput(pendingDraft.showPhoneInput);
    setInputValue(pendingDraft.inputValue);
    setPendingDraft(null);
    announce("Previous progress restored.");
  }, [pendingDraft, announce]);

  const startFresh = useCallback(() => {
    if (formId) clearDraft(formId);
    setPendingDraft(null);
    announce("Starting fresh.");
  }, [formId, announce]);

  // --- Focus management ---

  useEffect(() => {
    // Small delay to allow DOM to update before focusing
    const timer = setTimeout(() => {
      if (stepHeadingRef.current) {
        stepHeadingRef.current.focus();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [currentStepId, showPhoneInput, isReview]);

  // Announce step changes to screen readers
  const graph = template?.graph;

  const currentStep = useMemo(() => {
    if (!graph) return null;
    const stepId = currentStepId || graph.rootStepId;
    return graph.steps[stepId] || null;
  }, [graph, currentStepId]);

  useEffect(() => {
    if (isSubmitted) return;
    if (showPhoneInput) {
      announce("Contact information. Please provide your phone number.");
    } else if (isReview) {
      announce("Review your answers before submitting.");
    } else if (currentStep) {
      announce(`Question: ${currentStep.question}`);
    }
  }, [currentStepId, showPhoneInput, isReview, currentStep, isSubmitted, announce]);

  // --- Inventory helpers ---

  const getChoiceRemaining = (stepId: string, choiceId: string): number | null => {
    const item = inventory.find(i => i.stepId === stepId && i.choiceId === choiceId);
    return item?.remaining ?? null;
  };

  const isChoiceSoldOut = (stepId: string, choiceId: string): boolean => {
    const item = inventory.find(i => i.stepId === stepId && i.choiceId === choiceId);
    return item?.isSoldOut ?? false;
  };

  // Refresh inventory from server (lightweight endpoint)
  const refreshInventory = useCallback(async () => {
    if (!formId || !cruise) return;
    try {
      const response = await fetch(`/api/forms/${formId}/inventory`);
      if (response.ok) {
        const data = await response.json();
        if (data.inventory) {
          const freshInventory: InventoryStatus[] = data.inventory;
          
          // Check if any current selections exceed new stock
          let needsAdjustment = false;
          const adjustedSelections = { ...quantitySelections };
          
          for (const [choiceId, qty] of Object.entries(quantitySelections)) {
            const inv = freshInventory.find(i => i.stepId === currentStepId && i.choiceId === choiceId);
            if (inv?.remaining !== null && inv?.remaining !== undefined && qty > inv.remaining) {
              adjustedSelections[choiceId] = Math.max(0, inv.remaining);
              needsAdjustment = true;
            }
          }
          
          if (needsAdjustment) {
            setQuantitySelections(adjustedSelections);
            toast({
              title: "Stock updated",
              description: "Some quantities were adjusted due to stock changes.",
              variant: "destructive",
            });
          }
          
          setLocalInventory(freshInventory);
        }
      }
    } catch {
      // Silent fail - don't disrupt form filling
    }
  }, [formId, cruise, quantitySelections, currentStepId, toast]);

  // Refresh inventory when entering a quantity step
  useEffect(() => {
    if (!graph || !currentStepId) return;
    const currentStepType = graph.steps[currentStepId]?.type;
    if (currentStepType === "quantity") {
      refreshInventory();
    }
  }, [currentStepId, graph, refreshInventory]);

  const checkStockIssues = useCallback((freshInventory: InventoryStatus[]): string[] => {
    const issues: string[] = [];
    for (const [stepId, answer] of Object.entries(answers)) {
      if (!Array.isArray(answer)) continue;
      for (const qa of answer as QuantityAnswer[]) {
        if (qa.quantity <= 0) continue;
        const fresh = freshInventory.find(i => i.stepId === stepId && i.choiceId === qa.choiceId);
        if (fresh && fresh.remaining !== null && qa.quantity > fresh.remaining) {
          if (fresh.remaining === 0) {
            issues.push(`"${qa.label}" is now sold out`);
          } else {
            issues.push(`"${qa.label}" — only ${fresh.remaining} left (you selected ${qa.quantity})`);
          }
        }
      }
    }
    return issues;
  }, [answers]);

  // Re-validate inventory before proceeding to review
  const validateInventoryAndProceed = useCallback(async (onSuccess: () => void) => {
    if (!formId || !cruise) {
      onSuccess();
      return;
    }

    setIsValidatingInventory(true);
    try {
      const res = await fetch(`/api/forms/${formId}`, { credentials: "include" });
      if (res.ok) {
        const freshData: FormResponse = await res.json();
        const freshInventory: InventoryStatus[] = freshData.inventory || [];
        const issues = checkStockIssues(freshInventory);
        if (issues.length > 0) {
          toast({
            title: "Stock has changed",
            description: issues.join(". ") + ". Please go back and adjust your selections.",
            variant: "destructive",
          });
          announce("Stock availability has changed. Please adjust your selections.");
          return;
        }
      }
      onSuccess();
    } catch {
      // Network error — proceed and let the server validate at submission
      onSuccess();
    } finally {
      setIsValidatingInventory(false);
    }
  }, [formId, cruise, checkStockIssues, toast, announce]);

  // --- Submission with retry ---

  const submitMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/forms/${formId}/submit`, {
        answers,
        customerName,
        customerPhone,
      });
    },
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 8000),
    onSuccess: () => {
      setIsSubmitted(true);
      if (formId) clearDraft(formId);
      toast({
        title: "Booking submitted!",
        description: "Thank you for your submission.",
      });
      announce("Booking submitted successfully. Thank you!");
      setTimeout(() => {
        setLocation("/");
      }, 2000);
    },
    onError: (error: any) => {
      toast({
        title: "Submission failed",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
      announce("Submission failed. You can retry without losing your answers.");
    },
  });

  // --- Derived state ---

  const progress = useMemo(() => {
    if (!graph) return 0;
    const totalSteps = Object.keys(graph.steps).length;
    const answeredSteps = Object.keys(answers).length;
    return Math.round((answeredSteps / totalSteps) * 100);
  }, [graph, answers]);

  // --- Handlers ---

  const handleTextSubmit = () => {
    if (!currentStep || !inputValue.trim()) return;

    const q = currentStep.question.toLowerCase();
    if (!customerName && (
      q.includes("your name") ||
      q.includes("full name") ||
      q.includes("first name") ||
      q.includes("last name") ||
      (q.includes("name") && (q.includes("what") || q.includes("enter")))
    )) {
      setCustomerName(inputValue);
    }

    const newAnswers = { ...answers, [currentStep.id]: inputValue };
    setAnswers(newAnswers);
    setHistory([...history, currentStep.id]);
    setInputValue("");

    if (currentStep.nextStepId && graph?.steps[currentStep.nextStepId]) {
      setCurrentStepId(currentStep.nextStepId);
    } else {
      setShowPhoneInput(true);
    }
  };

  const handleChoiceSelect = (choice: { id: string; label: string; nextStepId: string | null }) => {
    if (!currentStep) return;

    const newAnswers = { ...answers, [currentStep.id]: choice.label };
    setAnswers(newAnswers);
    setHistory([...history, currentStep.id]);

    if (choice.nextStepId && graph?.steps[choice.nextStepId]) {
      setCurrentStepId(choice.nextStepId);
    } else {
      setShowPhoneInput(true);
    }
  };

  const handleQuantityChange = (choiceId: string, delta: number) => {
    setQuantitySelections(prev => {
      const current = prev[choiceId] || 0;
      const newValue = Math.max(0, current + delta);
      return { ...prev, [choiceId]: newValue };
    });
  };

  const handleQuantitySubmit = () => {
    if (!currentStep || currentStep.type !== "quantity" || !currentStep.quantityChoices) return;

    const quantityAnswers: QuantityAnswer[] = currentStep.quantityChoices
      .filter(choice => !choice.isNoThanks)
      .map(choice => ({
        choiceId: choice.id,
        label: choice.label,
        quantity: quantitySelections[choice.id] || 0,
        price: choice.price || 0,
      }));

    for (const qa of quantityAnswers) {
      if (qa.quantity > 0) {
        const remaining = getChoiceRemaining(currentStep.id, qa.choiceId);
        if (remaining !== null && qa.quantity > remaining) {
          toast({
            title: "Not enough stock",
            description: `Only ${remaining} of "${qa.label}" available.`,
            variant: "destructive",
          });
          return;
        }
      }
    }

    const newAnswers = { ...answers, [currentStep.id]: quantityAnswers };
    setAnswers(newAnswers);
    setHistory([...history, currentStep.id]);
    setQuantitySelections({});

    if (currentStep.nextStepId && graph?.steps[currentStep.nextStepId]) {
      setCurrentStepId(currentStep.nextStepId);
    } else {
      setShowPhoneInput(true);
    }
  };

  const handlePhoneSubmit = () => {
    const phone = customerPhone.trim();
    if (!phone) {
      toast({
        title: "Phone number required",
        description: "Please enter your phone number to continue.",
        variant: "destructive",
      });
      return;
    }
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 7) {
      toast({
        title: "Invalid phone number",
        description: "Please enter a valid phone number with at least 7 digits.",
        variant: "destructive",
      });
      return;
    }

    // Re-validate inventory before proceeding to review
    validateInventoryAndProceed(() => {
      setShowPhoneInput(false);
      setIsReview(true);
    });
  };

  const handleBack = () => {
    if (showPhoneInput) {
      setShowPhoneInput(false);
      const lastStepId = history[history.length - 1];
      if (lastStepId) {
        setCurrentStepId(lastStepId);
        const step = graph?.steps[lastStepId];
        if (step?.type === "text") {
          setInputValue(answers[lastStepId] as string || "");
        } else if (step?.type === "quantity") {
          const qa = answers[lastStepId] as QuantityAnswer[];
          if (qa) {
            const selections: Record<string, number> = {};
            qa.forEach(item => { selections[item.choiceId] = item.quantity; });
            setQuantitySelections(selections);
          }
        }
      }
      return;
    }

    if (isReview) {
      setIsReview(false);
      setShowPhoneInput(true);
      return;
    }

    if (history.length === 0) return;

    const newHistory = [...history];
    const prevStepId = newHistory.pop();
    setHistory(newHistory);

    if (prevStepId) {
      const newAnswers = { ...answers };
      delete newAnswers[prevStepId];
      setAnswers(newAnswers);

      const prevStep = graph?.steps[prevStepId];
      if (prevStep?.type === "text") {
        setInputValue("");
      }
    }

    const goToStepId = newHistory[newHistory.length - 1] || graph?.rootStepId;
    if (goToStepId) {
      setCurrentStepId(goToStepId);
    }
  };

  const handleSubmit = () => {
    if (!customerPhone.trim()) {
      toast({
        title: "Phone number required",
        description: "Please provide your phone number.",
        variant: "destructive",
      });
      setIsReview(false);
      setShowPhoneInput(true);
      return;
    }
    // Re-validate inventory then submit
    validateInventoryAndProceed(() => {
      submitMutation.mutate();
    });
  };

  const handleConclusionSubmit = () => {
    if (!customerPhone.trim()) {
      toast({
        title: "Phone number required",
        description: "Please enter your phone number to submit.",
        variant: "destructive",
      });
      return;
    }
    // Re-validate inventory then submit
    validateInventoryAndProceed(() => {
      submitMutation.mutate();
    });
  };

  const handleEditAnswer = (stepId: string) => {
    const stepIndex = history.indexOf(stepId);
    if (stepIndex === -1) return;

    setIsReview(false);
    setShowPhoneInput(false);
    setHistory(history.slice(0, stepIndex));
    setCurrentStepId(stepId);

    const step = graph?.steps[stepId];
    if (step?.type === "text") {
      setInputValue(answers[stepId] as string || "");
    } else if (step?.type === "quantity") {
      const qa = answers[stepId] as QuantityAnswer[];
      if (qa) {
        const selections: Record<string, number> = {};
        qa.forEach(item => { selections[item.choiceId] = item.quantity; });
        setQuantitySelections(selections);
      }
    }

    const newAnswers: Record<string, string | QuantityAnswer[]> = {};
    history.slice(0, stepIndex).forEach((id) => {
      if (answers[id]) newAnswers[id] = answers[id];
    });
    setAnswers(newAnswers);
  };

  const calculateTotal = () => {
    let total = 0;
    Object.values(answers).forEach(answer => {
      if (Array.isArray(answer)) {
        (answer as QuantityAnswer[]).forEach(qa => {
          total += qa.quantity * qa.price;
        });
      }
    });
    return total;
  };

  // --- Render ---

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="w-full max-w-md shadow-md border-border/50" aria-busy="true">
          <CardHeader className="text-center">
            <div className="w-14 h-14 rounded-xl bg-navy/10 flex items-center justify-center mx-auto mb-4">
              <Ship className="w-8 h-8 text-navy animate-pulse" aria-hidden="true" />
            </div>
            <Skeleton className="h-7 w-3/4 mx-auto mb-2" />
            <Skeleton className="h-4 w-1/2 mx-auto" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-40 w-full rounded-lg" />
          </CardContent>
        </Card>
        <span className="sr-only">Loading booking form...</span>
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="w-full max-w-md text-center shadow-md border-border/50" role="alert">
          <CardContent className="py-16">
            <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
              <Anchor className="w-10 h-10 text-destructive" aria-hidden="true" />
            </div>
            <h2 className="font-serif text-2xl font-bold text-foreground mb-3">Form Not Found</h2>
            <p className="text-muted-foreground mb-8 leading-relaxed">
              This booking form is no longer available or the link is invalid.
            </p>
            <Button variant="outline" onClick={() => setLocation("/")} className="gap-2">
              <ArrowRight className="w-4 h-4 rotate-180" aria-hidden="true" />
              Go to Homepage
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="w-full max-w-md text-center shadow-lg border-border/50" role="status">
          <CardContent className="py-16">
            <div className="w-20 h-20 rounded-full bg-coral/10 dark:bg-coral/20 flex items-center justify-center mx-auto mb-6">
              <Check className="w-10 h-10 text-coral" aria-hidden="true" />
            </div>
            <h2 className="font-serif text-2xl md:text-3xl font-bold text-foreground mb-3">Welcome Aboard!</h2>
            <p className="text-lg text-muted-foreground mb-4 leading-relaxed">
              Thank you for your booking. We&apos;ll be in touch soon.
            </p>
            <p className="text-sm text-muted-foreground mb-8">
              Redirecting you to available cruises...
            </p>
            <div className="inline-flex items-center gap-3 px-4 py-2 bg-primary/10 rounded-full">
              <Anchor className="w-5 h-5 text-primary" aria-hidden="true" />
              <span className="font-medium text-foreground">{cruise?.name || template.name}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Screen reader live region for announcements */}
      <div
        ref={liveRegionRef}
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
        role="status"
      />

      <header className="bg-background/80 backdrop-blur-sm sticky top-0 z-50 py-4 border-b border-border/30">
        <div className="container mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ship className="w-5 h-5 text-navy" aria-hidden="true" />
            <span className="font-serif text-lg text-foreground">CruiseBook</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="container mx-auto px-6 py-10 flex flex-col items-center" role="main">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-xl bg-navy flex items-center justify-center mx-auto mb-4 shadow-md">
              <Ship className="w-8 h-8 text-white" aria-hidden="true" />
            </div>
            <h1 className="font-serif text-2xl font-bold text-foreground tracking-tight">
              {cruise?.name || template.name}
            </h1>
            {cruise?.description && (
              <p className="text-muted-foreground mt-2 leading-relaxed">{cruise.description}</p>
            )}
          </div>

          {/* Draft recovery banner */}
          {pendingDraft && (
            <div
              className="mb-6 p-4 bg-primary/10 border border-primary/20 rounded-lg"
              role="alert"
              data-testid="draft-recovery-banner"
            >
              <div className="flex items-start gap-3">
                <RotateCcw className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" aria-hidden="true" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground mb-3">
                    You have unsaved progress from a previous session.
                  </p>
                  <div className="flex gap-3">
                    <Button
                      size="sm"
                      onClick={resumeDraft}
                      data-testid="button-resume-draft"
                    >
                      Resume
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={startFresh}
                      data-testid="button-start-fresh"
                    >
                      Start Fresh
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mb-8" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Form progress: ${progress}% complete`}>
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground text-center mt-2">{progress}% complete</p>
          </div>

          {showPhoneInput ? (
            <Card className="shadow-md border-border/50">
              <CardHeader>
                <CardTitle
                  ref={stepHeadingRef}
                  tabIndex={-1}
                  className="font-serif text-xl flex items-center gap-2 outline-none"
                >
                  <Phone className="w-5 h-5 text-gold" aria-hidden="true" />
                  Contact Information
                </CardTitle>
                <CardDescription className="text-base">
                  Please provide your phone number so we can reach you.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="phone-input">Phone Number *</Label>
                  <Input
                    id="phone-input"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    type="tel"
                    autoFocus
                    aria-required="true"
                    aria-label="Phone number"
                    onKeyDown={(e) => e.key === "Enter" && handlePhoneSubmit()}
                    data-testid="input-phone"
                  />
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={handleBack}
                    className="gap-2"
                    aria-label="Go back to previous step"
                  >
                    <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                    Back
                  </Button>
                  <Button
                    className="flex-1 gap-2"
                    onClick={handlePhoneSubmit}
                    disabled={!customerPhone.trim() || isValidatingInventory}
                    data-testid="button-continue"
                    aria-label="Continue to review"
                  >
                    {isValidatingInventory ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                        Checking availability...
                      </>
                    ) : (
                      <>
                        Continue
                        <ArrowRight className="w-4 h-4" aria-hidden="true" />
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : isReview ? (
            <Card className="shadow-md border-border/50">
              <CardHeader>
                <CardTitle
                  ref={stepHeadingRef}
                  tabIndex={-1}
                  className="font-serif text-xl outline-none"
                >
                  Review Your Answers
                </CardTitle>
                <CardDescription className="text-base">
                  Tap any answer to edit it before submitting.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {history.map((stepId) => {
                  const step = graph?.steps[stepId];
                  if (!step) return null;
                  const answer = answers[stepId];
                  return (
                    <div
                      key={stepId}
                      className="p-4 bg-muted rounded-md cursor-pointer hover-elevate"
                      role="button"
                      tabIndex={0}
                      aria-label={`Edit answer for: ${step.question}`}
                      onClick={() => handleEditAnswer(stepId)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleEditAnswer(stepId);
                        }
                      }}
                      data-testid={`review-answer-${stepId}`}
                    >
                      <p className="text-sm text-muted-foreground mb-1">{step.question}</p>
                      {Array.isArray(answer) ? (
                        <div className="space-y-1">
                          {(answer as QuantityAnswer[]).filter(qa => qa.quantity > 0).map(qa => (
                            <div key={qa.choiceId} className="flex justify-between text-sm">
                              <span>{qa.label}</span>
                              <span className="font-medium">{qa.quantity} x ${qa.price.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="font-medium">{answer as string}</p>
                      )}
                    </div>
                  );
                })}

                <div className="p-4 bg-muted rounded-md">
                  <p className="text-sm text-muted-foreground mb-1">Phone Number</p>
                  <p className="font-medium">{customerPhone}</p>
                </div>

                {calculateTotal() > 0 && (
                  <div className="p-4 bg-primary/10 rounded-md flex justify-between items-center">
                    <span className="font-semibold">Total</span>
                    <span className="text-xl font-bold">${calculateTotal().toFixed(2)}</span>
                  </div>
                )}

                {/* Submission error recovery */}
                {submitMutation.isError && (
                  <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md" role="alert">
                    <p className="text-sm text-destructive font-medium mb-2">
                      Submission failed. Your answers are safe — you can retry.
                    </p>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => submitMutation.mutate()}
                      className="gap-2"
                      data-testid="button-retry-submit"
                    >
                      <RefreshCw className="w-4 h-4" aria-hidden="true" />
                      Retry Submission
                    </Button>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <Button
                    variant="outline"
                    onClick={handleBack}
                    className="gap-2"
                    aria-label="Go back to phone input"
                  >
                    <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                    Back
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleSubmit}
                    disabled={submitMutation.isPending || isValidatingInventory}
                    data-testid="button-submit"
                    aria-label="Submit booking"
                  >
                    {submitMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                        Submitting...
                      </>
                    ) : isValidatingInventory ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                        Checking availability...
                      </>
                    ) : (
                      "Submit Booking"
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : currentStep ? (
            <>
              {currentStep.infoPopup?.enabled && (
                <>
                  <div className="fixed top-20 right-4 z-50">
                    <Button
                      size="icon"
                      onClick={() => setShowInfoPopup(true)}
                      className="rounded-full shadow-lg animate-pulse"
                      aria-label="More information about this question"
                      data-testid="button-step-info"
                    >
                      <Info className="w-5 h-5" aria-hidden="true" />
                    </Button>
                  </div>
                  <StepInfoPopup
                    infoPopup={currentStep.infoPopup}
                    open={showInfoPopup}
                    onOpenChange={setShowInfoPopup}
                  />
                </>
              )}
              <Card className="shadow-md border-border/50">
                <CardHeader>
                  <CardTitle
                    ref={stepHeadingRef}
                    tabIndex={-1}
                    className="font-serif text-xl outline-none"
                  >
                    {currentStep.question}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                {currentStep.type === "text" ? (
                  <>
                    <Input
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder={currentStep.placeholder || "Enter your answer"}
                      onKeyDown={(e) => e.key === "Enter" && handleTextSubmit()}
                      autoFocus
                      aria-label={currentStep.question}
                      data-testid="input-form-answer"
                    />
                    <div className="flex gap-3">
                      {history.length > 0 && (
                        <Button
                          variant="outline"
                          onClick={handleBack}
                          className="gap-2"
                          aria-label="Go back to previous step"
                        >
                          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                          Back
                        </Button>
                      )}
                      <Button
                        className="flex-1 gap-2"
                        onClick={handleTextSubmit}
                        disabled={!inputValue.trim()}
                        aria-label="Next step"
                        data-testid="button-next"
                      >
                        Next
                        <ArrowRight className="w-4 h-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </>
                ) : currentStep.type === "choice" ? (
                  <>
                    <div className="space-y-2" role="group" aria-label="Select an option">
                      {currentStep.choices?.map((choice) => (
                        <Button
                          key={choice.id}
                          variant="outline"
                          className="w-full justify-start h-auto py-3 px-4 text-left"
                          onClick={() => handleChoiceSelect(choice)}
                          aria-label={`Select: ${choice.label}`}
                          data-testid={`button-choice-${choice.id}`}
                        >
                          {choice.label}
                        </Button>
                      ))}
                    </div>
                    {history.length > 0 && (
                      <Button
                        variant="ghost"
                        onClick={handleBack}
                        className="w-full gap-2"
                        aria-label="Go back to previous step"
                      >
                        <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                        Back
                      </Button>
                    )}
                  </>
                ) : currentStep.type === "quantity" ? (
                  <>
                    <div className="space-y-3" role="group" aria-label="Select quantities">
                      {currentStep.quantityChoices?.map((choice) => {
                        const remaining = getChoiceRemaining(currentStep.id, choice.id);
                        const soldOut = isChoiceSoldOut(currentStep.id, choice.id);
                        const currentQty = quantitySelections[choice.id] || 0;
                        const maxQty = remaining !== null ? Math.min(remaining, 99) : 99;

                        if (choice.isNoThanks) {
                          return (
                            <Button
                              key={choice.id}
                              variant="outline"
                              className="w-full justify-center h-auto py-3 px-4"
                              onClick={handleQuantitySubmit}
                              aria-label={choice.label}
                              data-testid={`button-no-thanks-${choice.id}`}
                            >
                              {choice.label}
                            </Button>
                          );
                        }

                        return (
                          <div
                            key={choice.id}
                            className={`p-4 border rounded-md ${soldOut ? "opacity-50" : ""}`}
                            role="group"
                            aria-label={`${choice.label}, $${(choice.price || 0).toFixed(2)} each${soldOut ? ", sold out" : ""}`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex-1">
                                <p className="font-medium">{choice.label}</p>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <DollarSign className="w-3 h-3" aria-hidden="true" />
                                  ${(choice.price || 0).toFixed(2)} each
                                </div>
                              </div>
                              {soldOut ? (
                                <Badge variant="destructive">Sold Out</Badge>
                              ) : remaining !== null && (
                                <Badge variant="outline" aria-label={`${remaining} remaining`}>{remaining} left</Badge>
                              )}
                            </div>
                            {!soldOut && (
                              <div className="flex items-center justify-center gap-4">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => handleQuantityChange(choice.id, -1)}
                                  disabled={currentQty === 0}
                                  aria-label={`Decrease quantity for ${choice.label}`}
                                  data-testid={`button-minus-${choice.id}`}
                                >
                                  <Minus className="w-4 h-4" aria-hidden="true" />
                                </Button>
                                <span
                                  className="text-2xl font-bold w-12 text-center"
                                  aria-live="polite"
                                  aria-label={`${currentQty} selected for ${choice.label}`}
                                >
                                  {currentQty}
                                </span>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => handleQuantityChange(choice.id, 1)}
                                  disabled={currentQty >= maxQty}
                                  aria-label={`Increase quantity for ${choice.label}`}
                                  data-testid={`button-plus-${choice.id}`}
                                >
                                  <Plus className="w-4 h-4" aria-hidden="true" />
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex gap-3">
                      {history.length > 0 && (
                        <Button
                          variant="outline"
                          onClick={handleBack}
                          className="gap-2"
                          aria-label="Go back to previous step"
                        >
                          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                          Back
                        </Button>
                      )}
                      <Button
                        className="flex-1 gap-2"
                        onClick={handleQuantitySubmit}
                        aria-label="Continue to next step"
                        data-testid="button-quantity-next"
                      >
                        Next
                        <ArrowRight className="w-4 h-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </>
                ) : currentStep.type === "conclusion" ? (
                  <>
                    <div className="text-center py-4">
                      <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mx-auto mb-4">
                        <Check className="w-8 h-8 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                      </div>
                      <p className="text-muted-foreground leading-relaxed">
                        {currentStep.thankYouMessage || "Thank you for completing this form. Please review your answers and submit."}
                      </p>
                    </div>

                    {history.length > 0 && (
                      <div className="space-y-3 border-t pt-4">
                        <p className="text-sm font-medium text-muted-foreground">Your Answers:</p>
                        {history.map((stepId) => {
                          const step = graph?.steps[stepId];
                          if (!step) return null;
                          const answer = answers[stepId];
                          return (
                            <div
                              key={stepId}
                              className="p-3 bg-muted rounded-md cursor-pointer hover-elevate text-sm"
                              role="button"
                              tabIndex={0}
                              aria-label={`Edit answer for: ${step.question}`}
                              onClick={() => handleEditAnswer(stepId)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  handleEditAnswer(stepId);
                                }
                              }}
                              data-testid={`conclusion-answer-${stepId}`}
                            >
                              <p className="text-xs text-muted-foreground mb-1">{step.question}</p>
                              {Array.isArray(answer) ? (
                                <div className="space-y-0.5">
                                  {(answer as QuantityAnswer[]).filter(qa => qa.quantity > 0).map(qa => (
                                    <div key={qa.choiceId} className="flex justify-between">
                                      <span>{qa.label}</span>
                                      <span className="font-medium">{qa.quantity} x ${qa.price.toFixed(2)}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="font-medium">{answer as string}</p>
                              )}
                            </div>
                          );
                        })}
                        {calculateTotal() > 0 && (
                          <div className="p-3 bg-primary/10 rounded-md flex justify-between items-center">
                            <span className="font-semibold">Total</span>
                            <span className="text-lg font-bold">${calculateTotal().toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {!customerPhone && (
                      <div className="space-y-2 border-t pt-4">
                        <Label htmlFor="conclusion-phone-input">Phone Number *</Label>
                        <Input
                          id="conclusion-phone-input"
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          placeholder="+1 (555) 000-0000"
                          type="tel"
                          aria-required="true"
                          aria-label="Phone number"
                          data-testid="input-conclusion-phone"
                        />
                      </div>
                    )}

                    {/* Submission error recovery */}
                    {submitMutation.isError && (
                      <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md" role="alert">
                        <p className="text-sm text-destructive font-medium mb-2">
                          Submission failed. Your answers are safe — you can retry.
                        </p>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => submitMutation.mutate()}
                          className="gap-2"
                          data-testid="button-retry-conclusion-submit"
                        >
                          <RefreshCw className="w-4 h-4" aria-hidden="true" />
                          Retry
                        </Button>
                      </div>
                    )}

                    <div className="flex gap-3 pt-2">
                      {history.length > 0 && (
                        <Button
                          variant="outline"
                          onClick={handleBack}
                          className="gap-2"
                          aria-label="Go back to previous step"
                        >
                          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                          Back
                        </Button>
                      )}
                      <Button
                        className="flex-1"
                        onClick={handleConclusionSubmit}
                        disabled={submitMutation.isPending || isValidatingInventory}
                        aria-label="Submit booking"
                        data-testid="button-conclusion-submit"
                      >
                        {submitMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                            Submitting...
                          </>
                        ) : isValidatingInventory ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                            Checking availability...
                          </>
                        ) : (
                          currentStep.submitButtonText || "Submit"
                        )}
                      </Button>
                    </div>
                  </>
                ) : null}
              </CardContent>
            </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">This form has no steps configured.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <footer className="mt-auto py-8 border-t border-border/30">
        <div className="container mx-auto px-6 text-center">
          <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Ship className="w-4 h-4 text-navy" aria-hidden="true" />
            <span className="font-serif">CruiseBook</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
