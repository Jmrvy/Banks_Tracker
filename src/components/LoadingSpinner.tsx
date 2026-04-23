export const LoadingSpinner = ({ text }: { text?: string }) => (
  <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex items-center justify-center">
    <div className="text-center space-y-4">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" role="status" />
      {text && <p className="text-sm text-muted-foreground">{text}</p>}
    </div>
  </div>
);

export const InlineSpinner = () => (
  <div className="flex items-center justify-center py-12">
    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" role="status" />
  </div>
);
