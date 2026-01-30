import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Ship, ArrowRight, ChevronLeft, Check, Loader2, Anchor } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { apiRequest } from "@/lib/queryClient";
import type { Template, Step } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";

export default function PublicForm() {
  const { shareId } = useParams<{ shareId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [inputValue, setInputValue] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [isReview, setIsReview] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const { data: template, isLoading, error } = useQuery<Template>({
    queryKey: ["/api/forms", shareId],
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/forms/${shareId}/submit`, { answers });
    },
    onSuccess: () => {
      setIsSubmitted(true);
      toast({
        title: "Booking submitted!",
        description: "Thank you for your submission.",
      });
    },
    onError: () => {
      toast({
        title: "Submission failed",
        description: "Please try again.",
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

  const handleBack = () => {
    if (isReview) {
      const lastStepId = history[history.length - 1];
      if (lastStepId) {
        setIsReview(false);
        setCurrentStepId(lastStepId);
        const step = graph?.steps[lastStepId];
        if (step?.type === "text") {
          setInputValue(answers[lastStepId] || "");
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
    submitMutation.mutate();
  };

  const handleEditAnswer = (stepId: string) => {
    const stepIndex = history.indexOf(stepId);
    if (stepIndex === -1) return;
    
    setIsReview(false);
    setHistory(history.slice(0, stepIndex));
    setCurrentStepId(stepId);
    
    const step = graph?.steps[stepId];
    if (step?.type === "text") {
      setInputValue(answers[stepId] || "");
    }
    
    const newAnswers: Record<string, string> = {};
    history.slice(0, stepIndex).forEach((id) => {
      if (answers[id]) newAnswers[id] = answers[id];
    });
    setAnswers(newAnswers);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <Ship className="w-7 h-7 text-primary animate-pulse" />
            </div>
            <Skeleton className="h-6 w-3/4 mx-auto" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="py-12">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <Anchor className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">Form Not Found</h2>
            <p className="text-muted-foreground mb-6">
              This booking form is no longer available or the link is invalid.
            </p>
            <Button variant="outline" onClick={() => setLocation("/")}>
              Go to Homepage
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="py-12">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">Booking Submitted!</h2>
            <p className="text-muted-foreground mb-6">
              Thank you for your submission. We&apos;ll be in touch soon.
            </p>
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Ship className="w-5 h-5" />
              <span>{template.name}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      <header className="bg-background/80 backdrop-blur-sm sticky top-0 z-50 py-3">
        <div className="container mx-auto px-4 flex items-center justify-end">
          <ThemeToggle />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 flex flex-col items-center">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-md bg-primary flex items-center justify-center mx-auto mb-3">
              <Ship className="w-7 h-7 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-bold text-foreground">{template.name}</h1>
          </div>

          <Progress value={progress} className="mb-6" />

          {isReview ? (
            <Card>
              <CardHeader>
                <CardTitle>Review Your Answers</CardTitle>
                <CardDescription>
                  Tap any answer to edit it before submitting.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {history.map((stepId) => {
                  const step = graph?.steps[stepId];
                  if (!step) return null;
                  return (
                    <div
                      key={stepId}
                      className="p-4 bg-muted rounded-md cursor-pointer hover-elevate"
                      onClick={() => handleEditAnswer(stepId)}
                      data-testid={`review-answer-${stepId}`}
                    >
                      <p className="text-sm text-muted-foreground mb-1">{step.question}</p>
                      <p className="font-medium">{answers[stepId]}</p>
                    </div>
                  );
                })}
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
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{currentStep.question}</CardTitle>
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
                ) : (
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
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">This form has no steps configured.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <footer className="mt-auto py-6">
        <div className="container mx-auto px-4 text-center">
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
            <Ship className="w-3 h-3" />
            Powered by CruiseBook
          </p>
        </div>
      </footer>
    </div>
  );
}
