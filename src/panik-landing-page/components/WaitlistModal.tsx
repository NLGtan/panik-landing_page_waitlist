/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  X, Mail, ArrowRight, ChevronDown, CheckCircle2, ChevronRight, 
  Sparkles, ShieldAlert, Search, Check, Info, HeartHandshake, Twitter
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { WaitlistEntry } from "../types";

// Logos for wallets in SVG format
const MetaMaskLogo = () => (
  <svg className="w-6 h-6 mr-3" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M29.5 13.5L25.3 4.2C25.1 3.8 24.6 3.6 24.2 3.8L16.2 7.8L8.2 3.8C7.8 3.6 7.3 3.8 7.1 4.2L2.9 13.5C2.7 13.9 2.8 14.4 3.1 14.7L15.3 26.9C15.7 27.3 16.3 27.3 16.7 26.9L28.9 14.7C29.2 14.4 29.3 13.9 29.5 13.5Z" fill="#F6851B"/>
    <path d="M16 19.5L10.5 16.5L8.5 17.5L16 23.5L23.5 17.5L21.5 16.5L16 19.5Z" fill="#E2761B"/>
    <path d="M24.5 11.5L20.5 9.5L16 11.5L11.5 9.5L7.5 11.5L5.5 16L7.5 16.5L11.5 14L16 15.5L20.5 14L24.5 16.5L26.5 16L24.5 11.5Z" fill="#D7C1B1"/>
  </svg>
);

const CoinbaseLogo = () => (
  <svg className="w-6 h-6 mr-3" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="14" fill="#0052FF"/>
    <path d="M9 16C9 12.134 12.134 9 16 9C19.866 9 23 12.134 23 16C23 19.866 19.866 23 16 23C12.134 23 9 19.866 9 16Z" fill="white"/>
  </svg>
);

const RabbyLogo = () => (
  <svg className="w-6 h-6 mr-3" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="32" height="32" rx="6" fill="#1C1D24"/>
    <circle cx="16" cy="16" r="10" fill="#2563EB"/>
    <path d="M11 16H21" stroke="white" strokeWidth="3" strokeLinecap="round"/>
    <path d="M16 11V21" stroke="white" strokeWidth="3" strokeLinecap="round"/>
  </svg>
);

const WalletConnectLogo = () => (
  <svg className="w-6 h-6 mr-3" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8.2 11.8C12.5 7.5 19.5 7.5 23.8 11.8L25.2 13.2C25.6 13.6 25.6 14.3 25.2 14.7L22.4 17.5C22 17.9 21.3 17.9 20.9 17.5L19.9 16.5C17.7 14.3 14.3 14.3 12.1 16.5L11.1 17.5C10.7 17.9 10 17.9 9.6 17.5L6.8 14.7C6.4 14.3 6.4 13.6 6.8 13.2L8.2 11.8Z" fill="#3B99FC"/>
    <path d="M14.2 18.2C15.2 17.2 16.8 17.2 17.8 18.2L20.6 21C21 21.4 21 22.1 20.6 22.5L17.8 25.3C17.4 25.7 16.7 25.7 16.3 25.3L15.6 24.6C15.3 24.3 14.7 24.3 14.4 24.6L13.7 25.3C13.3 25.7 12.6 25.7 12.2 25.3L9.4 22.5C9 22.1 9 21.4 9.4 21L14.2 18.2Z" fill="#3B99FC"/>
  </svg>
);

interface DropdownSelectProps {
  options: string[];
  selected: string;
  onChange: (value: string) => void;
  placeholder?: string;
  isSearchable?: boolean;
}

// Gorgeous Custom Searchable Dropdown
function DropdownSelect({ options, selected, onChange, placeholder = "Select an option", isSearchable = false }: DropdownSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = isSearchable
    ? options.filter(opt => opt.toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <div ref={dropdownRef} className="relative w-full font-mono text-xs">
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setSearch("");
        }}
        className="w-full h-12 px-4 flex items-center justify-between bg-[#111318] hover:bg-[#161922] border border-white/[0.08] hover:border-white/18 rounded-lg text-left text-[#F0F4FF] transition-all duration-300"
      >
        <span className={selected ? "text-white font-sans text-sm font-medium" : "text-white/30 font-sans text-sm font-medium"}>
          {selected || placeholder}
        </span>
        <ChevronDown className={`w-4 h-4 text-white/40 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            transition={{ duration: 0.15 }}
            className="relative mt-2 bg-[#12141D] border border-white/[0.1] rounded-lg shadow-2xl z-50 overflow-hidden max-h-56 flex flex-col backdrop-blur-xl"
          >
            {isSearchable && (
              <div className="p-2 border-b border-white/[0.05] flex items-center gap-2 bg-[#0E1016]">
                <Search className="w-3.5 h-3.5 text-white/35 shrink-0" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Type to filter..."
                  className="w-full bg-transparent text-white placeholder-white/25 outline-none font-sans text-sm"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
            <div className="overflow-y-auto flex-1 py-1 max-h-40 divide-y divide-white/[0.02]">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      onChange(opt);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-4 py-3 text-sm font-sans flex items-center justify-between transition-colors ${
                      selected === opt 
                        ? "bg-panik-orange/10 text-panik-orange font-semibold" 
                        : "text-white/70 hover:bg-white/[0.03] hover:text-white"
                    }`}
                  >
                    <span>{opt}</span>
                    {selected === opt && <Check className="w-4 h-4" />}
                  </button>
                ))
              ) : (
                <div className="px-4 py-3 text-white/30 font-sans text-xs italic text-center">
                  No matching options
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface WaitlistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoinSuccess: (email: string, source: string) => void;
  initialEmail?: string;
}

export function WaitlistModal({ isOpen, onClose, onJoinSuccess, initialEmail = "" }: WaitlistModalProps) {
  // Main state loops
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [qIndex, setQIndex] = useState(0);

  // Unified Profiler answers state
  const [answers, setAnswers] = useState({
    acquisitionSource: "",
    additionalNotes: ""
  });

  // State to simulate wallet loading state
  const [connectingWallet, setConnectingWallet] = useState<string | null>(null);
  const [connectedWallet, setConnectedWallet] = useState<string | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualAddress, setManualAddress] = useState("");
  const [manualAddressError, setManualAddressError] = useState("");

  // Clear states when closing or opening
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setEmail(initialEmail);
      setEmailError("");
      setQIndex(0);
      setAnswers({
        acquisitionSource: "",
        additionalNotes: ""
      });
      setConnectingWallet(null);
      setConnectedWallet(null);
      setShowManualInput(false);
      setManualAddress("");
      setManualAddressError("");
    }
  }, [isOpen, initialEmail]);

  if (!isOpen) return null;

  // Handle Step 1 Email Continue
  const handleEmailNext = (e: React.FormEvent) => {
    e.preventDefault();
    const formattedEmail = email.trim();
    if (!formattedEmail) return;

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formattedEmail)) {
      setEmailError("Please enter a valid corporate or Web3 email address");
      return;
    }

    setEmailError("");
    setStep(2); // Go to questions
  };

  // Questions Setup
  const questionsList = [
    {
      id: "acquisitionSource",
      text: "Where did you hear about Panik?",
      options: [
        "Protocol Camp",
        "Twitter / X",
        "Friend or Referral",
        "Discord",
        "Telegram",
        "YouTube",
        "Google Search",
        "Crypto Newsletter",
        "Conference / Event",
        "Other"
      ],
      isSearchable: true // The required final question is searchable for smooth onboarding CX
    }
  ];

  const currentQ = questionsList[0];

  const handleSelectAnswer = (valve: string) => {
    setAnswers(prev => ({ ...prev, acquisitionSource: valve }));
  };

  const handleNextQuestion = () => {
    if (answers.acquisitionSource) {
      setStep(3);
    }
  };

  // Handle Review confirmation transition
  const handleConfirmOnboarding = () => {
    // Notify parent to add subscriber!
    // Set waitlist source based on selected activity to show nicely in historical listings
    const subscriberSource = answers.acquisitionSource || "Default Referrer";
    onJoinSuccess(email, subscriberSource);

    // Proceed to Wallet Connection
    setStep(4);
  };

  // Simulate wallet pairing
  const handleWalletClick = (walletName: string) => {
    setConnectingWallet(walletName);
    setTimeout(() => {
      setConnectingWallet(null);
      setConnectedWallet(walletName);
      // Automatically advance to success screen after elegant fake connection
      setStep(5);
    }, 1200);
  };

  // Handle manual address submission
  const handleManualAddressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const address = manualAddress.trim();
    if (!address) {
      setManualAddressError("Please enter a valid wallet address");
      return;
    }

    const isEVM = /^0x[a-fA-F0-9]{40}$/.test(address);
    const isENS = /.+\.eth$/i.test(address);
    const isGenericAddress = /^[a-zA-Z0-9]{25,65}$/.test(address);

    if (!isEVM && !isENS && !isGenericAddress) {
      setManualAddressError("Please enter a valid EVM address (0x...), Solana address, or ENS name");
      return;
    }

    setManualAddressError("");
    setConnectingWallet("Manual Input");
    setTimeout(() => {
      setConnectingWallet(null);
      const shortenedAddress = address.length > 12 
        ? `${address.slice(0, 6)}...${address.slice(-4)}` 
        : address;
      setConnectedWallet(shortenedAddress);
      setStep(5);
    }, 1200);
  };

  const currentStepPercentage = Math.round(((step - 1) / 4) * 100);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto">
      {/* Background dark glass overlay blur */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/75 backdrop-blur-md"
      />

      {/* Main Glass Panel */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ type: "spring", duration: 0.5 }}
        className="w-full max-w-[650px] bg-[#0E1016]/95 border border-white/[0.08] hover:border-orange-500/15 p-6 sm:p-10 rounded-2xl relative shadow-2xl backdrop-blur-2xl z-10"
      >
        {/* Glow ambient circle accent */}
        <div className="absolute top-0 right-0 w-44 h-44 bg-panik-orange/5 rounded-full blur-[60px] pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-56 h-56 bg-panik-orange/3 rounded-full blur-[80px] pointer-events-none" />

        {/* Global Modal Header Bar */}
        <div className="flex justify-between items-center mb-6 relative z-10">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-panik-orange animate-pulse" />
            <span className="text-[10px] font-mono tracking-widest text-[#94A3B8] uppercase">
              RESERVE ONBOARDING INDEX
            </span>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-white/5 text-white/50 hover:text-white transition-all duration-200"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Progress HUD bar info */}
        {step < 5 && (
          <div className="mb-8 w-full">
            <div className="flex justify-between items-center text-[10px] font-mono text-white/40 mb-1.5 tracking-wider uppercase">
              <span>Waitlist Pipeline</span>
              <span>Step {step} of 4 ({currentStepPercentage}%)</span>
            </div>
            {/* Progress line track */}
            <div className="h-[2px] w-full bg-white/[0.05] rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-panik-orange" 
                initial={{ width: 0 }}
                animate={{ width: `${currentStepPercentage}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* STEP 1: EMAIL COLLECTION */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div>
                <h2 className="font-display font-medium text-2xl sm:text-3xl text-white tracking-tight leading-snug">
                  Join the Panik Early Access Program
                </h2>
                <p className="text-panik-text-secondary text-sm font-sans mt-2.5 leading-relaxed">
                  Help us build the future of DeFi risk intelligence. Answer a few quick profiling questions to secure early access and reserve your queue slot.
                </p>
              </div>

              <form onSubmit={handleEmailNext} className="space-y-4">
                <div>
                  <label htmlFor="modal-email-input" className="block text-[11px] font-mono tracking-wider text-white/50 uppercase mb-2">
                    Enter email address
                  </label>
                  <div className="relative flex items-center">
                    <Mail className="absolute left-4 w-4.5 h-4.5 text-white/30" />
                    <input
                      type="email"
                      id="modal-email-input"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com or web3 mail..."
                      className="w-full h-12 pl-12 pr-4 bg-[#111318] border border-white/[0.08] hover:border-white/18 focus:border-panik-orange/50 focus:ring-1 focus:ring-panik-orange/20 text-[#F0F4FF] placeholder-white/25 text-sm font-sans rounded-lg outline-none transition-all duration-300"
                      required
                    />
                  </div>
                  {emailError && (
                    <p className="text-red-400 text-xs font-mono mt-2.5 flex items-center gap-1.5 animate-fadeIn">
                      <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                      <span>{emailError}</span>
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={!email}
                  className="w-full h-12 bg-panik-orange hover:bg-panik-orange/90 disabled:opacity-50 disabled:hover:bg-panik-orange text-white font-mono text-xs uppercase tracking-wider font-semibold rounded-lg flex items-center justify-center gap-2 cursor-pointer transition-all duration-300 shadow-lg shadow-orange-500/5 active:scale-[0.99]"
                >
                  <span>Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </motion.div>
          )}

          {/* STEP 2: USER PROFILING QUESTIONS */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="space-y-6 min-h-[350px] pb-4"
            >
              <div className="flex justify-between items-center border-b border-white/[0.03] pb-3">
                <span className="text-[10px] font-mono tracking-widest text-[#F97316] uppercase font-bold">
                  User Profiling Evaluation
                </span>
                <span className="text-[10px] font-mono text-white/35">
                  Step 2 of 4
                </span>
              </div>

              <div className="space-y-5">
                <div>
                  <h3 className="font-display font-medium text-base sm:text-lg text-white tracking-tight leading-snug mb-2.5">
                    Where did you hear about Panik?
                  </h3>
                  <DropdownSelect
                    options={questionsList[0].options}
                    selected={answers.acquisitionSource}
                    onChange={handleSelectAnswer}
                    placeholder="Choose answer..."
                    isSearchable={true}
                  />
                </div>

                <div className="pt-2">
                  <h3 className="font-display font-medium text-sm text-white/80 tracking-tight leading-snug mb-2.5">
                    Anything else you want us to know about how you manage your DeFi positions? <span className="text-white/40">(Optional)</span>
                  </h3>
                  <textarea
                    rows={4}
                    value={answers.additionalNotes}
                    onChange={(e) => setAnswers(prev => ({ ...prev, additionalNotes: e.target.value }))}
                    placeholder="E.g., protocols you use, alerting strategies, or features you are looking for..."
                    className="w-full p-3.5 bg-[#111318] border border-white/[0.08] hover:border-white/18 focus:border-panik-orange/50 focus:ring-1 focus:ring-panik-orange/20 text-[#F0F4FF] placeholder-white/25 text-sm font-sans rounded-lg outline-none transition-all duration-300 resize-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 mt-6 border-t border-white/[0.03]">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-xs font-mono text-white/45 hover:text-white transition-colors uppercase h-10 px-4 rounded hover:bg-white/[0.02]"
                >
                  Back
                </button>

                <button
                  type="button"
                  onClick={handleNextQuestion}
                  disabled={!answers.acquisitionSource}
                  className="h-10 px-6 bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-40 text-white font-mono text-xs uppercase tracking-wider rounded border border-white/[0.08] hover:border-white/[0.15] flex items-center gap-1.5 transition-all duration-300 disabled:pointer-events-none"
                >
                  <span>Finish Summary</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 3: REVIEW & CONFIRMATION */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div>
                <h2 className="font-display font-medium text-2xl text-white tracking-tight">Onboarding Profile Summary</h2>
                <p className="text-panik-text-secondary text-sm mt-1">Review your credential indexes before submission security commits.</p>
              </div>

              {/* Receipt-style Onboarding Summary Card */}
              <div className="bg-[#111318]/80 border border-white/[0.06] rounded-xl overflow-hidden divide-y divide-white/[0.04]">
                <div className="p-4 flex justify-between items-center text-xs">
                  <span className="font-mono text-white/40 uppercase">Email</span>
                  <span className="font-mono text-white font-semibold truncate max-w-[220px] sm:max-w-xs">{email}</span>
                </div>
                <div className="p-4 flex justify-between items-center text-xs">
                  <span className="font-mono text-white/40 uppercase">Referral Source</span>
                  <span className="font-sans text-[#F0F4FF] font-medium">{answers.acquisitionSource}</span>
                </div>
                {answers.additionalNotes.trim() && (
                  <div className="p-4 flex flex-col gap-1 text-xs">
                    <span className="font-mono text-white/40 uppercase mb-1">Additional Notes</span>
                    <span className="font-sans text-[#F0F4FF] font-medium text-left leading-relaxed break-words block max-h-24 overflow-y-auto pr-1">{answers.additionalNotes}</span>
                  </div>
                )}
              </div>

              {/* Match Statement Banner */}
              <div className="p-4 rounded-xl bg-orange-500/[0.03] border border-panik-orange/15 flex items-start gap-3">
                <HeartHandshake className="w-5 h-5 text-panik-orange shrink-0 mt-0.5" />
                <p className="text-xs text-panik-text-secondary leading-relaxed">
                  Thanks. You're exactly the type of user we're building Panik for. Your profile signals robust alignment with our DeFi telemetry frameworks.
                </p>
              </div>

              <button
                type="button"
                onClick={handleConfirmOnboarding}
                className="w-full h-12 bg-panik-orange hover:bg-panik-orange/90 text-white font-mono text-xs uppercase tracking-wider font-bold rounded-lg flex items-center justify-center gap-2 cursor-pointer transition-all duration-300 active:scale-[0.99] shadow-lg shadow-orange-500/5 mt-4"
              >
                <span>Continue to Early Access Setup</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {/* STEP 4: WALLET CONNECTION */}
          {step === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <div>
                <h2 className="font-display font-medium text-2xl text-white tracking-tight leading-snug">
                  Reserve Your Beta Access
                </h2>
                <p className="text-panik-text-secondary text-sm font-sans mt-2 leading-relaxed">
                  When Panik launches its beta, connected wallets will receive priority access and early testing opportunities.
                </p>
              </div>

              {showManualInput ? (
                <form onSubmit={handleManualAddressSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="manual-wallet-input" className="block text-[11px] font-mono tracking-wider text-white/50 uppercase mb-2">
                      Enter public wallet address (EVM address or ENS)
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        id="manual-wallet-input"
                        value={manualAddress}
                        onChange={(e) => {
                          setManualAddress(e.target.value);
                          if (manualAddressError) setManualAddressError("");
                        }}
                        placeholder="0x... or vitalik.eth"
                        className="w-full h-12 px-4 bg-[#111318] border border-white/[0.08] hover:border-white/18 focus:border-panik-orange/50 focus:ring-1 focus:ring-panik-orange/20 text-[#F0F4FF] placeholder-white/25 text-sm font-mono rounded-lg outline-none transition-all duration-300"
                        required
                        disabled={connectingWallet !== null}
                      />
                    </div>
                    {manualAddressError && (
                      <p className="text-red-400 text-xs font-mono mt-2.5 flex items-center gap-1.5 animate-fadeIn">
                        <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                        <span>{manualAddressError}</span>
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={!manualAddress || connectingWallet !== null}
                    className="w-full h-12 bg-panik-orange hover:bg-panik-orange/90 disabled:opacity-50 disabled:hover:bg-panik-orange text-white font-mono text-xs uppercase tracking-wider font-semibold rounded-lg flex items-center justify-center gap-2 cursor-pointer transition-all duration-300 shadow-lg shadow-orange-500/5 active:scale-[0.99]"
                  >
                    <span>Confirm Manual Address</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                /* Simulated wallet selection grid */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-4">
                  <button
                    type="button"
                    disabled={connectingWallet !== null}
                    onClick={() => handleWalletClick("MetaMask")}
                    className={`p-4 flex items-center bg-[#111318] hover:bg-[#151821] border text-left rounded-xl transition-all duration-200 select-none ${
                      connectingWallet === "MetaMask"
                        ? "border-panik-orange bg-panik-orange/[0.02]"
                        : "border-white/[0.06] hover:border-white/[0.15]"
                    } disabled:opacity-60`}
                  >
                    <MetaMaskLogo />
                    <div className="flex-1">
                      <span className="block text-white text-sm font-sans font-semibold">MetaMask</span>
                      <span className="text-[10px] font-mono text-white/40 uppercase">EVM Wallet</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={connectingWallet !== null}
                    onClick={() => handleWalletClick("Coinbase Wallet")}
                    className={`p-4 flex items-center bg-[#111318] hover:bg-[#151821] border text-left rounded-xl transition-all duration-200 select-none ${
                      connectingWallet === "Coinbase Wallet"
                        ? "border-panik-orange bg-panik-orange/[0.02]"
                        : "border-white/[0.06] hover:border-white/[0.15]"
                    } disabled:opacity-60`}
                  >
                    <CoinbaseLogo />
                    <div className="flex-1">
                      <span className="block text-white text-sm font-sans font-semibold">Coinbase Wallet</span>
                      <span className="text-[10px] font-mono text-white/40 uppercase">Coinbase SDK</span>
                    </div>
                  </button>
                </div>
              )}

              {/* Manually connect wallet toggle link */}
              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowManualInput(!showManualInput);
                    setManualAddressError("");
                  }}
                  disabled={connectingWallet !== null}
                  className="text-xs font-mono text-panik-orange hover:text-panik-orange/80 tracking-wider pb-0.5 border-b border-transparent hover:border-panik-orange/30 transition-all duration-200 uppercase flex items-center justify-center gap-1.5 mx-auto cursor-pointer"
                >
                  <span>{showManualInput ? "Choose standard wallet connect" : "enter your wallet address"}</span>
                </button>
              </div>

              {/* Feedback loader indicators */}
              {connectingWallet && (
                <div className="py-2.5 flex items-center justify-center gap-3 bg-panik-orange/[0.04] border border-panik-orange/20 rounded-lg text-xs font-mono text-panik-orange animate-pulse">
                  <div className="w-3.5 h-3.5 border-2 border-panik-orange border-t-transparent rounded-full animate-spin" />
                  <span>
                    {connectingWallet === "Manual Input"
                      ? "Verifying manual wallet address..."
                      : `Connecting Ledger Signatures with ${connectingWallet}...`}
                  </span>
                </div>
              )}

              {/* Informative advice banner */}
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] flex gap-3 text-xs text-white/50 leading-relaxed font-sans">
                <Info className="w-5 h-5 text-white/30 shrink-0 mt-0.5" />
                <p>
                  Connecting a wallet does NOT grant access today. It simply reserves eligibility for future beta releases. Your funds remain under your control. No transactions are required.
                </p>
              </div>
            </motion.div>
          )}

          {/* STEP 5: SUCCESS SCREEN */}
          {step === 5 && (
            <motion.div
              key="step5"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="py-4 text-center space-y-6"
            >
              {/* Compass symbol rotating styled illustration */}
              <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
                <div className="absolute inset-0 bg-emerald-500/10 rounded-full blur-xl scale-125 select-none" />
                <div className="w-16 h-16 rounded-full border-2 border-emerald-500/30 bg-[#0E1016] flex items-center justify-center relative z-10 select-none">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 stroke-[2px]" />
                </div>
              </div>

              {/* Header */}
              <div className="space-y-2">
                <h2 className="font-display font-medium text-2xl sm:text-3xl text-white tracking-tight">
                  You're on the list.
                </h2>
                <p className="text-panik-text-secondary text-sm max-w-sm mx-auto leading-relaxed">
                  We'll contact you when Panik enters beta and when new testing opportunities become available.
                </p>
              </div>

              {/* Checklists status layout */}
              <div className="max-w-xs mx-auto text-left bg-white/[0.02] border border-white/[0.05] rounded-xl p-4.5 space-y-2.5 font-sans text-xs">
                <div className="flex items-center gap-2.5 text-white/80">
                  <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[9px]">✓</span>
                  <span>Email registered ({email})</span>
                </div>
                <div className="flex items-center gap-2.5 text-white/80">
                  <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[9px]">✓</span>
                  <span>Risk Profile indicators submitted</span>
                </div>
                <div className="flex items-center gap-2.5 text-white/80">
                  <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[9px]">✓</span>
                  <span>
                    {connectedWallet 
                      ? `Beta access reserved (${connectedWallet})` 
                      : "Beta eligibility status queued"}
                  </span>
                </div>
              </div>

              {/* Social Channels CTA buttons */}
              <div className="space-y-3 pt-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full h-11 bg-white/[0.04] hover:bg-white/[0.08] text-white border border-white/[0.08] hover:border-white/[0.15] font-mono text-xs uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                >
                  Return to Site
                </button>

                <div className="grid grid-cols-2 gap-3">
                  <a
                    href="https://twitter.com"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="h-10 px-4 bg-white/[0.02] hover:bg-white/[0.06] text-white border border-white/[0.05] hover:border-white/[0.12] font-mono text-[10px] uppercase tracking-wider rounded-lg flex items-center justify-center gap-2 transition-colors"
                  >
                    <Twitter className="w-3.5 h-3.5 fill-current" />
                    <span>Follow on X</span>
                  </a>

                  <a
                    href="https://discord.com"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="h-10 px-4 bg-white/[0.02] hover:bg-white/[0.06] text-[#5865F2] hover:text-[#5865F2]/90 border border-white/[0.05] hover:border-white/[0.12] font-mono text-[10px] uppercase tracking-wider rounded-lg flex items-center justify-center gap-2 transition-colors"
                  >
                    <span>Join Discord</span>
                  </a>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
