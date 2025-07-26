interface ProgressBarProps {
  current: number;
  total: number;
  progress: number;
}

export default function ProgressBar({ current, total, progress }: ProgressBarProps) {
  return (
    <div className="bg-surface shadow-sm sticky top-0 z-10">
      <div className="max-w-4xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-semibold text-secondary">you are this moment: aformulationoftruth.com</h1>
          <span className="text-sm text-muted-foreground">Question {current} of {total}</span>
        </div>
        
        {/* Progress Bar */}
        <div className="w-full bg-muted rounded-full h-2">
          <div 
            className="bg-primary h-2 rounded-full progress-bar" 
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="text-xs text-muted-foreground mt-1 text-right">{progress}% complete</div>
      </div>
    </div>
  );
}
