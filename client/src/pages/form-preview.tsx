import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Ship, ArrowLeft, ArrowRight, ChevronLeft, Edit, Minus, Plus, DollarSign, Info, Anchor } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Template, Step, QuantityAnswer, Cruise, CruiseInventory } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { StepInfoPopup } from "@/components/step-info-popup";

export default function FormPreview() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  
  // Get cruise ID from query params if present
  const urlParams = new URLSearchParams(window.location.search);
  const cruiseId = urlParams.get("cruise");
  
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | QuantityAnswer[]>>({});
  const [inputValue, setInputValue] = useState("");
  const [quantitySelections, setQuantitySelections] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<string[]>([]);
  const [isReview, setIsReview] = useState(false);
  const [showInfoPopup, setShowInfoPopup] = useState(false);
  const [showInfoTooltip, setShowInfoTooltip] = useState(false);
  const hasShownInfoTooltip = useRef(false);

  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const liveRegionRef = useRef<HTMLDivElement>(null);

  const announce = useCallback((message: string) => {
    if (liveRegionRef.current) {
      liveRegionRef.current.textContent = "";
      requestAnimationFrame(() => {
        if (liveRegionRef.current) {
          liveRegionRef.current.textContent = message;
        }
      });
    }
  }, []);

  const { data: template, isLoading } = useQuery<Template>({
    queryKey: ["/api/templates", id],
    enabled: isAuthenticated,
  });

  // Fetch cruise data if previewing with cruise context
  const { data: cruise } = useQuery<Cruise>({
    queryKey: ["/api/cruises", cruiseId],
    enabled: !!cruiseId && isAuthenticated,
  });

  const { data: inventory } = useQuery<CruiseInventory[]>({
    queryKey: ["/api/cruises", cruiseId, "inventory"],
    enabled: !!cruiseId && isAuthenticated,
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

  // Get ordered list of all steps for navigation
  const orderedSteps = useMemo(() => {
    if (!graph) return [];
    const steps: Step[] = [];
    const visited = new Set<string>();
    
    const traverse = (stepId: string) => {
      if (visited.has(stepId) || !graph.steps[stepId]) return;
      visited.add(stepId);
      const step = graph.steps[stepId];
      steps.push(step);
      
      // Follow primary path first
      if (step.nextStepId) {
        traverse(step.nextStepId);
      }
      
      // Then follow choice paths
      if (step.choices) {
        step.choices.forEach(choice => {
          if (choice.nextStepId) {
            traverse(choice.nextStepId);
          }
        });
      }
    };
    
    traverse(graph.rootStepId);
    return steps;
  }, [graph]);

  const currentStepIndex = useMemo(() => {
    const stepId = currentStepId || graph?.rootStepId;
    return orderedSteps.findIndex(s => s.id === stepId);
  }, [orderedSteps, currentStepId, graph?.rootStepId]);

  // Helper to get inventory info for a choice (when in cruise context)
  const getInventoryForChoice = useCallback((stepId: string, choiceId: string) => {
    if (!inventory) return null;
    return inventory.find(i => i.stepId === stepId && i.choiceId === choiceId);
  }, [inventory]);

  const handlePreviewNavigate = (direction: 'prev' | 'next') => {
    if (orderedSteps.length === 0) return;
    
    // Clear review state when navigating
    if (isReview) {
      setIsReview(false);
    }
    
    let newIndex = currentStepIndex;
    if (direction === 'prev') {
      newIndex = Math.max(0, currentStepIndex - 1);
    } else {
      newIndex = Math.min(orderedSteps.length - 1, currentStepIndex + 1);
    }
    
    const newStep = orderedSteps[newIndex];
    if (newStep) {
      setCurrentStepId(newStep.id);
      // Reset input state when navigating
      setInputValue("");
      setQuantitySelections({});
    }
  };

  const canNavigatePrev = currentStepIndex > 0;
  const canNavigateNext = currentStepIndex < orderedSteps.length - 1;

  // Focus management on step transitions
  useEffect(() => {
    const timer = setTimeout(() => {
      if (stepHeadingRef.current) {
        stepHeadingRef.current.focus();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [currentStepId, isReview]);

  // Screen reader step announcements
  useEffect(() => {
    if (isReview) {
      announce("Review your answers.");
    } else if (currentStep) {
      announce(`Step ${currentStepIndex + 1} of ${orderedSteps.length}: ${currentStep.question}`);
    }
  }, [currentStepId, isReview, currentStep, currentStepIndex, orderedSteps.length, announce]);

  // Show info tooltip once on first info-enabled step
  useEffect(() => {
    if (currentStep?.infoPopup?.enabled && !hasShownInfoTooltip.current) {
      hasShownInfoTooltip.current = true;
      setShowInfoTooltip(true);
      const timer = setTimeout(() => setShowInfoTooltip(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [currentStep]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const handleTextSubmit = () => {
    if (!currentStep || !inputValue.trim()) return;
    
    const newAnswers = { ...answers, [currentStep.id]: inputValue };
    setAnswers(newAnswers);
    setHistory([...history, currentStep.id]);
    setInputValue("");
    
    if (currentStep.nextStepId && graph?.steps[currentStep.nextStepId]) {
      setCurrentStepId(currentStep.nextStepId);
    } else {
      setIsReview(true);
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
      setIsReview(true);
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

    const newAnswers = { ...answers, [currentStep.id]: quantityAnswers };
    setAnswers(newAnswers);
    setHistory([...history, currentStep.id]);
    setQuantitySelections({});

    if (currentStep.nextStepId && graph?.steps[currentStep.nextStepId]) {
      setCurrentStepId(currentStep.nextStepId);
    } else {
      setIsReview(true);
    }
  };

  const handleBack = () => {
    if (isReview) {
      const lastStepId = history[history.length - 1];
      if (lastStepId) {
        setIsReview(false);
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
    toast({
      title: "Preview Mode",
      description: "In the live form, this would submit the booking.",
    });
  };

  const handleEditAnswer = (stepId: string) => {
    const stepIndex = history.indexOf(stepId);
    if (stepIndex === -1) return;
    
    setIsReview(false);
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

  const reset = () => {
    setCurrentStepId(null);
    setAnswers({});
    setInputValue("");
    setQuantitySelections({});
    setHistory([]);
    setIsReview(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md" aria-busy="true">
          <CardHeader>
            <Skeleton className="h-6 w-3/4" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
        <span className="sr-only">Loading form preview...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      <div ref={liveRegionRef} className="sr-only" aria-live="polite" aria-atomic="true" role="status" />
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <Ship className="w-5 h-5 text-primary-foreground" />
            </div>
            {cruiseId && cruise ? (
              <Breadcrumbs items={[
                { label: "Cruises", href: "/admin/cruises" },
                { label: cruise.name, href: `/admin/cruises/${cruiseId}` },
                { label: "Preview" },
              ]} />
            ) : (
              <Breadcrumbs items={[
                { label: "Templates", href: "/admin/templates" },
                { label: template?.name || "Template", href: `/admin/builder/${id}` },
                { label: "Preview" },
              ]} />
            )}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {cruiseId ? (
              <Link href={`/admin/cruises/${cruiseId}`}>
                <Button variant="outline" size="sm" className="gap-2">
                  <Anchor className="w-4 h-4" />
                  Back to Cruise
                </Button>
              </Link>
            ) : (
              <Link href={`/admin/builder/${id}`}>
                <Button variant="outline" size="sm" className="gap-2">
                  <Edit className="w-4 h-4" />
                  Edit
                </Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 flex flex-col items-center">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-md bg-primary flex items-center justify-center mx-auto mb-3">
              <Ship className="w-7 h-7 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-bold text-foreground">
              {cruiseId && cruise ? cruise.name : template?.name}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {cruiseId && cruise ? (
                <>Preview Mode &middot; {template?.name}</>
              ) : (
                "Preview Mode"
              )}
            </p>
            {cruise?.startDate && (
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(cruise.startDate).toLocaleDateString()} - {cruise.endDate ? new Date(cruise.endDate).toLocaleDateString() : "TBD"}
              </p>
            )}
          </div>

          <Progress value={progress} className="mb-4" />

          {/* Preview Navigation - Arrow buttons to browse wireframes */}
          <div className="flex items-center justify-between mb-6 p-2 bg-muted/50 rounded-md">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handlePreviewNavigate('prev')}
              disabled={!canNavigatePrev}
              aria-label="Previous step"
              data-testid="button-preview-prev"
            >
              <ArrowLeft className="w-5 h-5" aria-hidden="true" />
            </Button>
            <span className="text-sm text-muted-foreground" aria-current="step">
              Step {currentStepIndex + 1} of {orderedSteps.length}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handlePreviewNavigate('next')}
              disabled={!canNavigateNext}
              aria-label="Next step"
              data-testid="button-preview-next"
            >
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </Button>
          </div>

          {isReview ? (
            <Card>
              <CardHeader>
                <CardTitle ref={stepHeadingRef} tabIndex={-1} className="outline-none">Review Your Answers</CardTitle>
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

                {calculateTotal() > 0 && (
                  <div className="p-4 bg-primary/10 rounded-md flex justify-between items-center">
                    <span className="font-semibold">Total</span>
                    <span className="text-xl font-bold">${calculateTotal().toFixed(2)}</span>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <Button variant="outline" onClick={handleBack} className="gap-2" aria-label="Go back to previous step">
                    <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                    Back
                  </Button>
                  <Button className="flex-1" onClick={handleSubmit} data-testid="button-submit-preview" aria-label="Submit booking (preview mode)">
                    Submit Booking
                  </Button>
                </div>
                <Button variant="ghost" onClick={reset} className="w-full text-muted-foreground">
                  Start Over
                </Button>
              </CardContent>
            </Card>
          ) : currentStep ? (
            <>
              {currentStep.infoPopup?.enabled && (
                <StepInfoPopup
                  infoPopup={currentStep.infoPopup}
                  open={showInfoPopup}
                  onOpenChange={setShowInfoPopup}
                />
              )}
              <Card className="relative">
                <CardHeader>
                  <CardTitle ref={stepHeadingRef} tabIndex={-1} className="text-lg outline-none pr-12">{currentStep.question}</CardTitle>
                </CardHeader>
                {currentStep.infoPopup?.enabled && (
                  <div className="absolute top-3 right-3 flex items-center gap-2">
                    <div className={`text-xs bg-popover border rounded-md px-2 py-1 shadow-md transition-opacity duration-700 whitespace-nowrap ${showInfoTooltip ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                      Tap for more info
                    </div>
                    <Button
                      size="icon"
                      onClick={() => setShowInfoPopup(true)}
                      className="rounded-full shadow-lg shrink-0"
                      aria-label="More information about this question"
                      data-testid="button-step-info"
                    >
                      <Info className="w-5 h-5" aria-hidden="true" />
                    </Button>
                  </div>
                )}
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
                        <Button variant="outline" onClick={handleBack} className="gap-2" aria-label="Go back to previous step">
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
                      <Button variant="ghost" onClick={handleBack} className="w-full gap-2" aria-label="Go back to previous step">
                        <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                        Back
                      </Button>
                    )}
                  </>
                ) : currentStep.type === "quantity" ? (
                  <>
                    <div className="space-y-3" role="group" aria-label="Select quantities">
                      {currentStep.quantityChoices?.map((choice) => {
                        const currentQty = quantitySelections[choice.id] || 0;
                        const inventoryItem = getInventoryForChoice(currentStep.id, choice.id);
                        const remaining = inventoryItem?.stockLimit !== null && inventoryItem?.stockLimit !== undefined
                          ? Math.max(0, inventoryItem.stockLimit - inventoryItem.totalOrdered)
                          : null;
                        const isSoldOut = remaining !== null && remaining <= 0;

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
                          <div key={choice.id} className={`p-4 border rounded-md ${isSoldOut ? 'opacity-60' : ''}`} role="group" aria-label={`${choice.label}, $${(choice.price || 0).toFixed(2)} each`}>
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex-1">
                                <p className="font-medium">{choice.label}</p>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <DollarSign className="w-3 h-3" aria-hidden="true" />
                                  ${(choice.price || 0).toFixed(2)} each
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {/* Show cruise inventory info when available */}
                                {cruiseId && remaining !== null && (
                                  <Badge variant={isSoldOut ? "destructive" : "outline"} aria-label={isSoldOut ? "Sold out" : `${remaining} remaining`}>
                                    {isSoldOut ? "Sold Out" : `${remaining} left`}
                                  </Badge>
                                )}
                                {!cruiseId && choice.limit && (
                                  <Badge variant="outline" aria-label={`Maximum ${choice.limit}`}>{choice.limit} max</Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center justify-center gap-4">
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleQuantityChange(choice.id, -1)}
                                disabled={currentQty === 0 || isSoldOut}
                                aria-label={`Decrease quantity for ${choice.label}`}
                                data-testid={`button-minus-${choice.id}`}
                              >
                                <Minus className="w-4 h-4" aria-hidden="true" />
                              </Button>
                              <span className="text-2xl font-bold w-12 text-center" aria-live="polite" aria-label={`${currentQty} selected for ${choice.label}`}>
                                {currentQty}
                              </span>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleQuantityChange(choice.id, 1)}
                                disabled={isSoldOut || (remaining !== null ? currentQty >= remaining : (choice.limit ? currentQty >= choice.limit : false))}
                                aria-label={`Increase quantity for ${choice.label}`}
                                data-testid={`button-plus-${choice.id}`}
                              >
                                <Plus className="w-4 h-4" aria-hidden="true" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex gap-3">
                      {history.length > 0 && (
                        <Button variant="outline" onClick={handleBack} className="gap-2" aria-label="Go back to previous step">
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
                ) : null}
              </CardContent>
            </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">No steps configured.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
