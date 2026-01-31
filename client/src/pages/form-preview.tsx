import { useState, useMemo } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Ship, ArrowLeft, ArrowRight, ChevronLeft, Edit, Minus, Plus, DollarSign, Info } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Template, Step, QuantityAnswer } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { StepInfoPopup } from "@/components/step-info-popup";

export default function FormPreview() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | QuantityAnswer[]>>({});
  const [inputValue, setInputValue] = useState("");
  const [quantitySelections, setQuantitySelections] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<string[]>([]);
  const [isReview, setIsReview] = useState(false);
  const [showInfoPopup, setShowInfoPopup] = useState(false);

  const { data: template, isLoading } = useQuery<Template>({
    queryKey: ["/api/templates", id],
    enabled: isAuthenticated,
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

    const quantityAnswers: QuantityAnswer[] = currentStep.quantityChoices.map(choice => ({
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
        <Card className="w-full max-w-md">
          <CardHeader>
            <Skeleton className="h-6 w-3/4" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <Link href={`/admin/builder/${id}`} className="flex items-center gap-2 text-muted-foreground hover-elevate rounded-md px-2 py-1">
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back to Editor</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href={`/admin/builder/${id}`}>
              <Button variant="outline" size="sm" className="gap-2">
                <Edit className="w-4 h-4" />
                Edit
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 flex flex-col items-center">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-md bg-primary flex items-center justify-center mx-auto mb-3">
              <Ship className="w-7 h-7 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-bold text-foreground">{template?.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">Preview Mode</p>
          </div>

          <Progress value={progress} className="mb-4" />

          {/* Preview Navigation - Arrow buttons to browse wireframes */}
          <div className="flex items-center justify-between mb-6 p-2 bg-muted/50 rounded-md">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handlePreviewNavigate('prev')}
              disabled={!canNavigatePrev}
              data-testid="button-preview-prev"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Step {currentStepIndex + 1} of {orderedSteps.length}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handlePreviewNavigate('next')}
              disabled={!canNavigateNext}
              data-testid="button-preview-next"
            >
              <ArrowRight className="w-5 h-5" />
            </Button>
          </div>

          {isReview ? (
            <Card>
              <CardHeader>
                <CardTitle>Review Your Answers</CardTitle>
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
                  <Button variant="outline" onClick={handleBack} className="gap-2">
                    <ChevronLeft className="w-4 h-4" />
                    Back
                  </Button>
                  <Button className="flex-1" onClick={handleSubmit} data-testid="button-submit-preview">
                    Submit Booking
                  </Button>
                </div>
                <Button variant="ghost" onClick={reset} className="w-full text-muted-foreground">
                  Start Over
                </Button>
              </CardContent>
            </Card>
          ) : currentStep ? (
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <CardTitle className="text-lg flex-1">{currentStep.question}</CardTitle>
                {currentStep.infoPopup?.enabled && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowInfoPopup(true)}
                    className="flex-shrink-0 animate-pulse border-blue-400 text-blue-500 hover:bg-blue-50 dark:border-blue-600 dark:text-blue-400 dark:hover:bg-blue-900/20"
                    title="More information"
                    data-testid="button-step-info"
                  >
                    <Info className="w-4 h-4" />
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {currentStep.infoPopup?.enabled && currentStep.infoPopup && (
                  <StepInfoPopup
                    infoPopup={currentStep.infoPopup}
                    open={showInfoPopup}
                    onOpenChange={setShowInfoPopup}
                  />
                )}
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
                        const currentQty = quantitySelections[choice.id] || 0;

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
                          <div key={choice.id} className="p-4 border rounded-md">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex-1">
                                <p className="font-medium">{choice.label}</p>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <DollarSign className="w-3 h-3" />
                                  ${(choice.price || 0).toFixed(2)} each
                                </div>
                              </div>
                              {choice.limit && (
                                <Badge variant="outline">{choice.limit} max</Badge>
                              )}
                            </div>
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
                                disabled={choice.limit ? currentQty >= choice.limit : false}
                                data-testid={`button-plus-${choice.id}`}
                              >
                                <Plus className="w-4 h-4" />
                              </Button>
                            </div>
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
                ) : null}
              </CardContent>
            </Card>
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
