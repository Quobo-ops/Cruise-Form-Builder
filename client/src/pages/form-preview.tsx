import { useState, useMemo } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Ship, ArrowLeft, ArrowRight, ChevronLeft, Edit } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Template, Step } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";

export default function FormPreview() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [inputValue, setInputValue] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [isReview, setIsReview] = useState(false);

  const { data: template, isLoading } = useQuery<Template>({
    queryKey: ["/api/templates", id],
  });

  const graph = template?.graph;
  
  const currentStep = useMemo(() => {
    if (!graph) return null;
    const stepId = currentStepId || graph.rootStepId;
    return graph.steps[stepId] || null;
  }, [graph, currentStepId]);

  const stepsPath = useMemo(() => {
    if (!graph) return [];
    const path: Step[] = [];
    const visited = new Set<string>();
    let current = graph.rootStepId;
    
    while (current && !visited.has(current)) {
      visited.add(current);
      const step = graph.steps[current];
      if (step) {
        path.push(step);
        if (step.type === "text") {
          current = step.nextStepId || "";
        } else {
          break;
        }
      } else {
        break;
      }
    }
    return path;
  }, [graph]);

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
      setInputValue(answers[stepId] || "");
    }
    
    const newAnswers: Record<string, string> = {};
    history.slice(0, stepIndex).forEach((id) => {
      if (answers[id]) newAnswers[id] = answers[id];
    });
    setAnswers(newAnswers);
  };

  const reset = () => {
    setCurrentStepId(null);
    setAnswers({});
    setInputValue("");
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

          <Progress value={progress} className="mb-6" />

          {isReview ? (
            <Card>
              <CardHeader>
                <CardTitle>Review Your Answers</CardTitle>
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
                <p className="text-muted-foreground">No steps configured.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
