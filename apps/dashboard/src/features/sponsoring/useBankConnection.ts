/**
 * @file The queries and mutations of the bank connection, ported from
 * lmaa.space (`apps/dashboard/src/features/system/bank-connection/hooks/useBankConnection.ts`).
 * Reading the account now belongs to the import and has no mutation here yet.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  BANK_CONNECTION_QUERY_KEY,
  completeBankAuthorization,
  disconnectBank,
  fetchBankConnection,
  startBankAuthorization,
} from "@/features/sponsoring/api";

/**
 * What the site knows about its link to the bank account.
 *
 * @param enabled - Whether to ask at all, `true` by default. A caller that
 *   renders for everybody, such as the sidebar, passes whether this user may
 *   open the page rather than letting the request come back 403.
 * @returns The query holding the status.
 */
export function useBankConnection(enabled = true) {
  return useQuery({ queryKey: BANK_CONNECTION_QUERY_KEY, queryFn: fetchBankConnection, enabled });
}

/**
 * Starts an authorization and hands back where the browser has to go.
 *
 * @returns The mutation. Its result carries the bank's own address, which the
 *   caller navigates to; nothing happens until it does.
 */
export function useStartBankAuthorization() {
  return useMutation({ mutationFn: startBankAuthorization });
}

/**
 * Hands the return from the bank to the backend, which spends it.
 *
 * @returns The mutation. On success the status it answers replaces the cached
 *   one, so the page the caller lands on shows the new connection without
 *   asking for it again.
 */
export function useCompleteBankAuthorization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: completeBankAuthorization,
    onSuccess: (status) => {
      queryClient.setQueryData(BANK_CONNECTION_QUERY_KEY, status);
    },
  });
}

/**
 * Lets the account go and ends the consent behind it.
 *
 * @returns The mutation.
 *
 * @remarks
 * Invalidates whether it succeeded or not. The backend withdraws the connection
 * before it tries to close the session at the bank, so even the failure leaves
 * the stored status different from what the page is holding.
 */
export function useDisconnectBank() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: disconnectBank,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: BANK_CONNECTION_QUERY_KEY });
    },
  });
}
