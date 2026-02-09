import { useEffect, useRef, useState, useCallback } from "react";

interface NavigationGuardOptions {
  /** Returns true if there are unsaved changes */
  hasUnsavedChanges: () => boolean;
  /** Optional: called when user confirms they want to leave */
  onConfirmLeave?: () => void;
  /** Message for the browser's beforeunload dialog */
  message?: string;
}

export function useNavigationGuard({
  hasUnsavedChanges,
  onConfirmLeave,
  message = "You have unsaved changes. Are you sure you want to leave?",
}: NavigationGuardOptions) {
  const [showDialog, setShowDialog] = useState(false);
  const pendingNavigationRef = useRef<string | null>(null);
  const hasUnsavedRef = useRef(hasUnsavedChanges);

  // Keep ref in sync
  useEffect(() => {
    hasUnsavedRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  // Browser tab close / refresh warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedRef.current()) {
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [message]);

  // Intercept Wouter navigation
  // Override the pushState to intercept SPA navigation
  useEffect(() => {
    const originalPushState = history.pushState.bind(history);

    const interceptNavigation = (url: string) => {
      if (hasUnsavedRef.current()) {
        pendingNavigationRef.current = url;
        setShowDialog(true);
        return false; // Block navigation
      }
      return true; // Allow navigation
    };

    history.pushState = function (...args) {
      const url = args[2]?.toString() || "";
      if (interceptNavigation(url)) {
        return originalPushState(...args);
      }
    };

    return () => {
      history.pushState = originalPushState;
    };
  }, []);

  const confirmLeave = useCallback(() => {
    setShowDialog(false);
    onConfirmLeave?.();
    if (pendingNavigationRef.current) {
      // Temporarily disable guard, then navigate
      const url = pendingNavigationRef.current;
      pendingNavigationRef.current = null;
      window.location.href = url;
    }
  }, [onConfirmLeave]);

  const cancelLeave = useCallback(() => {
    setShowDialog(false);
    pendingNavigationRef.current = null;
  }, []);

  return {
    showDialog,
    confirmLeave,
    cancelLeave,
  };
}
