// config/queryClient.ts - TanStack Query client configuration
import { QueryClient } from '@tanstack/react-query';

/**
 * Configured QueryClient for TanStack Query
 * - Default stale time: 5 minutes
 * - Cache time: 10 minutes
 * - Retry: 2 attempts
 * - Refetch on window focus: true
 * - Refetch on reconnect: true
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      retry: 2,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});

