import { useOffline } from '@/hooks/useOffline';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { WifiOff, Wifi, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export const OfflineIndicator = () => {
  const { isOnline } = useOffline();
  const { queueLength, isProcessing } = useOfflineQueue();

  if (isOnline && queueLength === 0 && !isProcessing) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md">
      {!isOnline ? (
        <Alert className="bg-warning/10 border-warning">
          <WifiOff className="h-4 w-4 text-warning" />
          <AlertDescription className="text-sm text-warning">
            Mode hors ligne - Les modifications seront synchronisées lors de la reconnexion
            {queueLength > 0 && ` (${queueLength} en attente)`}
          </AlertDescription>
        </Alert>
      ) : isProcessing ? (
        <Alert className="bg-primary/10 border-primary">
          <Loader2 className="h-4 w-4 text-primary animate-spin" />
          <AlertDescription className="text-sm text-primary">
            Synchronisation en cours...
          </AlertDescription>
        </Alert>
      ) : queueLength > 0 ? (
        <Alert className="bg-muted border-muted-foreground">
          <Wifi className="h-4 w-4 text-muted-foreground" />
          <AlertDescription className="text-sm text-muted-foreground">
            {queueLength} opération(s) en attente de synchronisation
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
};
