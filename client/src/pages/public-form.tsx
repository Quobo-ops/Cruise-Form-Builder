import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Ship, ArrowRight, ChevronLeft, Check, Loader2, Anchor, Minus, Plus, DollarSign, Phone, Info } from "lucide-react";
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

export default function PublicForm() {
  const { shareId, cruiseId } = useParams<{ shareId?: string; cruiseId?: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
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

  const formId = shareId || cruiseId;

  const { data: formData, isLoading, error } = useQuery<FormResponse>({
    queryKey: ["/api/forms", formId],
    enabled: !!formId,
  });

  const template = formData;
  const cruise = formData?.cruise;
  const inventory = formData?.inventory || [];

  const submitMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/forms/${formId}/submit`, { 
        answers,
        customerName,
        customerPhone,
      });
    },
    onSuccess: () => {
      setIsSubmitted(true);
      toast({
        title: "Booking submitted!",
        description: "Thank you for your submission.",
      });
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
    },
  });

  const graph = template?.graph;
  
  const currentStep = useMemo(() => {
    if (!graph) return null;
    const stepId = currentStepId || graph.rootStepId;
    return graph.steps[stepId] || null;
  }, [graph, currentStepId]);

  const progress = useMemo(() => {
    if (!graph) return 0;
    const totalSteps = Object.keys(graph.steps).length;
    const answeredSteps = Object.keys(answers).length;
    return Math.round((answeredSteps / totalSteps) * 100);
  }, [graph, answers]);

  const getChoiceRemaining = (stepId: string, choiceId: string): number | null => {
    const item = inventory.find(i => i.stepId === stepId && i.choiceId === choiceId);
    return item?.remaining ?? null;
  };

  const isChoiceSoldOut = (stepId: string, choiceId: string): boolean => {
    const item = inventory.find(i => i.stepId === stepId && i.choiceId === choiceId);
    return item?.isSoldOut ?? false;
  };

  const handleTextSubmit = () => {
    if (!currentStep || !inputValue.trim()) return;
    
    // Store name if the question is asking for the user's name
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
      // Show phone input before review
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

    // Filter out "no thanks" options for the main answer list
    const quantityAnswers: QuantityAnswer[] = currentStep.quantityChoices
      .filter(choice => !choice.isNoThanks)
      .map(choice => ({
        choiceId: choice.id,
        label: choice.label,
        quantity: quantitySelections[choice.id] || 0,
        price: choice.price || 0,
      }));

    // Validate stock limits before proceeding
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
    // Validate phone has at least 7 digits
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 7) {
      toast({
        title: "Invalid phone number",
        description: "Please enter a valid phone number with at least 7 digits.",
        variant: "destructive",
      });
      return;
    }
    setShowPhoneInput(false);
    setIsReview(true);
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
    // Final validation before submit
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
    submitMutation.mutate();
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="w-full max-w-md shadow-md border-border/50">
          <CardHeader className="text-center">
            <div className="w-14 h-14 rounded-xl bg-navy/10 flex items-center justify-center mx-auto mb-4">
              <Ship className="w-8 h-8 text-navy animate-pulse" />
            </div>
            <Skeleton className="h-7 w-3/4 mx-auto mb-2" />
            <Skeleton className="h-4 w-1/2 mx-auto" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-40 w-full rounded-lg" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="w-full max-w-md text-center shadow-md border-border/50">
          <CardContent className="py-16">
            <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
              <Anchor className="w-10 h-10 text-destructive" />
            </div>
            <h2 className="font-serif text-2xl font-bold text-foreground mb-3">Form Not Found</h2>
            <p className="text-muted-foreground mb-8 leading-relaxed">
              This booking form is no longer available or the link is invalid.
            </p>
            <Button variant="outline" onClick={() => setLocation("/")} className="gap-2">
              <ArrowRight className="w-4 h-4 rotate-180" />
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
        <Card className="w-full max-w-md text-center shadow-lg border-border/50">
          <CardContent className="py-16">
            <div className="w-20 h-20 rounded-full bg-coral/10 dark:bg-coral/20 flex items-center justify-center mx-auto mb-6">
              <Check className="w-10 h-10 text-coral" />
            </div>
            <h2 className="font-serif text-2xl md:text-3xl font-bold text-foreground mb-3">Welcome Aboard!</h2>
            <p className="text-lg text-muted-foreground mb-4 leading-relaxed">
              Thank you for your booking. We&apos;ll be in touch soon.
            </p>
            <p className="text-sm text-muted-foreground mb-8">
              Redirecting you to available cruises...
            </p>
            <div className="inline-flex items-center gap-3 px-4 py-2 bg-primary/10 rounded-full">
              <Anchor className="w-5 h-5 text-primary" />
              <span className="font-medium text-foreground">{cruise?.name || template.name}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-background/80 backdrop-blur-sm sticky top-0 z-50 py-4 border-b border-border/30">
        <div className="container mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ship className="w-5 h-5 text-navy" />
            <span className="font-serif text-lg text-foreground">CruiseBook</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="container mx-auto px-6 py-10 flex flex-col items-center">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-xl bg-navy flex items-center justify-center mx-auto mb-4 shadow-md">
              <Ship className="w-8 h-8 text-white" />
            </div>
            <h1 className="font-serif text-2xl font-bold text-foreground tracking-tight">{cruise?.name || template.name}</h1>
            {cruise?.description && (
              <p className="text-muted-foreground mt-2 leading-relaxed">{cruise.description}</p>
            )}
          </div>

          <div className="mb-8">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground text-center mt-2">{progress}% complete</p>
          </div>

          {showPhoneInput ? (
            <Card className="shadow-md border-border/50">
              <CardHeader>
                <CardTitle className="font-serif text-xl flex items-center gap-2">
                  <Phone className="w-5 h-5 text-gold" />
                  Contact Information
                </CardTitle>
                <CardDescription className="text-base">
                  Please provide your phone number so we can reach you.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Phone Number *</Label>
                  <Input
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    type="tel"
                    autoFocus
                    data-testid="input-phone"
                  />
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={handleBack} className="gap-2">
                    <ChevronLeft className="w-4 h-4" />
                    Back
                  </Button>
                  <Button
                    className="flex-1 gap-2"
                    onClick={handlePhoneSubmit}
                    disabled={!customerPhone.trim()}
                    data-testid="button-continue"
                  >
                    Continue
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : isReview ? (
            <Card className="shadow-md border-border/50">
              <CardHeader>
                <CardTitle className="font-serif text-xl">Review Your Answers</CardTitle>
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
                      onClick={() => handleEditAnswer(stepId)}
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

                <div className="flex gap-3 pt-4">
                  <Button variant="outline" onClick={handleBack} className="gap-2">
                    <ChevronLeft className="w-4 h-4" />
                    Back
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleSubmit}
                    disabled={submitMutation.isPending}
                    data-testid="button-submit"
                  >
                    {submitMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Submitting...
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
                      title="More information"
                      data-testid="button-step-info"
                    >
                      <Info className="w-5 h-5" />
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
                  <CardTitle className="font-serif text-xl">{currentStep.question}</CardTitle>
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
                      data-testid="input-form-answer"
                    />
                    <div className="flex gap-3">
                      {history.length > 0 && (
                        <Button variant="outline" onClick={handleBack} className="gap-2">
                          <ChevronLeft className="w-4 h-4" />
                          Back
                        </Button>
                      )}
                      <Button
                        className="flex-1 gap-2"
                        onClick={handleTextSubmit}
                        disabled={!inputValue.trim()}
                        data-testid="button-next"
                      >
                        Next
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </>
                ) : currentStep.type === "choice" ? (
                  <>
                    <div className="space-y-2">
                      {currentStep.choices?.map((choice) => (
                        <Button
                          key={choice.id}
                          variant="outline"
                          className="w-full justify-start h-auto py-3 px-4 text-left"
                          onClick={() => handleChoiceSelect(choice)}
                          data-testid={`button-choice-${choice.id}`}
                        >
                          {choice.label}
                        </Button>
                      ))}
                    </div>
                    {history.length > 0 && (
                      <Button variant="ghost" onClick={handleBack} className="w-full gap-2">
                        <ChevronLeft className="w-4 h-4" />
                        Back
                      </Button>
                    )}
                  </>
                ) : currentStep.type === "quantity" ? (
                  <>
                    <div className="space-y-3">
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
                          >
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex-1">
                                <p className="font-medium">{choice.label}</p>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <DollarSign className="w-3 h-3" />
                                  ${(choice.price || 0).toFixed(2)} each
                                </div>
                              </div>
                              {soldOut ? (
                                <Badge variant="destructive">Sold Out</Badge>
                              ) : remaining !== null && (
                                <Badge variant="outline">{remaining} left</Badge>
                              )}
                            </div>
                            {!soldOut && (
                              <div className="flex items-center justify-center gap-4">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => handleQuantityChange(choice.id, -1)}
                                  disabled={currentQty === 0}
                                  data-testid={`button-minus-${choice.id}`}
                                >
                                  <Minus className="w-4 h-4" />
                                </Button>
                                <span className="text-2xl font-bold w-12 text-center">
                                  {currentQty}
                                </span>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => handleQuantityChange(choice.id, 1)}
                                  disabled={currentQty >= maxQty}
                                  data-testid={`button-plus-${choice.id}`}
                                >
                                  <Plus className="w-4 h-4" />
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex gap-3">
                      {history.length > 0 && (
                        <Button variant="outline" onClick={handleBack} className="gap-2">
                          <ChevronLeft className="w-4 h-4" />
                          Back
                        </Button>
                      )}
                      <Button
                        className="flex-1 gap-2"
                        onClick={handleQuantitySubmit}
                        data-testid="button-quantity-next"
                      >
                        Next
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </>
                ) : currentStep.type === "conclusion" ? (
                  <>
                    <div className="text-center py-4">
                      <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mx-auto mb-4">
                        <Check className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
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
                              onClick={() => handleEditAnswer(stepId)}
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
                        <Label>Phone Number *</Label>
                        <Input
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          placeholder="+1 (555) 000-0000"
                          type="tel"
                          data-testid="input-conclusion-phone"
                        />
                      </div>
                    )}

                    <div className="flex gap-3 pt-2">
                      {history.length > 0 && (
                        <Button variant="outline" onClick={handleBack} className="gap-2">
                          <ChevronLeft className="w-4 h-4" />
                          Back
                        </Button>
                      )}
                      <Button
                        className="flex-1"
                        onClick={() => {
                          if (!customerPhone.trim()) {
                            toast({
                              title: "Phone number required",
                              description: "Please enter your phone number to submit.",
                              variant: "destructive",
                            });
                            return;
                          }
                          submitMutation.mutate();
                        }}
                        disabled={submitMutation.isPending}
                        data-testid="button-conclusion-submit"
                      >
                        {submitMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Submitting...
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
            <Ship className="w-4 h-4 text-navy" />
            <span className="font-serif">CruiseBook</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
