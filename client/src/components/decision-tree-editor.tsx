import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Plus,
  Trash2,
  MessageSquare,
  List,
  ShoppingCart,
  GripVertical,
  DollarSign,
  CheckCircle2,
  X,
  ArrowRight,
  Check,
  AlertTriangle,
  Info,
  ImagePlus,
} from "lucide-react";
import type { FormGraph, Step, QuantityChoice, InfoPopup } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { StepInfoPopup } from "@/components/step-info-popup";
import { Eye } from "lucide-react";

interface DecisionTreeEditorProps {
  graph: FormGraph;
  onGraphChange: (graph: FormGraph, addHistory?: boolean) => void;
  selectedStepId: string | null;
  onSelectStep: (stepId: string | null) => void;
}

interface InfoImageUploaderProps {
  stepId: string;
  step: Step;
  onUpdateStep: (stepId: string, updates: Partial<Step>) => void;
}

function InfoImageUploader({ stepId, step, onUpdateStep }: InfoImageUploaderProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        variant: "destructive",
        title: "Invalid file type",
        description: "Please select an image file.",
      });
      return;
    }

    setIsUploading(true);
    try {
      const response = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type,
        }),
      });

      if (!response.ok) throw new Error("Failed to get upload URL");

      const { uploadURL, objectPath } = await response.json();

      const uploadResponse = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      if (!uploadResponse.ok) throw new Error("Failed to upload file");

      const defaultInfo = { enabled: true, header: "", images: [] as string[], description: "" };
      const currentInfo = step.infoPopup ? { ...defaultInfo, ...step.infoPopup } : defaultInfo;
      const newImages = [...(currentInfo.images || []), objectPath];
      onUpdateStep(stepId, { 
        infoPopup: { ...currentInfo, images: newImages } 
      });

      toast({
        title: "Image uploaded",
        description: "Your image has been added.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload image",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        data-testid={`input-info-image-upload-${stepId}`}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        className="w-16 h-16 border-2 border-dashed border-muted-foreground/30 rounded-md flex items-center justify-center hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
        data-testid={`button-add-info-image-${stepId}`}
      >
        {isUploading ? (
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        ) : (
          <Plus className="w-5 h-5 text-muted-foreground" />
        )}
      </button>
    </>
  );
}

interface AddStepButtonProps {
  parentStepId: string;
  choiceId?: string;
  onAddStep: (parentId: string, type: "text" | "choice" | "quantity" | "conclusion", choiceId?: string) => void;
  branchLabel?: string;
}

function AddStepButton({ parentStepId, choiceId, onAddStep, branchLabel }: AddStepButtonProps) {
  const [open, setOpen] = useState(false);

  const handleAddStep = (type: "text" | "choice" | "quantity" | "conclusion") => {
    onAddStep(parentStepId, type, choiceId);
    setOpen(false);
  };

  return (
    <div className="flex flex-col items-center">
      <div className="w-px h-6 bg-gray-400 dark:bg-gray-500" />
      {branchLabel && (
        <div className="mb-2 px-2 py-0.5 text-xs bg-muted rounded text-muted-foreground">
          {branchLabel}
        </div>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="rounded-full w-8 h-8 bg-background border-2 border-dashed border-primary/50 hover:border-primary hover:bg-primary/10"
            data-testid={`button-add-step-${parentStepId}${choiceId ? `-${choiceId}` : ""}`}
          >
            <Plus className="w-4 h-4 text-primary" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="center" side="bottom" sideOffset={5}>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground mb-2 px-2">Add to this branch:</p>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 h-9"
              onClick={() => handleAddStep("text")}
              data-testid={`option-add-text-${parentStepId}`}
            >
              <MessageSquare className="w-4 h-4" />
              Text Input
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 h-9"
              onClick={() => handleAddStep("choice")}
              data-testid={`option-add-choice-${parentStepId}`}
            >
              <List className="w-4 h-4" />
              Multiple Choice
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 h-9"
              onClick={() => handleAddStep("quantity")}
              data-testid={`option-add-quantity-${parentStepId}`}
            >
              <ShoppingCart className="w-4 h-4" />
              Quantity Selector
            </Button>
            <div className="border-t my-2" />
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 h-9 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
              onClick={() => handleAddStep("conclusion")}
              data-testid={`option-add-conclusion-${parentStepId}`}
            >
              <CheckCircle2 className="w-4 h-4" />
              End Branch
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

interface TreeNodeProps {
  stepId: string;
  graph: FormGraph;
  selectedStepId: string | null;
  onSelectStep: (stepId: string | null) => void;
  onUpdateStep: (stepId: string, updates: Partial<Step>) => void;
  onDeleteStep: (stepId: string) => void;
  onAddStep: (parentId: string, type: "text" | "choice" | "quantity" | "conclusion", choiceId?: string) => void;
  onRevertStep?: (stepId: string) => void;
  stepSnapshot?: Step | null;
  isRoot?: boolean;
  depth?: number;
  visitedSteps?: Set<string>;
}

function TreeNode({
  stepId,
  graph,
  selectedStepId,
  onSelectStep,
  onUpdateStep,
  onDeleteStep,
  onAddStep,
  onRevertStep,
  stepSnapshot,
  isRoot = false,
  depth = 0,
  visitedSteps = new Set(),
}: TreeNodeProps) {
  const step = graph.steps[stepId];
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showInfoEditor, setShowInfoEditor] = useState(false);
  const [showInfoPreview, setShowInfoPreview] = useState(false);
  const isSelected = selectedStepId === stepId;

  const countDescendants = useCallback((currentStepId: string, visited: Set<string> = new Set()): number => {
    if (visited.has(currentStepId)) return 0;
    visited.add(currentStepId);
    
    const currentStep = graph.steps[currentStepId];
    if (!currentStep) return 0;
    
    let count = 0;
    
    if (currentStep.type === "choice" && currentStep.choices) {
      for (const choice of currentStep.choices) {
        if (choice.nextStepId && !visited.has(choice.nextStepId)) {
          count += 1 + countDescendants(choice.nextStepId, visited);
        }
      }
    } else if (currentStep.nextStepId && !visited.has(currentStep.nextStepId)) {
      count += 1 + countDescendants(currentStep.nextStepId, visited);
    }
    
    return count;
  }, [graph.steps]);

  const descendantCount = useMemo(() => countDescendants(stepId), [countDescendants, stepId]);

  if (!step) return null;

  if (visitedSteps.has(stepId)) {
    return (
      <div className="flex flex-col items-center">
        <Badge variant="outline" className="text-xs bg-muted/50" data-testid={`badge-continues-to-${stepId}`}>
          <ArrowRight className="w-3 h-3 mr-1" />
          Continues to: {step.question.slice(0, 25)}...
        </Badge>
      </div>
    );
  }

  const newVisited = new Set(visitedSteps);
  newVisited.add(stepId);

  const getNodeColors = () => {
    if (isRoot) {
      return "bg-amber-100 dark:bg-amber-900/40 border-amber-400 dark:border-amber-600 text-amber-900 dark:text-amber-100";
    }
    if (step.type === "conclusion") {
      return "bg-emerald-100 dark:bg-emerald-900/40 border-emerald-400 dark:border-emerald-600 text-emerald-900 dark:text-emerald-100";
    }
    if (step.type === "choice") {
      return "bg-blue-100 dark:bg-blue-900/40 border-blue-400 dark:border-blue-600 text-blue-900 dark:text-blue-100";
    }
    return "bg-gray-100 dark:bg-gray-800/40 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100";
  };

  const getTypeIcon = () => {
    switch (step.type) {
      case "text":
        return <MessageSquare className="w-3 h-3" />;
      case "choice":
        return <List className="w-3 h-3" />;
      case "quantity":
        return <ShoppingCart className="w-3 h-3" />;
      case "conclusion":
        return <CheckCircle2 className="w-3 h-3" />;
    }
  };

  const handleAddChoice = () => {
    if (step.type !== "choice" || !step.choices) return;
    const newChoiceId = `choice-${Date.now()}`;
    onUpdateStep(stepId, {
      choices: [
        ...step.choices,
        { id: newChoiceId, label: `Option ${step.choices.length + 1}`, nextStepId: null },
      ],
    });
  };

  const handleUpdateChoice = (choiceId: string, updates: { label?: string }) => {
    if (step.type !== "choice" || !step.choices) return;
    onUpdateStep(stepId, {
      choices: step.choices.map((c) => (c.id === choiceId ? { ...c, ...updates } : c)),
    });
  };

  const handleDeleteChoice = (choiceId: string) => {
    if (step.type !== "choice" || !step.choices || step.choices.length <= 2) return;
    onUpdateStep(stepId, {
      choices: step.choices.filter((c) => c.id !== choiceId),
    });
  };

  const handleAddQuantityChoice = () => {
    if (step.type !== "quantity" || !step.quantityChoices) return;
    onUpdateStep(stepId, {
      quantityChoices: [
        ...step.quantityChoices,
        { id: `qc-${Date.now()}`, label: `Item ${step.quantityChoices.length + 1}`, price: 0, limit: null, isNoThanks: false },
      ],
    });
  };

  const handleUpdateQuantityChoice = (choiceId: string, updates: Partial<QuantityChoice>) => {
    if (step.type !== "quantity" || !step.quantityChoices) return;
    onUpdateStep(stepId, {
      quantityChoices: step.quantityChoices.map((c) => (c.id === choiceId ? { ...c, ...updates } : c)),
    });
  };

  const handleDeleteQuantityChoice = (choiceId: string) => {
    if (step.type !== "quantity" || !step.quantityChoices || step.quantityChoices.length <= 1) return;
    onUpdateStep(stepId, {
      quantityChoices: step.quantityChoices.filter((c) => c.id !== choiceId),
    });
  };

  return (
    <div className="flex flex-col items-center">
      <div
        className={`relative px-4 py-3 rounded-lg border-2 cursor-pointer transition-all min-w-[180px] max-w-[280px] ${getNodeColors()} ${
          isSelected ? "ring-2 ring-primary ring-offset-2" : "hover:shadow-md"
        }`}
        onClick={() => {
          onSelectStep(stepId);
          setIsEditing(true);
        }}
        data-testid={`tree-node-${stepId}`}
      >
        <div className="flex items-start gap-2">
          <div className="flex-shrink-0 mt-0.5 opacity-60">
            {getTypeIcon()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 mb-1 flex-wrap">
              <Badge variant="outline" className="text-[10px] px-1 py-0">
                {step.type === "text" ? "Text" : step.type === "choice" ? "Choice" : step.type === "quantity" ? "Quantity" : "End"}
              </Badge>
              {isRoot && (
                <Badge className="text-[10px] px-1 py-0">Start</Badge>
              )}
              {isSelected && isEditing && !showDeleteConfirm && (
                <div className="flex items-center gap-0.5 ml-auto" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant={step.infoPopup?.enabled ? "default" : "outline"}
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowInfoEditor(!showInfoEditor);
                    }}
                    title={step.infoPopup?.enabled ? "Edit info popup" : "Add info popup"}
                    className={step.infoPopup?.enabled ? "animate-pulse" : ""}
                    data-testid={`button-info-${stepId}`}
                  >
                    <Info className="w-3 h-3" />
                  </Button>
                  {!isRoot && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDeleteConfirm(true);
                      }}
                      title="Delete step"
                      data-testid={`button-delete-${stepId}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRevertStep?.(stepId);
                      setIsEditing(false);
                      onSelectStep(null);
                    }}
                    title="Close and revert changes"
                    data-testid={`button-close-${stepId}`}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              )}
              {!isRoot && isSelected && isEditing && showDeleteConfirm && (
                <div className="flex items-center gap-1 ml-auto" onClick={(e) => e.stopPropagation()}>
                  <Badge variant="destructive" className="text-[10px] px-1 py-0 gap-0.5">
                    <AlertTriangle className="w-2.5 h-2.5" />
                    {descendantCount > 0 ? `${descendantCount}` : '?'}
                  </Badge>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteStep(stepId);
                      setShowDeleteConfirm(false);
                    }}
                    title="Confirm delete"
                    data-testid={`button-confirm-delete-${stepId}`}
                  >
                    <Check className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDeleteConfirm(false);
                    }}
                    title="Cancel delete"
                    data-testid={`button-cancel-delete-${stepId}`}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </div>
            <p className="text-xs font-medium line-clamp-2">{step.question}</p>
          </div>
        </div>

        {isSelected && isEditing && (
          <div className="mt-3 pt-3 border-t border-current/20 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="space-y-1">
              <Label className="text-xs opacity-70">Question</Label>
              <Textarea
                value={step.question}
                onChange={(e) => onUpdateStep(stepId, { question: e.target.value })}
                className="min-h-16 text-xs bg-white/50 dark:bg-black/20"
                data-testid={`input-question-${stepId}`}
              />
            </div>

            {step.type === "text" && (
              <div className="space-y-1">
                <Label className="text-xs opacity-70">Placeholder</Label>
                <Input
                  value={step.placeholder || ""}
                  onChange={(e) => onUpdateStep(stepId, { placeholder: e.target.value })}
                  className="text-xs bg-white/50 dark:bg-black/20"
                  data-testid={`input-placeholder-${stepId}`}
                />
              </div>
            )}

            {step.type === "choice" && step.choices && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs opacity-70">Choices (branches)</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddChoice}
                    className="text-[10px] h-6 px-2 gap-1"
                    data-testid={`button-add-choice-${stepId}`}
                  >
                    <Plus className="w-3 h-3" />
                    Add
                  </Button>
                </div>
                {step.choices.map((choice, idx) => (
                  <div key={choice.id} className="flex items-center gap-1">
                    <GripVertical className="w-3 h-3 opacity-50 flex-shrink-0" />
                    <Input
                      value={choice.label}
                      onChange={(e) => handleUpdateChoice(choice.id, { label: e.target.value })}
                      className="text-xs h-7 bg-white/50 dark:bg-black/20"
                      data-testid={`input-choice-${stepId}-${idx}`}
                    />
                    {step.choices!.length > 2 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="flex-shrink-0 w-6 h-6 text-destructive"
                        onClick={() => handleDeleteChoice(choice.id)}
                        data-testid={`button-delete-choice-${stepId}-${idx}`}
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
                  <Label className="text-xs opacity-70">Items</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddQuantityChoice}
                    className="text-[10px] h-6 px-2 gap-1"
                    data-testid={`button-add-item-${stepId}`}
                  >
                    <Plus className="w-3 h-3" />
                    Add
                  </Button>
                </div>
                {step.quantityChoices.map((qc, idx) => (
                  <div key={qc.id} className="p-2 border rounded bg-white/30 dark:bg-black/10 space-y-2">
                    <div className="flex items-center gap-1">
                      <Input
                        value={qc.label}
                        onChange={(e) => handleUpdateQuantityChoice(qc.id, { label: e.target.value })}
                        className="text-xs h-7 bg-white/50 dark:bg-black/20"
                        placeholder="Item name"
                        data-testid={`input-item-${stepId}-${idx}`}
                      />
                      {step.quantityChoices!.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="flex-shrink-0 w-6 h-6 text-destructive"
                          onClick={() => handleDeleteQuantityChoice(qc.id)}
                          data-testid={`button-delete-item-${stepId}-${idx}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] flex items-center gap-1 opacity-70">
                          <DollarSign className="w-2 h-2" />
                          Price
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={qc.price || 0}
                          onChange={(e) => handleUpdateQuantityChoice(qc.id, { price: parseFloat(e.target.value) || 0 })}
                          disabled={qc.isNoThanks}
                          className="text-xs h-7 bg-white/50 dark:bg-black/20"
                          data-testid={`input-price-${stepId}-${idx}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] opacity-70">Limit</Label>
                        <Input
                          type="number"
                          min="0"
                          value={qc.limit || ""}
                          onChange={(e) => handleUpdateQuantityChoice(qc.id, { limit: e.target.value ? parseInt(e.target.value) : null })}
                          placeholder="None"
                          disabled={qc.isNoThanks}
                          className="text-xs h-7 bg-white/50 dark:bg-black/20"
                          data-testid={`input-limit-${stepId}-${idx}`}
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
                        data-testid={`switch-skip-${stepId}-${idx}`}
                      />
                      <Label className="text-[10px] opacity-70">Skip option</Label>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {step.type === "conclusion" && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs opacity-70">Thank You Message</Label>
                  <Textarea
                    value={step.thankYouMessage || ""}
                    onChange={(e) => onUpdateStep(stepId, { thankYouMessage: e.target.value })}
                    className="min-h-16 text-xs bg-white/50 dark:bg-black/20"
                    placeholder="Thank you for completing this form..."
                    data-testid={`input-thank-you-${stepId}`}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs opacity-70">Submit Button Text</Label>
                  <Input
                    value={step.submitButtonText || "Submit"}
                    onChange={(e) => onUpdateStep(stepId, { submitButtonText: e.target.value })}
                    className="text-xs bg-white/50 dark:bg-black/20"
                    data-testid={`input-submit-text-${stepId}`}
                  />
                </div>
              </div>
            )}

            {showInfoEditor && (
              <div className="space-y-3 p-3 border-2 border-dashed border-blue-400 dark:border-blue-600 rounded-lg bg-blue-50/50 dark:bg-blue-900/20">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    Informational Popup
                  </Label>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={step.infoPopup?.enabled || false}
                      onCheckedChange={(checked) => {
                        const defaultInfo = { enabled: false, header: "", images: [] as string[], description: "" };
                        const currentInfo = step.infoPopup ? { ...defaultInfo, ...step.infoPopup } : defaultInfo;
                        onUpdateStep(stepId, { 
                          infoPopup: { ...currentInfo, enabled: checked } 
                        });
                      }}
                      data-testid={`switch-info-enabled-${stepId}`}
                    />
                    <Label className="text-[10px] opacity-70">
                      {step.infoPopup?.enabled ? "Enabled" : "Disabled"}
                    </Label>
                  </div>
                </div>

                {step.infoPopup?.enabled && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs opacity-70">Header</Label>
                      <Input
                        value={step.infoPopup?.header || ""}
                        onChange={(e) => {
                          const defaultInfo = { enabled: true, header: "", images: [] as string[], description: "" };
                          const currentInfo = step.infoPopup ? { ...defaultInfo, ...step.infoPopup } : defaultInfo;
                          onUpdateStep(stepId, { 
                            infoPopup: { ...currentInfo, header: e.target.value } 
                          });
                        }}
                        className="text-xs bg-white/50 dark:bg-black/20"
                        placeholder="More Information"
                        data-testid={`input-info-header-${stepId}`}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs opacity-70 flex items-center gap-1">
                        <ImagePlus className="w-3 h-3" />
                        Images
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {(step.infoPopup?.images || []).map((imageUrl, index) => (
                          <div key={index} className="relative group">
                            <img
                              src={imageUrl}
                              alt={`Info image ${index + 1}`}
                              className="w-16 h-16 object-cover rounded-md border"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const defaultInfo = { enabled: true, header: "", images: [] as string[], description: "" };
                                const currentInfo = step.infoPopup ? { ...defaultInfo, ...step.infoPopup } : defaultInfo;
                                const newImages = [...(currentInfo.images || [])];
                                newImages.splice(index, 1);
                                onUpdateStep(stepId, { 
                                  infoPopup: { ...currentInfo, images: newImages } 
                                });
                              }}
                              className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              data-testid={`button-remove-info-image-${stepId}-${index}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        <InfoImageUploader
                          stepId={stepId}
                          step={step}
                          onUpdateStep={onUpdateStep}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs opacity-70">Description</Label>
                      <Textarea
                        value={step.infoPopup?.description || ""}
                        onChange={(e) => {
                          const defaultInfo = { enabled: true, header: "", images: [] as string[], description: "" };
                          const currentInfo = step.infoPopup ? { ...defaultInfo, ...step.infoPopup } : defaultInfo;
                          onUpdateStep(stepId, { 
                            infoPopup: { ...currentInfo, description: e.target.value } 
                          });
                        }}
                        className="min-h-24 text-xs bg-white/50 dark:bg-black/20"
                        placeholder="Provide helpful information about this step..."
                        data-testid={`input-info-description-${stepId}`}
                      />
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowInfoPreview(true)}
                        className="text-[10px] h-6 px-2 gap-1"
                        data-testid={`button-preview-info-${stepId}`}
                      >
                        <Eye className="w-3 h-3" />
                        Preview
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          setShowInfoEditor(false);
                        }}
                        className="text-[10px] h-6 px-2 gap-1"
                        data-testid={`button-close-info-${stepId}`}
                      >
                        <Check className="w-3 h-3" />
                        Done
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          onUpdateStep(stepId, { 
                            infoPopup: { enabled: false, header: "", images: [], description: "" } 
                          });
                          setShowInfoEditor(false);
                        }}
                        className="text-[10px] h-6 px-2 gap-1"
                        data-testid={`button-delete-info-${stepId}`}
                      >
                        <Trash2 className="w-3 h-3" />
                        Remove
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowInfoEditor(false)}
                        className="text-[10px] h-6 px-2 gap-1"
                        data-testid={`button-close-info-editor-${stepId}`}
                      >
                        <X className="w-3 h-3" />
                        Close
                      </Button>
                    </div>

                    <StepInfoPopup
                      infoPopup={step.infoPopup!}
                      open={showInfoPreview}
                      onOpenChange={setShowInfoPreview}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {step.type === "choice" && step.choices && step.choices.length > 0 ? (
        <div className="flex flex-col items-center mt-2">
          <div className="w-px h-4 bg-gray-400 dark:bg-gray-500" />
          <div className="flex items-start gap-4">
            {(() => {
              const renderedStepsInBranches = new Set<string>();
              return step.choices!.map((choice, index) => {
                const hasNextStep = choice.nextStepId && graph.steps[choice.nextStepId];
                const isAlreadyRendered = choice.nextStepId && renderedStepsInBranches.has(choice.nextStepId);
                
                if (hasNextStep && choice.nextStepId) {
                  renderedStepsInBranches.add(choice.nextStepId);
                }
                
                return (
                  <div key={choice.id} className="flex flex-col items-center relative">
                    {index === 0 && step.choices!.length > 1 && (
                      <div 
                        className="absolute top-0 left-1/2 h-px bg-gray-400 dark:bg-gray-500" 
                        style={{ 
                          width: `calc(${(step.choices!.length - 1) * 100}% + ${(step.choices!.length - 1) * 16}px)`,
                        }}
                      />
                    )}
                    
                    {step.choices!.length > 1 && (
                      <div className="w-px h-4 bg-gray-400 dark:bg-gray-500" />
                    )}
                    
                    <svg 
                      width="10" 
                      height="8" 
                      viewBox="0 0 10 8" 
                      className="text-gray-400 dark:text-gray-500 fill-current"
                    >
                      <polygon points="5,8 0,0 10,0" />
                    </svg>

                    <div className="mt-1 px-2 py-0.5 text-[10px] bg-muted rounded text-muted-foreground max-w-[120px] truncate">
                      {choice.label}
                    </div>
                    
                    {hasNextStep ? (
                      isAlreadyRendered ? (
                        <div className="flex flex-col items-center mt-2">
                          <Badge variant="outline" className="text-xs bg-muted/50" data-testid={`badge-goes-to-${choice.id}`}>
                            <ArrowRight className="w-3 h-3 mr-1" />
                            {graph.steps[choice.nextStepId!]?.question?.slice(0, 20) || "Next step"}...
                          </Badge>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center">
                          <div className="w-px h-4 bg-gray-400 dark:bg-gray-500" />
                          <svg 
                            width="10" 
                            height="8" 
                            viewBox="0 0 10 8" 
                            className="text-gray-400 dark:text-gray-500 fill-current"
                          >
                            <polygon points="5,8 0,0 10,0" />
                          </svg>
                          <div className="mt-1">
                            <TreeNode
                              stepId={choice.nextStepId!}
                              graph={graph}
                              selectedStepId={selectedStepId}
                              onSelectStep={onSelectStep}
                              onUpdateStep={onUpdateStep}
                              onDeleteStep={onDeleteStep}
                              onAddStep={onAddStep}
                              onRevertStep={onRevertStep}
                              depth={depth + 1}
                              visitedSteps={newVisited}
                            />
                          </div>
                        </div>
                      )
                    ) : (
                      <AddStepButton
                        parentStepId={stepId}
                        choiceId={choice.id}
                        onAddStep={onAddStep}
                      />
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      ) : step.type === "conclusion" ? (
        null
      ) : (
        step.type !== "choice" && (
          step.nextStepId && graph.steps[step.nextStepId] ? (
            <div className="flex flex-col items-center">
              <div className="w-px h-4 bg-gray-400 dark:bg-gray-500" />
              <svg 
                width="10" 
                height="8" 
                viewBox="0 0 10 8" 
                className="text-gray-400 dark:text-gray-500 fill-current"
              >
                <polygon points="5,8 0,0 10,0" />
              </svg>
              <div className="mt-1">
                <TreeNode
                  stepId={step.nextStepId}
                  graph={graph}
                  selectedStepId={selectedStepId}
                  onSelectStep={onSelectStep}
                  onUpdateStep={onUpdateStep}
                  onDeleteStep={onDeleteStep}
                  onAddStep={onAddStep}
                  onRevertStep={onRevertStep}
                  depth={depth + 1}
                  visitedSteps={newVisited}
                />
              </div>
            </div>
          ) : (
            <AddStepButton
              parentStepId={stepId}
              onAddStep={onAddStep}
            />
          )
        )
      )}
    </div>
  );
}

export function DecisionTreeEditor({
  graph,
  onGraphChange,
  selectedStepId,
  onSelectStep,
}: DecisionTreeEditorProps) {
  const stepSnapshotRef = useRef<{ [stepId: string]: Step }>({});
  const previousSelectedStepId = useRef<string | null>(null);

  useEffect(() => {
    if (selectedStepId && selectedStepId !== previousSelectedStepId.current) {
      if (graph.steps[selectedStepId]) {
        stepSnapshotRef.current[selectedStepId] = JSON.parse(JSON.stringify(graph.steps[selectedStepId]));
      }
    }
    previousSelectedStepId.current = selectedStepId;
  }, [selectedStepId, graph.steps]);

  const handleRevertStep = useCallback(
    (stepId: string) => {
      const snapshot = stepSnapshotRef.current[stepId];
      if (snapshot) {
        onGraphChange({
          ...graph,
          steps: {
            ...graph.steps,
            [stepId]: snapshot,
          },
        }, false);
      }
      onSelectStep(null);
    },
    [graph, onGraphChange, onSelectStep]
  );

  const handleAddStep = useCallback(
    (parentStepId: string, type: "text" | "choice" | "quantity" | "conclusion", choiceId?: string) => {
      const newId = `step-${Date.now()}`;
      const newStep: Step = type === "conclusion" 
        ? {
            id: newId,
            type: "conclusion",
            question: "Thank You!",
            thankYouMessage: "Thank you for completing this form. Please review your answers and submit.",
            submitButtonText: "Submit",
          }
        : {
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
                  { id: `choice-${Date.now()}-3`, label: "Option 3", nextStepId: null },
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

      const parentStep = graph.steps[parentStepId];
      const newSteps = { ...graph.steps, [newId]: newStep };

      if (choiceId && parentStep.type === "choice" && parentStep.choices) {
        newSteps[parentStepId] = {
          ...parentStep,
          choices: parentStep.choices.map((c) =>
            c.id === choiceId ? { ...c, nextStepId: newId } : c
          ),
        };
      } else if (parentStep.type === "text" || parentStep.type === "quantity") {
        newSteps[parentStepId] = {
          ...parentStep,
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

  const createFirstStep = (type: "text" | "choice" | "quantity") => {
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
            { id: `choice-${Date.now()}-3`, label: "Option 3", nextStepId: null },
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
    onGraphChange({
      rootStepId: newId,
      steps: { [newId]: newStep },
    });
    onSelectStep(newId);
  };

  if (!graph.rootStepId || !graph.steps[graph.rootStepId]) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="text-center mb-6">
          <h3 className="text-lg font-semibold mb-2">Start Building Your Decision Tree</h3>
          <p className="text-sm text-muted-foreground">Choose how to begin your form flow</p>
        </div>
        <div className="flex gap-3 flex-wrap justify-center">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => createFirstStep("text")}
            data-testid="button-create-first-text"
          >
            <MessageSquare className="w-4 h-4" />
            Text Input
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => createFirstStep("choice")}
            data-testid="button-create-first-choice"
          >
            <List className="w-4 h-4" />
            Multiple Choice
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => createFirstStep("quantity")}
            data-testid="button-create-first-quantity"
          >
            <ShoppingCart className="w-4 h-4" />
            Quantity Selector
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto pb-8">
      <div className="flex justify-center min-w-max py-6 px-4">
        <TreeNode
          stepId={graph.rootStepId}
          graph={graph}
          selectedStepId={selectedStepId}
          onSelectStep={onSelectStep}
          onUpdateStep={handleUpdateStep}
          onDeleteStep={handleDeleteStep}
          onAddStep={handleAddStep}
          onRevertStep={handleRevertStep}
          isRoot={true}
        />
      </div>
    </div>
  );
}
