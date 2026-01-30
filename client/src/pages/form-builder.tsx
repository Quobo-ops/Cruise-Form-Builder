import { useState, useEffect } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  Ship, ArrowLeft, Save, Eye, Plus, Trash2, Link as LinkIcon,
  Loader2, MessageSquare, List, GripVertical, Check, Share2, ShoppingCart, DollarSign
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Template, Step, FormGraph, QuantityChoice } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";

export default function FormBuilder() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  
  const [graph, setGraph] = useState<FormGraph | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const { data: template, isLoading } = useQuery<Template>({
    queryKey: ["/api/templates", id],
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (template) {
      setGraph(template.graph);
      setTemplateName(template.name);
      if (!selectedStepId && template.graph?.rootStepId) {
        setSelectedStepId(template.graph.rootStepId);
      }
    }
  }, [template, selectedStepId]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("PATCH", `/api/templates/${id}`, {
        name: templateName,
        graph,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/templates", id] });
      toast({
        title: "Changes saved",
        description: "Your template has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save changes. Please try again.",
        variant: "destructive",
      });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/templates/${id}/publish`);
    },
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/templates", id] });
      const data = await response.json();
      setIsPublishDialogOpen(false);
      const url = `${window.location.origin}/form/${data.shareId}`;
      navigator.clipboard.writeText(url);
      toast({
        title: "Template published!",
        description: "Shareable link copied to clipboard.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to publish template.",
        variant: "destructive",
      });
    },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const handleSave = async () => {
    setIsSaving(true);
    await saveMutation.mutateAsync();
    setIsSaving(false);
  };

  const addStep = (type: "text" | "choice" | "quantity") => {
    if (!graph) return;
    
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
      choices: type === "choice" ? [
        { id: `choice-${Date.now()}-1`, label: "Option 1", nextStepId: null },
        { id: `choice-${Date.now()}-2`, label: "Option 2", nextStepId: null },
      ] : undefined,
      quantityChoices: type === "quantity" ? [
        { id: `qc-${Date.now()}-1`, label: "Item 1", price: 10, limit: null, isNoThanks: false },
        { id: `qc-${Date.now()}-2`, label: "Item 2", price: 15, limit: null, isNoThanks: false },
        { id: `qc-${Date.now()}-3`, label: "No thanks", price: 0, limit: null, isNoThanks: true },
      ] : undefined,
      nextStepId: (type === "text" || type === "quantity") ? null : undefined,
    };

    setGraph({
      ...graph,
      steps: {
        ...graph.steps,
        [newId]: newStep,
      },
    });
    setSelectedStepId(newId);
  };

  const updateStep = (stepId: string, updates: Partial<Step>) => {
    if (!graph) return;
    setGraph({
      ...graph,
      steps: {
        ...graph.steps,
        [stepId]: { ...graph.steps[stepId], ...updates },
      },
    });
  };

  const deleteStep = (stepId: string) => {
    if (!graph || stepId === graph.rootStepId) return;
    
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

    setGraph({
      ...graph,
      steps: newSteps,
    });
    setSelectedStepId(graph.rootStepId);
  };

  const addChoice = (stepId: string) => {
    if (!graph) return;
    const step = graph.steps[stepId];
    if (step.type !== "choice" || !step.choices) return;

    updateStep(stepId, {
      choices: [
        ...step.choices,
        { id: `choice-${Date.now()}`, label: `Option ${step.choices.length + 1}`, nextStepId: null },
      ],
    });
  };

  const updateChoice = (stepId: string, choiceId: string, updates: { label?: string; nextStepId?: string | null }) => {
    if (!graph) return;
    const step = graph.steps[stepId];
    if (step.type !== "choice" || !step.choices) return;

    updateStep(stepId, {
      choices: step.choices.map((c) =>
        c.id === choiceId ? { ...c, ...updates } : c
      ),
    });
  };

  const deleteChoice = (stepId: string, choiceId: string) => {
    if (!graph) return;
    const step = graph.steps[stepId];
    if (step.type !== "choice" || !step.choices || step.choices.length <= 1) return;

    updateStep(stepId, {
      choices: step.choices.filter((c) => c.id !== choiceId),
    });
  };

  // Quantity choice handlers
  const addQuantityChoice = (stepId: string) => {
    if (!graph) return;
    const step = graph.steps[stepId];
    if (step.type !== "quantity" || !step.quantityChoices) return;

    updateStep(stepId, {
      quantityChoices: [
        ...step.quantityChoices,
        { id: `qc-${Date.now()}`, label: `Item ${step.quantityChoices.length + 1}`, price: 0, limit: null, isNoThanks: false },
      ],
    });
  };

  const updateQuantityChoice = (stepId: string, choiceId: string, updates: Partial<QuantityChoice>) => {
    if (!graph) return;
    const step = graph.steps[stepId];
    if (step.type !== "quantity" || !step.quantityChoices) return;

    updateStep(stepId, {
      quantityChoices: step.quantityChoices.map((c) =>
        c.id === choiceId ? { ...c, ...updates } : c
      ),
    });
  };

  const deleteQuantityChoice = (stepId: string, choiceId: string) => {
    if (!graph) return;
    const step = graph.steps[stepId];
    if (step.type !== "quantity" || !step.quantityChoices || step.quantityChoices.length <= 1) return;

    updateStep(stepId, {
      quantityChoices: step.quantityChoices.filter((c) => c.id !== choiceId),
    });
  };

  const selectedStep = selectedStepId && graph ? graph.steps[selectedStepId] : null;
  const stepsList = graph ? Object.values(graph.steps) : [];
  const stepOptions = graph ? Object.entries(graph.steps).map(([id, step]) => ({
    value: id,
    label: step.question.slice(0, 30) + (step.question.length > 30 ? "..." : ""),
  })) : [];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="container mx-auto px-4 py-4">
            <Skeleton className="h-10 w-48" />
          </div>
        </header>
        <main className="container mx-auto px-4 py-8">
          <div className="grid lg:grid-cols-3 gap-6">
            <Skeleton className="h-96" />
            <div className="lg:col-span-2">
              <Skeleton className="h-96" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <Link href="/admin/dashboard" className="flex items-center gap-2 text-muted-foreground hover-elevate rounded-md px-2 py-1">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back</span>
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
                <Ship className="w-5 h-5 text-primary-foreground" />
              </div>
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className="font-semibold border-transparent bg-transparent focus:bg-background w-48 sm:w-64"
                data-testid="input-template-name"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ThemeToggle />
            <Link href={`/admin/preview/${id}`}>
              <Button variant="outline" className="gap-2" data-testid="button-preview">
                <Eye className="w-4 h-4" />
                <span className="hidden sm:inline">Preview</span>
              </Button>
            </Link>
            <Button
              variant="outline"
              onClick={handleSave}
              disabled={isSaving}
              className="gap-2"
              data-testid="button-save"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">Save</span>
            </Button>
            <Button
              onClick={() => setIsPublishDialogOpen(true)}
              className="gap-2"
              data-testid="button-publish"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">Publish</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg">Steps</CardTitle>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => addStep("text")} data-testid="button-add-text-step">
                      <MessageSquare className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => addStep("choice")} data-testid="button-add-choice-step">
                      <List className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => addStep("quantity")} data-testid="button-add-quantity-step">
                      <ShoppingCart className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {stepsList.map((step, index) => (
                  <div
                    key={step.id}
                    onClick={() => setSelectedStepId(step.id)}
                    className={`p-3 rounded-md border cursor-pointer transition-colors ${
                      selectedStepId === step.id
                        ? "border-primary bg-primary/5"
                        : "hover-elevate"
                    }`}
                    data-testid={`step-item-${step.id}`}
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs text-muted-foreground">#{index + 1}</span>
                          <Badge variant="outline" className="text-xs">
                            {step.type === "text" ? "Text" : step.type === "choice" ? "Choice" : "Quantity"}
                          </Badge>
                          {step.id === graph?.rootStepId && (
                            <Badge variant="secondary" className="text-xs">Start</Badge>
                          )}
                        </div>
                        <p className="text-sm truncate">{step.question}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {stepsList.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No steps yet. Add your first step.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Add Step</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={() => addStep("text")}
                  data-testid="button-add-text"
                >
                  <MessageSquare className="w-4 h-4" />
                  Text Input
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={() => addStep("choice")}
                  data-testid="button-add-choice"
                >
                  <List className="w-4 h-4" />
                  Multiple Choice
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={() => addStep("quantity")}
                  data-testid="button-add-quantity"
                >
                  <ShoppingCart className="w-4 h-4" />
                  Multi-choice with Quantity
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            {selectedStep ? (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-lg">Edit Step</CardTitle>
                    {selectedStepId !== graph?.rootStepId && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteStep(selectedStepId!)}
                        className="text-destructive"
                        data-testid="button-delete-step"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label>Question / Header</Label>
                    <Textarea
                      value={selectedStep.question}
                      onChange={(e) => updateStep(selectedStepId!, { question: e.target.value })}
                      className="min-h-20"
                      data-testid="input-step-question"
                    />
                  </div>

                  {selectedStep.type === "text" && (
                    <>
                      <div className="space-y-2">
                        <Label>Placeholder Text</Label>
                        <Input
                          value={selectedStep.placeholder || ""}
                          onChange={(e) => updateStep(selectedStepId!, { placeholder: e.target.value })}
                          data-testid="input-step-placeholder"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Next Step</Label>
                        <Select
                          value={selectedStep.nextStepId || "end"}
                          onValueChange={(value) => updateStep(selectedStepId!, { nextStepId: value === "end" ? null : value })}
                        >
                          <SelectTrigger data-testid="select-next-step">
                            <SelectValue placeholder="Select next step" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="end">End Form (Submit)</SelectItem>
                            {stepOptions
                              .filter((s) => s.value !== selectedStepId)
                              .map((s) => (
                                <SelectItem key={s.value} value={s.value}>
                                  {s.label}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}

                  {selectedStep.type === "choice" && selectedStep.choices && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label>Choices</Label>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => addChoice(selectedStepId!)}
                          className="gap-1"
                          data-testid="button-add-choice-option"
                        >
                          <Plus className="w-3 h-3" />
                          Add Choice
                        </Button>
                      </div>
                      <div className="space-y-3">
                        {selectedStep.choices.map((choice, index) => (
                          <div key={choice.id} className="p-4 border rounded-md space-y-3">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-muted-foreground">
                                Option {index + 1}
                              </span>
                              {selectedStep.choices!.length > 1 && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => deleteChoice(selectedStepId!, choice.id)}
                                  className="h-6 w-6 ml-auto text-destructive"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                            <Input
                              value={choice.label}
                              onChange={(e) => updateChoice(selectedStepId!, choice.id, { label: e.target.value })}
                              placeholder="Choice label"
                              data-testid={`input-choice-label-${index}`}
                            />
                            <div className="flex items-center gap-2">
                              <LinkIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                              <Select
                                value={choice.nextStepId || "end"}
                                onValueChange={(value) => updateChoice(selectedStepId!, choice.id, { nextStepId: value === "end" ? null : value })}
                              >
                                <SelectTrigger className="flex-1" data-testid={`select-choice-next-${index}`}>
                                  <SelectValue placeholder="Next step" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="end">End Form (Submit)</SelectItem>
                                  {stepOptions
                                    .filter((s) => s.value !== selectedStepId)
                                    .map((s) => (
                                      <SelectItem key={s.value} value={s.value}>
                                        {s.label}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedStep.type === "quantity" && selectedStep.quantityChoices && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label>Items with Quantity</Label>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => addQuantityChoice(selectedStepId!)}
                          className="gap-1"
                          data-testid="button-add-quantity-choice"
                        >
                          <Plus className="w-3 h-3" />
                          Add Item
                        </Button>
                      </div>
                      <div className="space-y-3">
                        {selectedStep.quantityChoices.map((choice, index) => (
                          <div key={choice.id} className="p-4 border rounded-md space-y-3">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-muted-foreground">
                                Item {index + 1}
                              </span>
                              {choice.isNoThanks && (
                                <Badge variant="secondary" className="text-xs">Skip Option</Badge>
                              )}
                              {selectedStep.quantityChoices!.length > 1 && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => deleteQuantityChoice(selectedStepId!, choice.id)}
                                  className="h-6 w-6 ml-auto text-destructive"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                            <Input
                              value={choice.label}
                              onChange={(e) => updateQuantityChoice(selectedStepId!, choice.id, { label: e.target.value })}
                              placeholder="Item label (e.g., Small Shirt)"
                              data-testid={`input-quantity-label-${index}`}
                            />
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                  <DollarSign className="w-3 h-3" />
                                  Price per unit
                                </Label>
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={choice.price || 0}
                                  onChange={(e) => updateQuantityChoice(selectedStepId!, choice.id, { price: parseFloat(e.target.value) || 0 })}
                                  disabled={choice.isNoThanks}
                                  data-testid={`input-quantity-price-${index}`}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Stock limit (optional)</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  value={choice.limit || ""}
                                  onChange={(e) => updateQuantityChoice(selectedStepId!, choice.id, { limit: e.target.value ? parseInt(e.target.value) : null })}
                                  placeholder="Unlimited"
                                  disabled={choice.isNoThanks}
                                  data-testid={`input-quantity-limit-${index}`}
                                />
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={choice.isNoThanks || false}
                                onCheckedChange={(checked) => updateQuantityChoice(selectedStepId!, choice.id, { 
                                  isNoThanks: checked,
                                  price: checked ? 0 : choice.price,
                                  limit: checked ? null : choice.limit,
                                })}
                                data-testid={`switch-no-thanks-${index}`}
                              />
                              <Label className="text-sm text-muted-foreground">
                                "No thanks" option (skip without quantity)
                              </Label>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="space-y-2">
                        <Label>Next Step</Label>
                        <Select
                          value={selectedStep.nextStepId || "end"}
                          onValueChange={(value) => updateStep(selectedStepId!, { nextStepId: value === "end" ? null : value })}
                        >
                          <SelectTrigger data-testid="select-quantity-next-step">
                            <SelectValue placeholder="Select next step" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="end">End Form (Submit)</SelectItem>
                            {stepOptions
                              .filter((s) => s.value !== selectedStepId)
                              .map((s) => (
                                <SelectItem key={s.value} value={s.value}>
                                  {s.label}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {selectedStepId === graph?.rootStepId && (
                    <div className="p-4 bg-muted rounded-md">
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary" />
                        This is the starting step of your form.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-muted/30">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <MessageSquare className="w-12 h-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">Select a step to edit</h3>
                  <p className="text-muted-foreground text-center">
                    Click on a step from the list or add a new one.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      <Dialog open={isPublishDialogOpen} onOpenChange={setIsPublishDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish Template</DialogTitle>
            <DialogDescription>
              Publishing will generate a shareable link that customers can use to fill out this form.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Once published, changes to this template will be reflected in the live form.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPublishDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => publishMutation.mutate()}
              disabled={publishMutation.isPending}
              className="gap-2"
              data-testid="button-publish-confirm"
            >
              {publishMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Share2 className="w-4 h-4" />
              )}
              Publish & Copy Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
