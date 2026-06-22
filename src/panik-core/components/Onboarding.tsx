/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, ArrowRight, Check, ShieldAlert, Wallet } from "lucide-react";
import {
  QUESTIONS,
  computeProfile,
  type Answers,
  type OptionKey,
  type ProfileResult,
} from "../lib/profiling";

/**
 * Address format check (no backend yet — purely client-side).
 * EVM: 0x + 40 hex chars (42 total). Solana: base58, 32–44 chars.
 */
export function isPlausibleWalletAddress(raw: string): boolean {
  const a = raw.trim();
  if (!a) return false;
  const isEvm = /^0x[0-9a-fA-F]{40}$/.test(a);
  const isSolana = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a);
  return isEvm || isSolana;
}

const TOTAL_QUESTIONS = QUESTIONS.length; // 5
const WALLET_STEP = TOTAL_QUESTIONS;      // index 5 → wallet screen

interface OnboardingProps {
  /** Called with the computed profile + the (mandatory) wallet address. */
  onComplete: (result: ProfileResult, wallet: string) => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);               // 0..4 questions, 5 wallet
  const [answers, setAnswers] = useState<Answers>({});
  const [wallet, setWallet] = useState("");
  const [walletError, setWalletError] = useState("");
  const [exiting, setExiting] = useState(false);

  const walletValid = isPlausibleWalletAddress(wallet);
  const onWalletStep = step === WALLET_STEP;
  const progressPct = Math.round(((step + 1) / (TOTAL_QUESTIONS + 1)) * 100);

  const selectAnswer = (qid: keyof Answers, key: OptionKey) => {
    setAnswers((prev) => ({ ...prev, [qid]: key }));
    // Smoothly auto-advance — keeps the whole flow under ~60s.
    window.setTimeout(() => setStep((s) => Math.min(s + 1, WALLET_STEP)), 280);
  };

  const goBack = () => setStep((s) => Math.max(0, s - 1));

  const handleEnter = () => {
    if (!walletValid) {
      setWalletError("That doesn't look like a valid EVM (0x…) or Solana address.");
      return;
    }
    const result = computeProfile(answers);
    setExiting(true);
    window.setTimeout(() => onComplete(result, wallet.trim()), 320);
  };

  const handleWalletChange = (value: string) => {
    setWallet(value);
    if (walletError) setWalletError("");
  };

  return (
    <AnimatePresence>
      {!exiting && (
        <motion.div
          key="onboarding-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md"
        >
          <div className="absolute inset-0 panik-radial-ambient pointer-events-none" />

          <motion.div
            initial={{ scale: 0.96, y: 12, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-lg panik-glass rounded-2xl border border-white/[0.08] bg-[#0E1015]/95 shadow-2xl overflow-hidden"
          >
            <div className="h-1 w-full bg-gradient-to-r from-panik-orange/0 via-panik-orange to-panik-orange/0" />

            <div className="p-7 sm:p-9">
              {/* Header: brand + step indicator */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <img src="/panik-logo.png" alt="PANIK" width={28} height={28} style={{ objectFit: "contain" }} />
                  <span className="font-display font-extrabold text-base tracking-widest text-white leading-none">PANIK</span>
                </div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-panik-text-secondary">
                  {onWalletStep ? "Final step" : `Question ${step + 1} of ${TOTAL_QUESTIONS}`}
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-1 w-full bg-white/[0.05] rounded-full overflow-hidden mb-7">
                <motion.div
                  className="h-full bg-panik-orange rounded-full"
                  initial={false}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              </div>

              {/* Keyed, enter-only animation — no AnimatePresence/exit, so a
                  step can never be stranded mid-transition. React swaps the
                  content instantly on key change; the new step slides in. */}
              <motion.div
                  key={onWalletStep ? "wallet" : `q-${step}`}
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.22 }}
                  className="w-full"
                >
                {!onWalletStep ? (
                  <>
                    <h2 className="font-display font-extrabold text-xl sm:text-2xl text-white tracking-tight leading-snug mb-1.5">
                      {QUESTIONS[step].text}
                    </h2>
                    {QUESTIONS[step].subtitle && (
                      <p className="text-panik-text-secondary text-sm font-sans mb-5 leading-relaxed">
                        {QUESTIONS[step].subtitle}
                      </p>
                    )}

                    <div role="radiogroup" aria-label={QUESTIONS[step].text} className="space-y-2.5">
                      {QUESTIONS[step].options.map((o) => {
                        const selected = answers[QUESTIONS[step].id] === o.key;
                        return (
                          <button
                            key={o.key}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => selectAnswer(QUESTIONS[step].id, o.key)}
                            className={`w-full text-left flex items-start gap-3 p-3.5 rounded-xl border transition-all cursor-pointer ${
                              selected
                                ? "border-panik-orange/60 bg-panik-orange/[0.07] ring-2 ring-panik-orange/30"
                                : "border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12]"
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className={`shrink-0 mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                                selected ? "border-panik-orange text-panik-orange" : "border-white/20"
                              }`}
                            >
                              {selected && <Check className="w-3 h-3 stroke-[3.5]" />}
                            </span>
                            <span className={`flex-1 text-sm leading-relaxed font-sans ${selected ? "text-white" : "text-white/80"}`}>
                              {o.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {step > 0 && (
                      <button
                        type="button"
                        onClick={goBack}
                        className="mt-6 flex items-center gap-1.5 text-xs font-mono text-panik-text-secondary hover:text-white transition-colors cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Back</span>
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <h2 className="font-display font-extrabold text-2xl text-white tracking-tight mb-1.5">
                      Add your wallet
                    </h2>
                    <p className="text-panik-text-secondary text-sm font-sans mb-6 leading-relaxed">
                      Paste your wallet address so Panik can monitor your positions and send relevant alerts.
                    </p>

                    <div className="relative">
                      <Wallet className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-panik-text-secondary pointer-events-none" />
                      <input
                        type="text"
                        inputMode="text"
                        autoComplete="off"
                        spellCheck={false}
                        autoFocus
                        value={wallet}
                        onChange={(e) => handleWalletChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && walletValid) handleEnter();
                        }}
                        placeholder="0x... or your Solana address"
                        aria-invalid={Boolean(walletError)}
                        aria-describedby={walletError ? "wallet-error" : undefined}
                        className={`w-full h-12 pl-10 pr-4 rounded-xl bg-[#090C12] border text-sm font-mono text-white placeholder:text-white/25 outline-none transition-all ${
                          walletError
                            ? "border-red-500/50 focus:border-red-500/70"
                            : "border-white/[0.08] focus:border-panik-orange/60"
                        }`}
                      />
                    </div>

                    {walletError && (
                      <p id="wallet-error" role="alert" className="mt-2.5 flex items-center gap-1.5 text-red-400 text-xs font-mono">
                        <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>{walletError}</span>
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={handleEnter}
                      disabled={!walletValid}
                      className="mt-7 w-full h-12 rounded-xl font-mono text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 bg-panik-orange hover:bg-panik-orange/90 text-white panik-glow-orange disabled:bg-white/[0.06] disabled:text-panik-text-secondary disabled:shadow-none"
                    >
                      <span>Enter Panik</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={goBack}
                      className="mt-5 flex items-center gap-1.5 text-xs font-mono text-panik-text-secondary hover:text-white transition-colors cursor-pointer mx-auto"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back</span>
                    </button>
                  </>
                )}
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
