import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { rpc } from '@/domain/daemon-client';
import type { Prompt } from '../types';

export function usePrompts() {
  return useQuery<Prompt[]>({
    queryKey: ['prompts'],
    queryFn: async () => {
      try {
        const res = await rpc('prompt.list');
        if (res.ok && Array.isArray(res.prompts)) {
          return res.prompts as Prompt[];
        }
      } catch { /* ignore */ }
      return [];
    },
    staleTime: 30000,
  });
}

export function useAddPrompt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ label, prompt }: { label: string; prompt: string }) => {
      await rpc('prompt.add', { label, prompt });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
    },
  });
}

export function useRemovePrompt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await rpc('prompt.remove', { id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
    },
  });
}

export function useUpdatePrompt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ oldId, label, prompt }: { oldId: string; label: string; prompt: string }) => {
      await rpc('prompt.remove', { id: oldId });
      await rpc('prompt.add', { label, prompt });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
    },
  });
}
