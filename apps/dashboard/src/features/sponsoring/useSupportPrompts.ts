/**
 * @file The queries and mutations behind the support prompt screens, shared by
 * the list and the editor so both read and invalidate the same cache entries.
 */

import type { SupportPromptInput, SupportPromptLimits } from "@musiccloud/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createSupportPrompt,
  deleteSupportPrompt,
  fetchSupportPromptLimits,
  fetchSupportPrompts,
  SUPPORT_PROMPT_LIMITS_QUERY_KEY,
  SUPPORT_PROMPTS_QUERY_KEY,
  updateSupportPrompt,
  updateSupportPromptLimits,
} from "@/features/sponsoring/api";

/** Milliseconds in a second, for {@link SUPPORT_PROMPTS_STALE_TIME_MS}. */
const MILLISECONDS_PER_SECOND = 1000;

/**
 * How long a read of the prompts or the limits counts as fresh before a screen
 * that mounts fetches it again: 30 seconds, as lmaa.space keeps them.
 */
const SUPPORT_PROMPTS_STALE_TIME_MS = 30 * MILLISECONDS_PER_SECOND;

/**
 * Every prompt, published or not, for the list in the dashboard.
 *
 * @returns The query.
 */
export function useSupportPrompts() {
  return useQuery({
    queryKey: SUPPORT_PROMPTS_QUERY_KEY,
    queryFn: fetchSupportPrompts,
    staleTime: SUPPORT_PROMPTS_STALE_TIME_MS,
  });
}

/**
 * What bounds one reader across every prompt together.
 *
 * @returns The query.
 */
export function useSupportPromptLimits() {
  return useQuery({
    queryKey: SUPPORT_PROMPT_LIMITS_QUERY_KEY,
    queryFn: fetchSupportPromptLimits,
    staleTime: SUPPORT_PROMPTS_STALE_TIME_MS,
  });
}

/**
 * Stores the limits and reads them back afterwards.
 *
 * @returns The mutation.
 */
export function useSaveSupportPromptLimits() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (limits: SupportPromptLimits) => updateSupportPromptLimits(limits),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SUPPORT_PROMPT_LIMITS_QUERY_KEY }),
  });
}

/**
 * Creates a prompt and returns it with the identifier it was given.
 *
 * @returns The mutation.
 */
export function useCreateSupportPrompt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SupportPromptInput) => createSupportPrompt(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SUPPORT_PROMPTS_QUERY_KEY }),
  });
}

/**
 * Saves one prompt. The identifier never changes, so nobody's counters reset.
 *
 * @returns The mutation, called with the prompt's id and its new fields.
 */
export function useSaveSupportPrompt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SupportPromptInput }) => updateSupportPrompt(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SUPPORT_PROMPTS_QUERY_KEY }),
  });
}

/**
 * Removes one prompt.
 *
 * @returns The mutation, called with the prompt's id.
 */
export function useDeleteSupportPrompt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSupportPrompt(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SUPPORT_PROMPTS_QUERY_KEY }),
  });
}
