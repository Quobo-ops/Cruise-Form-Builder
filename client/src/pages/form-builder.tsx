import { useState, useEffect } from "react";
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
  Ship, ArrowLeft, Save, Eye, 
  Loader2, Share2, GitBranch
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Template, FormGraph } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { DecisionTreeViewer } from "@/components/decision-tree-viewer";
import { CascadingGraphBuilder } from "@/components/cascading-graph-builder";

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
  const [isGraphViewerOpen, setIsGraphViewerOpen] = useState(false);

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

  const handleGraphChange = (newGraph: FormGraph) => {
    setGraph(newGraph);
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
            <ThemeToggle />
            <Button 
              variant="outline" 
              className="gap-2" 
              onClick={() => setIsGraphViewerOpen(true)}
              disabled={!graph || Object.keys(graph.steps).length === 0}
              data-testid="button-decision-tree"
            >
              <GitBranch className="w-4 h-4" />
              <span className="hidden sm:inline">Decision Tree</span>
            </Button>
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
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <CardTitle className="text-lg flex items-center gap-2">
                <GitBranch className="w-5 h-5" />
                Form Flow Builder
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{stepCount} steps</Badge>
                {choiceBranchCount > 0 && (
                  <Badge variant="secondary">{choiceBranchCount} branches</Badge>
                )}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Click on any step to edit it inline. Add new steps using the buttons that appear below each step or branch.
            </p>
          </CardHeader>
          <CardContent>
            {graph ? (
              <CascadingGraphBuilder
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

      {graph && (
        <DecisionTreeViewer
          graph={graph}
          open={isGraphViewerOpen}
          onOpenChange={setIsGraphViewerOpen}
        />
      )}
    </div>
  );
}
