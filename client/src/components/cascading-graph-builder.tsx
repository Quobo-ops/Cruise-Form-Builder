import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Plus,
  Trash2,
  MessageSquare,
  List,
  ShoppingCart,
  ChevronDown,
  ChevronRight,
  GripVertical,
  DollarSign,
  ArrowDown,
  Flag,
} from "lucide-react";
import type { FormGraph, Step, QuantityChoice } from "@shared/schema";

interface CascadingGraphBuilderProps {
  graph: FormGraph;
  onGraphChange: (graph: FormGraph) => void;
  selectedStepId: string | null;
  onSelectStep: (stepId: string | null) => void;
}

interface StepNodeProps {
  step: Step;
  graph: FormGraph;
  depth: number;
  isRoot: boolean;
  parentChoiceLabel?: string;
  onGraphChange: (graph: FormGraph) => void;
  selectedStepId: string | null;
  onSelectStep: (stepId: string | null) => void;
  visitedSteps: Set<string>;
  onAddStepAfter: (afterStepId: string, type: "text" | "choice" | "quantity", choiceId?: string) => void;
  onUpdateStep: (stepId: string, updates: Partial<Step>) => void;
  onDeleteStep: (stepId: string) => void;
}

function StepNode({
  step,
  graph,
  depth,
  isRoot,
  parentChoiceLabel,
  onGraphChange,
  selectedStepId,
  onSelectStep,
  visitedSteps,
  onAddStepAfter,
  onUpdateStep,
  onDeleteStep,
}: StepNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const isSelected = selectedStepId === step.id;

  if (visitedSteps.has(step.id)) {
    return (
      <div className="ml-8 pl-4 border-l-2 border-dashed border-muted-foreground/30">
        <Badge variant="outline" className="text-xs">
          Loop to: {step.question.slice(0, 20)}...
        </Badge>
      </div>
    );
  }

  const newVisited = new Set(visitedSteps);
  newVisited.add(step.id);

  const getStepIcon = (type: string) => {
    switch (type) {
      case "text":
        return <MessageSquare className="w-4 h-4" />;
      case "choice":
        return <List className="w-4 h-4" />;
      case "quantity":
        return <ShoppingCart className="w-4 h-4" />;
      default:
        return <MessageSquare className="w-4 h-4" />;
    }
  };

  const handleAddChoice = () => {
    if (step.type !== "choice" || !step.choices) return;
    const newChoiceId = `choice-${Date.now()}`;
    onUpdateStep(step.id, {
      choices: [
        ...step.choices,
        { id: newChoiceId, label: `Option ${step.choices.length + 1}`, nextStepId: null },
      ],
    });
  };

  const handleUpdateChoice = (choiceId: string, updates: { label?: string; nextStepId?: string | null }) => {
    if (step.type !== "choice" || !step.choices) return;
    onUpdateStep(step.id, {
      choices: step.choices.map((c) => (c.id === choiceId ? { ...c, ...updates } : c)),
    });
  };

  const handleDeleteChoice = (choiceId: string) => {
    if (step.type !== "choice" || !step.choices || step.choices.length <= 1) return;
    onUpdateStep(step.id, {
      choices: step.choices.filter((c) => c.id !== choiceId),
    });
  };

  const handleAddQuantityChoice = () => {
    if (step.type !== "quantity" || !step.quantityChoices) return;
    onUpdateStep(step.id, {
      quantityChoices: [
        ...step.quantityChoices,
        { id: `qc-${Date.now()}`, label: `Item ${step.quantityChoices.length + 1}`, price: 0, limit: null, isNoThanks: false },
      ],
    });
  };

  const handleUpdateQuantityChoice = (choiceId: string, updates: Partial<QuantityChoice>) => {
    if (step.type !== "quantity" || !step.quantityChoices) return;
    onUpdateStep(step.id, {
      quantityChoices: step.quantityChoices.map((c) => (c.id === choiceId ? { ...c, ...updates } : c)),
    });
  };

  const handleDeleteQuantityChoice = (choiceId: string) => {
    if (step.type !== "quantity" || !step.quantityChoices || step.quantityChoices.length <= 1) return;
    onUpdateStep(step.id, {
      quantityChoices: step.quantityChoices.filter((c) => c.id !== choiceId),
    });
  };

  const renderNextStep = (nextStepId: string | null | undefined, choiceId?: string, branchLabel?: string) => {
    if (nextStepId && graph.steps[nextStepId]) {
      return (
        <div className="mt-2">
          <StepNode
            step={graph.steps[nextStepId]}
            graph={graph}
            depth={depth + 1}
            isRoot={false}
            parentChoiceLabel={branchLabel}
            onGraphChange={onGraphChange}
            selectedStepId={selectedStepId}
            onSelectStep={onSelectStep}
            visitedSteps={newVisited}
            onAddStepAfter={onAddStepAfter}
            onUpdateStep={onUpdateStep}
            onDeleteStep={onDeleteStep}
          />
        </div>
      );
    }
    return (
      <div className="mt-3 flex flex-col items-center gap-2">
        <ArrowDown className="w-4 h-4 text-muted-foreground" />
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="gap-1 text-xs"
            onClick={() => onAddStepAfter(step.id, "text", choiceId)}
            data-testid={`button-add-text-after-${step.id}${choiceId ? `-${choiceId}` : ""}`}
          >
            <MessageSquare className="w-3 h-3" />
            Text
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1 text-xs"
            onClick={() => onAddStepAfter(step.id, "choice", choiceId)}
            data-testid={`button-add-choice-after-${step.id}${choiceId ? `-${choiceId}` : ""}`}
          >
            <List className="w-3 h-3" />
            Choice
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1 text-xs"
            onClick={() => onAddStepAfter(step.id, "quantity", choiceId)}
            data-testid={`button-add-quantity-after-${step.id}${choiceId ? `-${choiceId}` : ""}`}
          >
            <ShoppingCart className="w-3 h-3" />
            Quantity
          </Button>
        </div>
        <Badge variant="secondary" className="text-xs">
          <Flag className="w-3 h-3 mr-1" />
          End / Submit
        </Badge>
      </div>
    );
  };

  return (
    <div className={`${depth > 0 ? "ml-6 pl-4 border-l-2 border-muted-foreground/20" : ""}`}>
      {parentChoiceLabel && (
        <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
          <ArrowDown className="w-3 h-3" />
          <span className="bg-muted px-2 py-0.5 rounded">If: {parentChoiceLabel}</span>
        </div>
      )}
      
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <Card
          className={`p-3 cursor-pointer transition-all ${
            isSelected ? "ring-2 ring-primary shadow-md" : "hover-elevate"
          }`}
          onClick={() => {
            onSelectStep(step.id);
            setIsEditing(true);
          }}
          data-testid={`step-node-${step.id}`}
        >
          <div className="flex items-start gap-2">
            <CollapsibleTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="flex-shrink-0" data-testid={`button-toggle-${step.id}`}>
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            
            <div className="flex-shrink-0 p-1.5 rounded bg-muted">
              {getStepIcon(step.type)}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <Badge variant="outline" className="text-xs">
                  {step.type === "text" ? "Text" : step.type === "choice" ? "Choice" : "Quantity"}
                </Badge>
                {isRoot && (
                  <Badge variant="default" className="text-xs">Start</Badge>
                )}
              </div>
              
              {isEditing && isSelected ? (
                <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                  <div className="space-y-1">
                    <Label className="text-xs">Question / Header</Label>
                    <Textarea
                      value={step.question}
                      onChange={(e) => onUpdateStep(step.id, { question: e.target.value })}
                      className="min-h-16 text-sm"
                      data-testid={`input-question-${step.id}`}
                    />
                  </div>

                  {step.type === "text" && (
                    <div className="space-y-1">
                      <Label className="text-xs">Placeholder</Label>
                      <Input
                        value={step.placeholder || ""}
                        onChange={(e) => onUpdateStep(step.id, { placeholder: e.target.value })}
                        className="text-sm"
                        data-testid={`input-placeholder-${step.id}`}
                      />
                    </div>
                  )}

                  {step.type === "choice" && step.choices && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Choices</Label>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleAddChoice}
                          className="text-xs gap-1"
                          data-testid={`button-add-choice-${step.id}`}
                        >
                          <Plus className="w-3 h-3" />
                          Add
                        </Button>
                      </div>
                      {step.choices.map((choice, idx) => (
                        <div key={choice.id} className="flex items-center gap-2">
                          <GripVertical className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          <Input
                            value={choice.label}
                            onChange={(e) => handleUpdateChoice(choice.id, { label: e.target.value })}
                            className="text-sm h-8"
                            data-testid={`input-choice-${step.id}-${idx}`}
                          />
                          {step.choices!.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive flex-shrink-0"
                              onClick={() => handleDeleteChoice(choice.id)}
                              data-testid={`button-delete-choice-${step.id}-${idx}`}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {step.type === "quantity" && step.quantityChoices && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Items</Label>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleAddQuantityChoice}
                          className="text-xs gap-1"
                          data-testid={`button-add-item-${step.id}`}
                        >
                          <Plus className="w-3 h-3" />
                          Add Item
                        </Button>
                      </div>
                      {step.quantityChoices.map((qc, idx) => (
                        <div key={qc.id} className="p-2 border rounded space-y-2">
                          <div className="flex items-center gap-2">
                            <Input
                              value={qc.label}
                              onChange={(e) => handleUpdateQuantityChoice(qc.id, { label: e.target.value })}
                              className="text-sm h-8"
                              placeholder="Item name"
                              data-testid={`input-item-${step.id}-${idx}`}
                            />
                            {step.quantityChoices!.length > 1 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive flex-shrink-0"
                                onClick={() => handleDeleteQuantityChoice(qc.id)}
                                data-testid={`button-delete-item-${step.id}-${idx}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs flex items-center gap-1">
                                <DollarSign className="w-3 h-3" />
                                Price
                              </Label>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={qc.price || 0}
                                onChange={(e) => handleUpdateQuantityChoice(qc.id, { price: parseFloat(e.target.value) || 0 })}
                                disabled={qc.isNoThanks}
                                className="text-sm"
                                data-testid={`input-price-${step.id}-${idx}`}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Limit</Label>
                              <Input
                                type="number"
                                min="0"
                                value={qc.limit || ""}
                                onChange={(e) => handleUpdateQuantityChoice(qc.id, { limit: e.target.value ? parseInt(e.target.value) : null })}
                                placeholder="No limit"
                                disabled={qc.isNoThanks}
                                className="text-sm"
                                data-testid={`input-limit-${step.id}-${idx}`}
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={qc.isNoThanks || false}
                              onCheckedChange={(checked) => handleUpdateQuantityChoice(qc.id, {
                                isNoThanks: checked,
                                price: checked ? 0 : qc.price,
                                limit: checked ? null : qc.limit,
                              })}
                              data-testid={`switch-skip-${step.id}-${idx}`}
                            />
                            <Label className="text-xs text-muted-foreground">Skip option</Label>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {!isRoot && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive gap-1"
                      onClick={() => onDeleteStep(step.id)}
                      data-testid={`button-delete-step-${step.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete Step
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-sm truncate">{step.question}</p>
              )}
            </div>
          </div>
        </Card>

        <CollapsibleContent>
          {step.type === "choice" && step.choices && step.choices.length > 0 ? (
            <div className="mt-4 space-y-4">
              {step.choices.map((choice) => (
                <div key={choice.id} className="relative">
                  <div className="absolute left-0 top-0 bottom-0 w-px bg-muted-foreground/30" />
                  <div className="ml-4">
                    {renderNextStep(choice.nextStepId, choice.id, choice.label)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            renderNextStep(step.nextStepId)
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export function CascadingGraphBuilder({
  graph,
  onGraphChange,
  selectedStepId,
  onSelectStep,
}: CascadingGraphBuilderProps) {
  const handleAddStepAfter = useCallback(
    (afterStepId: string, type: "text" | "choice" | "quantity", choiceId?: string) => {
      const newId = `step-${Date.now()}`;
      const newStep: Step = {
        id: newId,
        type,
        question: type === "text"
          ? "Enter your question"
          : type === "choice"
          ? "Select an option"
          : "Select items and quantities",
        placeholder: type === "text" ? "Enter your answer" : undefined,
        choices: type === "choice"
          ? [
              { id: `choice-${Date.now()}-1`, label: "Option 1", nextStepId: null },
              { id: `choice-${Date.now()}-2`, label: "Option 2", nextStepId: null },
            ]
          : undefined,
        quantityChoices: type === "quantity"
          ? [
              { id: `qc-${Date.now()}-1`, label: "Item 1", price: 10, limit: null, isNoThanks: false },
              { id: `qc-${Date.now()}-2`, label: "Item 2", price: 15, limit: null, isNoThanks: false },
              { id: `qc-${Date.now()}-3`, label: "No thanks", price: 0, limit: null, isNoThanks: true },
            ]
          : undefined,
        nextStepId: type === "text" || type === "quantity" ? null : undefined,
      };

      const afterStep = graph.steps[afterStepId];
      const newSteps = { ...graph.steps, [newId]: newStep };

      if (choiceId && afterStep.type === "choice" && afterStep.choices) {
        newSteps[afterStepId] = {
          ...afterStep,
          choices: afterStep.choices.map((c) =>
            c.id === choiceId ? { ...c, nextStepId: newId } : c
          ),
        };
      } else if (afterStep.type === "text" || afterStep.type === "quantity") {
        newSteps[afterStepId] = {
          ...afterStep,
          nextStepId: newId,
        };
      }

      onGraphChange({
        ...graph,
        steps: newSteps,
      });
      onSelectStep(newId);
    },
    [graph, onGraphChange, onSelectStep]
  );

  const handleUpdateStep = useCallback(
    (stepId: string, updates: Partial<Step>) => {
      onGraphChange({
        ...graph,
        steps: {
          ...graph.steps,
          [stepId]: { ...graph.steps[stepId], ...updates },
        },
      });
    },
    [graph, onGraphChange]
  );

  const handleDeleteStep = useCallback(
    (stepId: string) => {
      if (stepId === graph.rootStepId) return;

      const newSteps = { ...graph.steps };
      delete newSteps[stepId];

      Object.values(newSteps).forEach((step) => {
        if ((step.type === "text" || step.type === "quantity") && step.nextStepId === stepId) {
          step.nextStepId = null;
        }
        if (step.type === "choice" && step.choices) {
          step.choices = step.choices.map((c) => ({
            ...c,
            nextStepId: c.nextStepId === stepId ? null : c.nextStepId,
          }));
        }
      });

      onGraphChange({
        ...graph,
        steps: newSteps,
      });
      onSelectStep(graph.rootStepId);
    },
    [graph, onGraphChange, onSelectStep]
  );

  const rootStep = graph.steps[graph.rootStepId];

  if (!rootStep) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <MessageSquare className="w-12 h-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No steps yet</h3>
        <p className="text-muted-foreground mb-4">Start building your form by adding a step</p>
        <div className="flex gap-2 flex-wrap justify-center">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              const newId = `step-${Date.now()}`;
              const newStep: Step = {
                id: newId,
                type: "text",
                question: "Enter your question",
                placeholder: "Enter your answer",
                nextStepId: null,
              };
              onGraphChange({
                rootStepId: newId,
                steps: { [newId]: newStep },
              });
              onSelectStep(newId);
            }}
            data-testid="button-create-first-text"
          >
            <MessageSquare className="w-4 h-4" />
            Text Input
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              const newId = `step-${Date.now()}`;
              const newStep: Step = {
                id: newId,
                type: "choice",
                question: "Select an option",
                choices: [
                  { id: `choice-${Date.now()}-1`, label: "Option 1", nextStepId: null },
                  { id: `choice-${Date.now()}-2`, label: "Option 2", nextStepId: null },
                ],
              };
              onGraphChange({
                rootStepId: newId,
                steps: { [newId]: newStep },
              });
              onSelectStep(newId);
            }}
            data-testid="button-create-first-choice"
          >
            <List className="w-4 h-4" />
            Multiple Choice
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              const newId = `step-${Date.now()}`;
              const newStep: Step = {
                id: newId,
                type: "quantity",
                question: "Select items and quantities",
                quantityChoices: [
                  { id: `qc-${Date.now()}-1`, label: "Item 1", price: 10, limit: null, isNoThanks: false },
                  { id: `qc-${Date.now()}-2`, label: "Item 2", price: 15, limit: null, isNoThanks: false },
                ],
                nextStepId: null,
              };
              onGraphChange({
                rootStepId: newId,
                steps: { [newId]: newStep },
              });
              onSelectStep(newId);
            }}
            data-testid="button-create-first-quantity"
          >
            <ShoppingCart className="w-4 h-4" />
            Quantity
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <StepNode
        step={rootStep}
        graph={graph}
        depth={0}
        isRoot={true}
        onGraphChange={onGraphChange}
        selectedStepId={selectedStepId}
        onSelectStep={onSelectStep}
        visitedSteps={new Set()}
        onAddStepAfter={handleAddStepAfter}
        onUpdateStep={handleUpdateStep}
        onDeleteStep={handleDeleteStep}
      />
    </div>
  );
}
