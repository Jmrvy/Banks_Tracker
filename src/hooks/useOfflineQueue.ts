import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';

interface QueuedOperation {
  id: string;
  operation: () => Promise<void>;
  timestamp: number;
}

export const useOfflineQueue = () => {
  const [queue, setQueue] = useState<QueuedOperation[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const addToQueue = (operation: () => Promise<void>) => {
    const queuedOp: QueuedOperation = {
      id: crypto.randomUUID(),
      operation,
      timestamp: Date.now()
    };
    
    setQueue(prev => [...prev, queuedOp]);
    
    // Save to localStorage for persistence
    const saved = localStorage.getItem('offline-queue') || '[]';
    const savedQueue = JSON.parse(saved);
    localStorage.setItem('offline-queue', JSON.stringify([...savedQueue, {
      id: queuedOp.id,
      timestamp: queuedOp.timestamp
    }]));
  };

  const processQueue = async () => {
    if (isProcessing || queue.length === 0 || !navigator.onLine) return;

    setIsProcessing(true);
    toast({
      title: "Synchronisation",
      description: `Synchronisation de ${queue.length} opération(s) en attente...`,
    });

    const results = {
      success: 0,
      failed: 0
    };

    for (const item of queue) {
      try {
        await item.operation();
        results.success++;
        setQueue(prev => prev.filter(q => q.id !== item.id));
      } catch (error) {
        console.error('Failed to process queued operation:', error);
        results.failed++;
      }
    }

    if (results.success > 0) {
      toast({
        title: "Synchronisation terminée",
        description: `${results.success} opération(s) synchronisée(s)${results.failed > 0 ? `, ${results.failed} échec(s)` : ''}`,
      });
    }

    localStorage.removeItem('offline-queue');
    setIsProcessing(false);
  };

  useEffect(() => {
    const handleSync = () => {
      processQueue();
    };

    window.addEventListener('sync-offline-data', handleSync);
    
    // Try to process queue on mount if online
    if (navigator.onLine && queue.length > 0) {
      processQueue();
    }

    return () => {
      window.removeEventListener('sync-offline-data', handleSync);
    };
  }, [queue, isProcessing]);

  return {
    addToQueue,
    queueLength: queue.length,
    isProcessing
  };
};
