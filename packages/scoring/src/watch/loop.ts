/**
 * Watch loop skeleton — 60s cycle, profile-relative status transitions.
 * Notification channel is pluggable (Phase-0 alert-channel decision pending);
 * the loop only detects and emits transitions.
 */

import { statusFor } from "../profile";
import type { Band, ProfileStatus, Protocol, RiskProfile } from "../types";

export interface WatchScore {
  protocol: Protocol;
  wallet: string;
  total: number;
  band: Band;
}

export interface WatchTransition {
  wallet: string;
  protocol: Protocol;
  profile: RiskProfile;
  score: number;
  band: Band;
  /** null = first observation of this position. */
  from: ProfileStatus | null;
  to: ProfileStatus;
}

export interface WatchDeps {
  scoreWallet(wallet: string): Promise<WatchScore[]>;
  profileFor(wallet: string): RiskProfile;
  onTransition(t: WatchTransition): void;
  onError?(error: unknown, wallet: string): void;
  /** Default 60_000 (arch: 60s cycle). */
  intervalMs?: number;
}

export class WatchService {
  private readonly wallets = new Set<string>();
  private readonly lastStatus = new Map<string, ProfileStatus>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: WatchDeps) {}

  watch(wallet: string): void {
    this.wallets.add(wallet.toLowerCase());
  }

  unwatch(wallet: string): void {
    this.wallets.delete(wallet.toLowerCase());
  }

  /** One scoring pass over all watched wallets. Exposed for tests/manual runs. */
  async tick(): Promise<void> {
    for (const wallet of this.wallets) {
      try {
        const scores = await this.deps.scoreWallet(wallet);
        const profile = this.deps.profileFor(wallet);
        for (const s of scores) {
          const to = statusFor(profile, s.total);
          const key = `${wallet}:${s.protocol}`;
          const from = this.lastStatus.get(key) ?? null;
          if (from !== to) {
            this.lastStatus.set(key, to);
            this.deps.onTransition({
              wallet,
              protocol: s.protocol,
              profile,
              score: s.total,
              band: s.band,
              from,
              to,
            });
          }
        }
      } catch (error) {
        this.deps.onError?.(error, wallet);
      }
    }
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.deps.intervalMs ?? 60_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
