import { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';

interface QueuedOperation {
  id: string;
  operation: () => Promise<void>;
  timestamp: number;
}

export const useOfflineQueue = () => {
  const [queue, setQueue] = useState<QueuedOperation[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const processingLockRef = useRef(false);
  const { toast } = useToast();
  const { t } = useTranslation();

  const addToQueue = useCallback((operation: () => Promise<void>) => {
    const queuedOp: QueuedOperation = {
      id: crypto.randomUUID(),
      operation,
      timestamp: Date.now()
    };

    setQueue(prev => [...prev, queuedOp]);

    // Save to localStorage for persistence
    const saved = localStorage.getItem('offline-queue') || '[]';
    let savedQueue: Array<{ id: string; timestamp: number }> = [];
    try {
      savedQueue = JSON.parse(saved);
    } catch {
      console.warn('Invalid offline-queue in localStorage, resetting');
      savedQueue = [];
    }
    localStorage.setItem('offline-queue', JSON.stringify([...savedQueue, {
      id: queuedOp.id,
      timestamp: queuedOp.timestamp
    }]));
  }, []);

  const processQueue = useCallback(async () => {
    if (processingLockRef.current || !navigator.onLine) return;

    // Read queue from ref-like approach via setState callback
    setQueue(currentQueue => {
      if (currentQueue.length === 0) return currentQueue;

      processingLockRef.current = true;
      setIsProcessing(true);

      // Process asynchronously
      (async () => {
        toast({
          title: t('offline.syncing', { defaultValue: 'Syncing' }),
          description: t('offline.syncingDescription', {
            count: currentQueue.length,
            defaultValue: `Syncing ${currentQueue.length} pending operation(s)...`,
          }),
        });

        const results = { success: 0, failed: 0 };
        const failedIds: string[] = [];

        for (const item of currentQueue) {
          try {
            await item.operation();
            results.success++;
          } catch (error) {
            console.error('Failed to process queued operation:', error);
            results.failed++;
            failedIds.push(item.id);
          }
        }

        if (results.success > 0) {
          toast({
            title: t('offline.syncComplete', { defaultValue: 'Sync complete' }),
            description: results.failed > 0
              ? t('offline.syncCompleteWithFailures', {
                  success: results.success,
                  failed: results.failed,
                  defaultValue: `${results.success} operation(s) synced, ${results.failed} failure(s)`,
                })
              : t('offline.syncCompleteDescription', {
                  success: results.success,
                  defaultValue: `${results.success} operation(s) synced`,
                }),
          });
        }

        // Keep only failed items in queue
        setQueue(prev => prev.filter(q => failedIds.includes(q.id)));
        localStorage.removeItem('offline-queue');
        setIsProcessing(false);
        processingLockRef.current = false;
      })();

      return currentQueue; // Don't modify queue synchronously
    });
  }, [toast, t]);

  // Listen for sync events and process on mount if online
  useEffect(() => {
    const handleSync = () => {
      processQueue();
    };

    window.addEventListener('sync-offline-data', handleSync);
    window.addEventListener('online', handleSync);

    return () => {
      window.removeEventListener('sync-offline-data', handleSync);
      window.removeEventListener('online', handleSync);
    };
  }, [processQueue]);

  // Process queue once on mount if online and queue has items
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current && queue.length > 0 && navigator.onLine) {
      mountedRef.current = true;
      processQueue();
    }
  }, [queue.length, processQueue]);

  return {
    addToQueue,
    queueLength: queue.length,
    isProcessing
  };
};
