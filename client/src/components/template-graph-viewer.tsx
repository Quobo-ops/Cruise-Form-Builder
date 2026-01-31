import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { 
  ChevronLeft, 
  ChevronRight, 
  MessageSquare, 
  List, 
  ShoppingCart,
  ArrowDown,
  GitBranch,
  X
} from "lucide-react";
import type { FormGraph, Step } from "@shared/schema";

interface TemplateGraphViewerProps {
  graph: FormGraph;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PathNode {
  stepId: string;
  step: Step;
  selectedChoiceId?: string;
  selectedChoiceLabel?: string;
}

export function TemplateGraphViewer({ graph, open, onOpenChange }: TemplateGraphViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [choiceSelections, setChoiceSelections] = useState<Record<string, string>>({});

  const buildPath = useCallback((g: FormGraph, selections: Record<string, string>): PathNode[] => {
    const nodes: PathNode[] = [];
    let currentStepId: string | null = g.rootStepId;
    const visitedSteps = new Set<string>();
    
    while (currentStepId && g.steps[currentStepId] && !visitedSteps.has(currentStepId)) {
      visitedSteps.add(currentStepId);
      const step: Step = g.steps[currentStepId];
      
      const node: PathNode = {
        stepId: currentStepId,
        step,
      };

      if (step.type === "choice" && step.choices && step.choices.length > 0) {
        const stepId = currentStepId;
        const selectedChoiceId: string = selections[stepId] || step.choices[0].id;
        const selectedChoice = step.choices.find(c => c.id === selectedChoiceId) || step.choices[0];
        node.selectedChoiceId = selectedChoice.id;
        node.selectedChoiceLabel = selectedChoice.label;
        currentStepId = selectedChoice.nextStepId;
      } else if (step.type === "text" || step.type === "quantity") {
        currentStepId = step.nextStepId || null;
      } else {
        currentStepId = null;
      }

      nodes.push(node);

      if (nodes.length > 50) break;
    }

    return nodes;
  }, []);

  const pathNodes = useMemo(() => {
    return buildPath(graph, choiceSelections);
  }, [graph, choiceSelections, buildPath]);

  const safeCurrentIndex = Math.min(currentIndex, Math.max(0, pathNodes.length - 1));
  const currentNode = pathNodes[safeCurrentIndex];

  const handleNext = () => {
    if (safeCurrentIndex < pathNodes.length - 1) {
      setCurrentIndex(safeCurrentIndex + 1);
    }
  };

  const handlePrev = () => {
    if (safeCurrentIndex > 0) {
      setCurrentIndex(safeCurrentIndex - 1);
    }
  };

  const handleChoiceSelect = (stepId: string, choiceId: string) => {
    const newSelections = { ...choiceSelections, [stepId]: choiceId };
    setChoiceSelections(newSelections);
    
    const newPath = buildPath(graph, newSelections);
    const stepIndexInNewPath = newPath.findIndex(n => n.stepId === stepId);
    if (stepIndexInNewPath >= 0 && stepIndexInNewPath < newPath.length - 1) {
      setCurrentIndex(stepIndexInNewPath + 1);
    }
  };

  const getStepIcon = (type: string) => {
    switch (type) {
      case "text": return <MessageSquare className="w-4 h-4" />;
      case "choice": return <List className="w-4 h-4" />;
      case "quantity": return <ShoppingCart className="w-4 h-4" />;
      default: return <MessageSquare className="w-4 h-4" />;
    }
  };

  const getStepTypeBadge = (type: string) => {
    switch (type) {
      case "text": return <Badge variant="secondary">Text Input</Badge>;
      case "choice": return <Badge variant="secondary">Choice</Badge>;
      case "quantity": return <Badge variant="secondary">Quantity</Badge>;
      default: return <Badge variant="secondary">{type}</Badge>;
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setCurrentIndex(0);
      setChoiceSelections({});
    }
    onOpenChange(newOpen);
  };

  const getTotalBranches = () => {
    let count = 0;
    Object.values(graph.steps).forEach(step => {
      if (step.type === "choice" && step.choices) {
        count += step.choices.length;
      }
    });
    return count;
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="flex items-center gap-2">
              <GitBranch className="w-5 h-5" />
              Template Flow Review
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleOpenChange(false)}
              data-testid="button-close-review"
              aria-label="Close review"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="text-sm text-muted-foreground">
            {Object.keys(graph.steps).length} steps with {getTotalBranches()} choice branches
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex items-center justify-center gap-2 py-3 border-b">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrev}
              disabled={safeCurrentIndex === 0}
              className="gap-1"
              data-testid="button-review-prev"
              aria-label="Go to previous step"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Button>
            <div className="flex items-center gap-2 px-4">
              <span className="text-sm text-muted-foreground">
                Step {safeCurrentIndex + 1} of {pathNodes.length}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNext}
              disabled={safeCurrentIndex >= pathNodes.length - 1}
              className="gap-1"
              data-testid="button-review-next"
              aria-label="Go to next step"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-auto py-4">
            <div className="flex flex-col items-center gap-2">
              {pathNodes.map((node, index) => (
                <div key={node.stepId} className="flex flex-col items-center w-full max-w-lg">
                  {index > 0 && (
                    <div className="flex flex-col items-center py-1">
                      <ArrowDown className="w-4 h-4 text-muted-foreground" />
                      {node.selectedChoiceLabel && (
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded mt-1">
                          via: {pathNodes[index - 1]?.selectedChoiceLabel || ""}
                        </span>
                      )}
                    </div>
                  )}
                  <Card 
                    className={`w-full p-4 cursor-pointer transition-all ${
                      index === safeCurrentIndex 
                        ? "ring-2 ring-primary shadow-lg" 
                        : "opacity-60"
                    }`}
                    onClick={() => setCurrentIndex(index)}
                    data-testid={`graph-node-${node.stepId}`}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setCurrentIndex(index);
                      }
                    }}
                    aria-label={`Step ${index + 1}: ${node.step.question}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-md flex-shrink-0 ${
                        index === safeCurrentIndex ? "bg-primary/10" : "bg-muted"
                      }`}>
                        {getStepIcon(node.step.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs text-muted-foreground">#{index + 1}</span>
                          {getStepTypeBadge(node.step.type)}
                          {node.stepId === graph.rootStepId && (
                            <Badge variant="default" className="text-xs">Start</Badge>
                          )}
                        </div>
                        <p className="font-medium text-sm">{node.step.question}</p>
                        
                        {index === safeCurrentIndex && node.step.type === "choice" && node.step.choices && (
                          <div className="mt-3 space-y-1">
                            <p className="text-xs text-muted-foreground mb-2">
                              Select a choice to explore that path:
                            </p>
                            {node.step.choices.map((choice) => {
                              const isSelected = node.selectedChoiceId === choice.id;
                              const hasNextStep = choice.nextStepId && graph.steps[choice.nextStepId];
                              
                              return (
                                <Button
                                  key={choice.id}
                                  variant={isSelected ? "default" : "outline"}
                                  size="sm"
                                  className="w-full justify-start gap-2"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleChoiceSelect(node.stepId, choice.id);
                                  }}
                                  data-testid={`choice-option-${choice.id}`}
                                >
                                  {isSelected && <div className="w-2 h-2 rounded-full bg-primary-foreground flex-shrink-0" />}
                                  <span className="flex-1 text-left truncate">{choice.label}</span>
                                  {hasNextStep ? (
                                    <Badge variant="outline" className="text-xs ml-auto flex-shrink-0">
                                      continues
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-xs ml-auto flex-shrink-0">
                                      ends
                                    </Badge>
                                  )}
                                </Button>
                              );
                            })}
                          </div>
                        )}

                        {index === safeCurrentIndex && node.step.type === "text" && (
                          <div className="mt-3 p-2 rounded bg-muted/50 text-sm text-muted-foreground">
                            User enters: {node.step.placeholder || "their response"}
                          </div>
                        )}

                        {index === safeCurrentIndex && node.step.type === "quantity" && node.step.quantityChoices && (
                          <div className="mt-3 space-y-1">
                            {node.step.quantityChoices.slice(0, 3).map((qc) => (
                              <div key={qc.id} className="p-2 rounded bg-muted/50 text-sm flex justify-between gap-2">
                                <span className="truncate">{qc.label}</span>
                                {!qc.isNoThanks && <span className="text-muted-foreground flex-shrink-0">${qc.price}</span>}
                              </div>
                            ))}
                            {node.step.quantityChoices.length > 3 && (
                              <p className="text-xs text-muted-foreground text-center">
                                +{node.step.quantityChoices.length - 3} more items
                              </p>
                            )}
                          </div>
                        )}

                        {index !== safeCurrentIndex && node.step.type === "choice" && node.step.choices && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            {node.step.choices.length} choices - selected: {node.selectedChoiceLabel}
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                </div>
              ))}

              <div className="flex flex-col items-center py-1">
                <ArrowDown className="w-4 h-4 text-muted-foreground" />
                <div className="mt-2 p-3 rounded-md border-2 border-dashed border-muted-foreground/30 text-center">
                  <Badge variant="outline">Form Submission</Badge>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
