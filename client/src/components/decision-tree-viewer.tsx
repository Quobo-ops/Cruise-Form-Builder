import { useMemo } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GitBranch, X } from "lucide-react";
import type { FormGraph, Step } from "@shared/schema";

interface DecisionTreeViewerProps {
  graph: FormGraph;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TreeNodeData {
  stepId: string;
  step: Step;
  type: "root" | "decision" | "leaf";
  children: { node: TreeNodeData; label?: string }[];
}

function buildTree(graph: FormGraph, rootId: string, visited: Set<string> = new Set()): TreeNodeData | null {
  if (!graph.steps[rootId] || visited.has(rootId)) return null;
  
  const step = graph.steps[rootId];
  const isRoot = rootId === graph.rootStepId;
  
  let children: { node: TreeNodeData; label?: string }[] = [];
  
  if (step.type === "choice" && step.choices) {
    for (const choice of step.choices) {
      if (choice.nextStepId && graph.steps[choice.nextStepId]) {
        const branchVisited = new Set(visited);
        branchVisited.add(rootId);
        const childNode = buildTree(graph, choice.nextStepId, branchVisited);
        if (childNode) {
          children.push({ node: childNode, label: choice.label });
        }
      } else {
        children.push({
          node: {
            stepId: `leaf-${choice.id}`,
            step: { ...step, question: choice.label },
            type: "leaf",
            children: [],
          },
          label: choice.label,
        });
      }
    }
  } else if ((step.type === "text" || step.type === "quantity") && step.nextStepId) {
    const branchVisited = new Set(visited);
    branchVisited.add(rootId);
    const childNode = buildTree(graph, step.nextStepId, branchVisited);
    if (childNode) {
      children.push({ node: childNode });
    }
  }
  
  let nodeType: "root" | "decision" | "leaf" = "leaf";
  if (isRoot) {
    nodeType = "root";
  } else if (step.type === "choice" || children.length > 0) {
    nodeType = "decision";
  }
  
  return {
    stepId: rootId,
    step,
    type: nodeType,
    children,
  };
}

interface TreeNodeProps {
  node: TreeNodeData;
  depth: number;
  isBranchStart?: boolean;
}

function TreeNode({ node, depth, isBranchStart = false }: TreeNodeProps) {
  const getNodeColors = (type: "root" | "decision" | "leaf") => {
    switch (type) {
      case "root":
        return "bg-amber-100 dark:bg-amber-900/40 border-amber-400 dark:border-amber-600 text-amber-900 dark:text-amber-100";
      case "decision":
        return "bg-blue-100 dark:bg-blue-900/40 border-blue-400 dark:border-blue-600 text-blue-900 dark:text-blue-100";
      case "leaf":
        return "bg-emerald-100 dark:bg-emerald-900/40 border-emerald-400 dark:border-emerald-600 text-emerald-900 dark:text-emerald-100";
    }
  };

  const getTypeLabel = () => {
    if (node.type === "root") return "Root node";
    if (node.type === "decision") return "Decision node";
    return "Leaf node";
  };

  const hasMultipleChildren = node.children.length > 1;

  return (
    <div className="flex flex-col items-center">
      <div
        className={`px-4 py-2 rounded-md border-2 font-medium text-sm ${getNodeColors(node.type)} min-w-[120px] text-center`}
        data-testid={`tree-node-${node.stepId}`}
      >
        {getTypeLabel()}
      </div>

      {node.children.length > 0 && (
        <div className="flex flex-col items-center">
          <div className="w-px h-4 bg-gray-400 dark:bg-gray-500" />
          
          {hasMultipleChildren ? (
            <div className="flex items-start">
              {node.children.map((child, index) => (
                <div key={`${node.stepId}-child-${index}`} className="flex flex-col items-center relative">
                  {index === 0 && node.children.length > 1 && (
                    <div 
                      className="absolute top-0 left-1/2 right-0 h-px bg-gray-400 dark:bg-gray-500" 
                      style={{ 
                        width: `calc(${(node.children.length - 1) * 100}% + ${(node.children.length - 1) * 16}px)`,
                      }}
                    />
                  )}
                  
                  {node.children.length > 1 && (
                    <div className="w-px h-4 bg-gray-400 dark:bg-gray-500" />
                  )}
                  
                  <svg 
                    width="12" 
                    height="12" 
                    viewBox="0 0 12 12" 
                    className="text-gray-400 dark:text-gray-500 fill-current"
                  >
                    <polygon points="6,12 0,4 12,4" />
                  </svg>
                  
                  <div className="pt-1">
                    <BranchGroup node={child.node} depth={depth + 1} label={child.label} />
                  </div>
                </div>
              ))}
            </div>
          ) : node.children.length === 1 ? (
            <div className="flex flex-col items-center">
              <svg 
                width="12" 
                height="12" 
                viewBox="0 0 12 12" 
                className="text-gray-400 dark:text-gray-500 fill-current"
              >
                <polygon points="6,12 0,4 12,4" />
              </svg>
              <div className="pt-1">
                <TreeNode node={node.children[0].node} depth={depth + 1} />
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function BranchGroup({ node, depth, label }: { node: TreeNodeData; depth: number; label?: string }) {
  const hasBranches = node.children.length > 0;
  
  const needsBranchBox = hasBranches && node.children.some(c => 
    c.node.type === "decision" || c.node.children.length > 0
  );

  if (needsBranchBox) {
    return (
      <div className="flex flex-col items-center">
        <div className="border-2 border-dashed border-sky-400 dark:border-sky-500 rounded-lg p-4 relative">
          <span className="absolute -top-3 left-3 bg-background text-xs text-muted-foreground px-2">
            Branch
          </span>
          <TreeNode node={node} depth={depth} />
        </div>
      </div>
    );
  }

  return <TreeNode node={node} depth={depth} />;
}

export function DecisionTreeViewer({ graph, open, onOpenChange }: DecisionTreeViewerProps) {
  const treeData = useMemo(() => {
    if (!graph.rootStepId || !graph.steps[graph.rootStepId]) return null;
    return buildTree(graph, graph.rootStepId);
  }, [graph]);

  const handleOpenChange = (newOpen: boolean) => {
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
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="flex items-center gap-2">
              <GitBranch className="w-5 h-5" />
              Decision Trees
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleOpenChange(false)}
              data-testid="button-close-tree"
              aria-label="Close tree view"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-amber-100 dark:bg-amber-900/40 border border-amber-400 dark:border-amber-600" />
              <span>Root node</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-blue-100 dark:bg-blue-900/40 border border-blue-400 dark:border-blue-600" />
              <span>Decision node</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-emerald-100 dark:bg-emerald-900/40 border border-emerald-400 dark:border-emerald-600" />
              <span>Leaf node</span>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <Badge variant="outline">{Object.keys(graph.steps).length} steps</Badge>
            <Badge variant="secondary">{getTotalBranches()} branches</Badge>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto py-6">
          <div className="flex justify-center min-w-max">
            {treeData ? (
              <TreeNode node={treeData} depth={0} />
            ) : (
              <div className="text-center text-muted-foreground py-8">
                No steps in this template yet
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
