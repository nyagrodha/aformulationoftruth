interface LoadingOverlayProps {
  isVisible: boolean;
  title?: string;
  message?: string;
}

export default function LoadingOverlay({ 
  isVisible, 
  title = "Processing...", 
  message = "Please wait" 
}: LoadingOverlayProps) {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-lg p-8 max-w-sm mx-4 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <h3 className="font-medium text-secondary mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
