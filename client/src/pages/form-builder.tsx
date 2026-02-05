import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  Ship, ArrowLeft, Eye, 
  Loader2, Share2, GitBranch, Undo2, Redo2, Check, Cloud
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Template, FormGraph } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { DecisionTreeEditor } from "@/components/decision-tree-editor";

export default function FormBuilder() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  
  const [graph, setGraph] = useState<FormGraph | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"saved" | "saving" | "pending">("saved");
  
  const [graphHistory, setGraphHistory] = useState<FormGraph[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isInitialized = useRef(false);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingChangesRef = useRef(false);
  const isSavingRef = useRef(false);
  const lastSavedDataRef = useRef<{ name: string; graph: FormGraph | null }>({ name: "", graph: null });

  const { data: template, isLoading } = useQuery<Template>({
    queryKey: ["/api/templates", id],
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (template && !isInitialized.current) {
      setGraph(template.graph);
      setTemplateName(template.name);
      if (template.graph?.rootStepId) {
        setSelectedStepId(template.graph.rootStepId);
      }
      if (template.graph) {
        const deepClonedGraph = JSON.parse(JSON.stringify(template.graph));
        setGraphHistory([deepClonedGraph]);
        setHistoryIndex(0);
        lastSavedDataRef.current = { name: template.name, graph: deepClonedGraph };
      }
      isInitialized.current = true;
    }
  }, [template]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < graphHistory.length - 1;

  const handleUndo = useCallback(() => {
    if (canUndo) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      const restoredGraph = JSON.parse(JSON.stringify(graphHistory[newIndex]));
      setGraph(restoredGraph);
      setSelectedStepId(null);
    }
  }, [canUndo, historyIndex, graphHistory]);

  const handleRedo = useCallback(() => {
    if (canRedo) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      const restoredGraph = JSON.parse(JSON.stringify(graphHistory[newIndex]));
      setGraph(restoredGraph);
      setSelectedStepId(null);
    }
  }, [canRedo, historyIndex, graphHistory]);

  const addToHistory = useCallback((newGraph: FormGraph) => {
    const deepClonedGraph = JSON.parse(JSON.stringify(newGraph));
    setHistoryIndex(prevIndex => {
      setGraphHistory(prev => {
        const newHistory = prev.slice(0, prevIndex + 1);
        newHistory.push(deepClonedGraph);
        return newHistory;
      });
      return prevIndex + 1;
    });
  }, []);

  const saveMutation = useMutation({
    mutationFn: async (data: { name: string; graph: FormGraph | null }) => {
      return await apiRequest("PATCH", `/api/templates/${id}`, {
        name: data.name,
        graph: data.graph,
      });
    },
    onSuccess: async (_response, variables) => {
      lastSavedDataRef.current = { name: variables.name, graph: variables.graph };
      pendingChangesRef.current = false;
      isSavingRef.current = false;
      setAutoSaveStatus("saved");
    },
    onError: () => {
      isSavingRef.current = false;
      setAutoSaveStatus("pending");
      toast({
        title: "Autosave failed",
        description: "Your changes couldn't be saved. They'll retry automatically.",
        variant: "destructive",
      });
    },
  });

  const performAutoSave = useCallback(() => {
    if (!graph || !templateName || !isInitialized.current || isSavingRef.current) return;
    
    const currentData = JSON.stringify({ name: templateName, graph });
    const savedData = JSON.stringify(lastSavedDataRef.current);
    
    if (currentData === savedData) {
      setAutoSaveStatus("saved");
      pendingChangesRef.current = false;
      return;
    }
    
    isSavingRef.current = true;
    setAutoSaveStatus("saving");
    saveMutation.mutate({ name: templateName, graph });
  }, [graph, templateName, saveMutation]);

  useEffect(() => {
    if (!isInitialized.current || !graph) return;
    
    if (isSavingRef.current) {
      return;
    }
    
    const currentData = JSON.stringify({ name: templateName, graph });
    const savedData = JSON.stringify(lastSavedDataRef.current);
    
    if (currentData === savedData) {
      if (autoSaveStatus !== "saved") {
        setAutoSaveStatus("saved");
      }
      pendingChangesRef.current = false;
      return;
    }
    
    pendingChangesRef.current = true;
    if (autoSaveStatus !== "pending") {
      setAutoSaveStatus("pending");
    }
    
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    autoSaveTimeoutRef.current = setTimeout(() => {
      performAutoSave();
    }, 1500);
    
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [graph, templateName, autoSaveStatus]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingChangesRef.current && graph && templateName && !isSavingRef.current) {
        if (autoSaveTimeoutRef.current) {
          clearTimeout(autoSaveTimeoutRef.current);
        }
        isSavingRef.current = true;
        saveMutation.mutate({ name: templateName, graph });
        e.preventDefault();
        e.returnValue = "";
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && pendingChangesRef.current && graph && templateName && !isSavingRef.current) {
        if (autoSaveTimeoutRef.current) {
          clearTimeout(autoSaveTimeoutRef.current);
        }
        isSavingRef.current = true;
        saveMutation.mutate({ name: templateName, graph });
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [graph, templateName, saveMutation]);

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

  const handleGraphChange = (newGraph: FormGraph, addHistory: boolean = true) => {
    setGraph(newGraph);
    if (addHistory) {
      addToHistory(newGraph);
    }
  };

  const stepCount = graph ? Object.keys(graph.steps).length : 0;
  const choiceBranchCount = graph 
    ? Object.values(graph.steps).reduce((count, step) => {
        if (step.type === "choice" && step.choices) {
          return count + step.choices.length;
        }
        return count;
      }, 0)
    : 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="container mx-auto px-4 py-4">
            <Skeleton className="h-10 w-48" />
          </div>
        </header>
        <main className="container mx-auto px-4 py-8">
          <Skeleton className="h-96" />
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
            <div className="flex items-center gap-1 mr-2 border-r pr-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleUndo}
                disabled={!canUndo}
                title="Undo (go back)"
                data-testid="button-undo"
              >
                <Undo2 className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRedo}
                disabled={!canRedo}
                title="Redo (go forward)"
                data-testid="button-redo"
              >
                <Redo2 className="w-4 h-4" />
              </Button>
            </div>
            <div 
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-muted-foreground"
              data-testid="autosave-status"
            >
              {autoSaveStatus === "saving" && (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span className="hidden sm:inline">Saving...</span>
                </>
              )}
              {autoSaveStatus === "saved" && (
                <>
                  <Check className="w-3 h-3 text-green-500" />
                  <span className="hidden sm:inline">Saved</span>
                </>
              )}
              {autoSaveStatus === "pending" && (
                <>
                  <Cloud className="w-3 h-3" />
                  <span className="hidden sm:inline">Unsaved</span>
                </>
              )}
            </div>
            <ThemeToggle />
            <Link href={`/admin/preview/${id}`}>
              <Button variant="outline" className="gap-2" data-testid="button-preview">
                <Eye className="w-4 h-4" />
                <span className="hidden sm:inline">Preview</span>
              </Button>
            </Link>
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
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <CardTitle className="text-lg flex items-center gap-2">
                <GitBranch className="w-5 h-5" />
                Decision Tree Builder
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{stepCount} steps</Badge>
                {choiceBranchCount > 0 && (
                  <Badge variant="secondary">{choiceBranchCount} branches</Badge>
                )}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Click on any node to edit it. Use the + buttons to add new steps or end branches.
            </p>
          </CardHeader>
          <CardContent>
            {graph ? (
              <DecisionTreeEditor
                graph={graph}
                onGraphChange={handleGraphChange}
                selectedStepId={selectedStepId}
                onSelectStep={setSelectedStepId}
              />
            ) : (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            )}
          </CardContent>
        </Card>
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
