'use client';

import { useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';

/**
 * Component to query and provide image generation state for a toolCallId
 * This allows us to use hooks (useQuery) inside the map function
 */
export function ImageGenerationState({
  toolCallId,
  children,
  onComplete,
}: {
  toolCallId: string;
  children: (state: {
    status?: 'generating' | 'completed' | 'error';
    url?: string;
    images?: Array<{ url: string; storageKey: string }>;
    model?: string;
    error?: string;
  } | undefined) => React.ReactNode;
  onComplete?: (url: string) => void;
}) {
  const state = useQuery(
    api.imageGenerations.getGenerationByToolCallId,
    { toolCallId }
  );
  
  // Log for debugging
  useEffect(() => {
    if (state) {
      console.log('[ImageGenerationState] Query result:', {
        toolCallId,
        status: state.status,
        hasUrl: !!state.url,
        url: state.url?.substring(0, 50),
        hasImages: !!state.images,
        imageCount: state.images?.length ?? 0,
        images: state.images,
        model: state.model,
        error: state.error,
        fullState: state,
      });

      if (state.status === 'completed' && state.url && onComplete) {
        onComplete(state.url);
      }
    } else {
      console.log('[ImageGenerationState] No state found (query may be loading or no record exists) for toolCallId:', toolCallId);
    }
  }, [state, toolCallId, onComplete]);
  
  // Transform Convex document to the expected shape
  const transformedState = state ? {
    status: state.status,
    url: state.url,
    images: state.images,
    model: state.model,
    error: state.error,
  } : undefined;
  
  return <>{children(transformedState)}</>;
}
