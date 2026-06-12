/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";

/**
 * AppProviders — the infrastructure boundary for the isolated product app.
 *
 * This is the single place to mount real infra as it comes online, e.g.:
 *   - Wallet / wagmi / RainbowKit provider
 *   - Supabase client + auth/session provider
 *   - React Query / data-fetching provider
 *   - On-chain escrow / payment context
 *
 * Keeping all of it here (rather than in the landing bundle) is what makes the
 * app a separate, hardened security surface. The landing page never imports
 * any of these providers.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  // TODO: wrap `children` with wallet / supabase / auth providers as infra lands.
  return <>{children}</>;
}
