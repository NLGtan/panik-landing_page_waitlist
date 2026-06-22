/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { ArrowRight, CheckCircle2, ShieldAlert, CircleDot, UserCheck, Calendar } from "lucide-react";
import { motion } from "motion/react";
import { WaitlistEntry } from "../types";
import { ScrollReveal } from "./ScrollReveal";

interface WaitlistCTAProps {
  subscribersList: WaitlistEntry[];
  hasSubscribed: boolean;
  onOpenWaitlistModal: (initialEmail?: string) => void;
}

const formatSubscriberIdentity = (identity: string) => {
  if (!identity) return "";
  const cleaned = identity.trim();
  
  // Wallet Address (starts with 0x and is hex)
  if (cleaned.startsWith("0x") && cleaned.length >= 10) {
    return `${cleaned.substring(0, 6)}...${cleaned.substring(cleaned.length - 4)}`;
  }
  
  // ENS Domain (.eth)
  if (cleaned.toLowerCase().endsWith(".eth")) {
    const namePart = cleaned.slice(0, -4);
    if (namePart.length <= 4) {
      return `${namePart}***.eth`;
    }
    return `${namePart.substring(0, 3)}***${namePart.substring(namePart.length - 2)}.eth`;
  }

  // Email masking (GDPR Compliant)
  if (cleaned.includes("@")) {
    const [user, domain] = cleaned.split("@");
    const maskedUser = user.length > 3 ? `${user.substring(0, 3)}***` : `${user[0]}***`;
    return `${maskedUser}@${domain}`;
  }
  
  return cleaned.length > 8 ? `${cleaned.substring(0, 4)}...` : cleaned;
};

export function WaitlistCTA({ subscribersList, hasSubscribed, onOpenWaitlistModal }: WaitlistCTAProps) {
  return (
    <section id="waitlist-form" className="relative py-32 px-6 overflow-hidden">
      
      {/* Premium Warm background gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-panik-orange/[0.035] to-transparent pointer-events-none"></div>
      
      {/* Dot matrix */}
      <div className="absolute inset-0 panik-dot-bg opacity-30 pointer-events-none"></div>


      <div className="max-w-4xl mx-auto relative z-10 text-center">

        {/* COMPASS SHAPE (Left Side, Overlapping Card Edge) */}
        <motion.div
          className="absolute left-[-80px] sm:left-[-100px] md:left-[-120px] lg:left-[-145px] xl:left-[-165px] top-[40%] -translate-y-1/2 w-[165px] sm:w-[210px] md:w-[240px] lg:w-[270px] xl:w-[300px] aspect-square pointer-events-none select-none z-20"
          initial={{ opacity: 0.92 }}
          animate={{
            y: ["-54%", "-46%", "-54%"],
            opacity: [0.9, 1.0, 0.9],
          }}
          transition={{
            duration: 9.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          {/* Rich Ambient Radial Glow */}
          <div className="absolute inset-0 bg-gradient-to-tr from-[#7C3AED]/40 via-[#4F46E5]/25 to-transparent rounded-full blur-[35px] sm:blur-[45px] md:blur-[60px]"></div>
          
          <svg
            viewBox="0 0 300 300"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full drop-shadow-[0_0_30px_rgba(124,58,237,0.45)]"
          >
            <defs>
              <linearGradient id="compassBaseGrad" x1="0" y1="0" x2="300" y2="300" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#1E1B4B" stopOpacity="0.85" />
              </linearGradient>
              <linearGradient id="compassStrokeGrad" x1="0" y1="150" x2="300" y2="150" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#8B5CF6" stopOpacity="1" />
                <stop offset="100%" stopColor="#6366F1" stopOpacity="0.9" />
              </linearGradient>
              <linearGradient id="pointerGrad" x1="150" y1="150" x2="260" y2="150" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#00E5C4" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#00E5C4" stopOpacity="1" />
              </linearGradient>
            </defs>

            {/* Inner aesthetic alignment grid */}
            <circle cx="150" cy="150" r="130" stroke="white" strokeOpacity="0.05" strokeDasharray="3 3" />
            <circle cx="150" cy="150" r="100" stroke="white" strokeOpacity="0.06" />

            {/* Semicircle */}
            <path
              d="M 50,150 A 100,100 0 0,1 250,150 Z"
              fill="url(#compassBaseGrad)"
              stroke="url(#compassStrokeGrad)"
              strokeWidth="2.5"
              className="backdrop-blur-[3px]"
            />
            
            {/* Horizontal timeline chord line */}
            <line x1="50" y1="150" x2="250" y2="150" stroke="url(#compassStrokeGrad)" strokeWidth="2" strokeOpacity="0.85" />

            {/* Animated Needle Pointer */}
            <motion.g
              animate={{
                rotate: [-5, 11, -5],
              }}
              transition={{
                duration: 7,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              style={{
                originX: "150px",
                originY: "150px",
              }}
            >
              {/* Triangular Pointer/needle */}
              <path
                d="M 150,142 L 245,150 L 150,158 L 140,150 Z"
                fill="url(#pointerGrad)"
                stroke="#00E5C4"
                strokeWidth="25"
                strokeLinejoin="round"
                style={{ filter: "drop-shadow(0 0 10px rgba(0, 229, 196, 0.7))" }}
              />
              <circle cx="150" cy="150" r="8" fill="#00E5C4" stroke="#0E1015" strokeWidth="2.5" />
            </motion.g>

            {/* Subtle external tick marks for tech design authenticity */}
            <line x1="150" y1="35" x2="150" y2="45" stroke="white" strokeOpacity="0.4" strokeWidth="2.5" />
            <line x1="150" y1="255" x2="150" y2="265" stroke="white" strokeOpacity="0.3" strokeWidth="2" />
            <line x1="35" y1="150" x2="45" y2="150" stroke="white" strokeOpacity="0.3" strokeWidth="2" />
            <line x1="255" y1="150" x2="265" y2="150" stroke="white" strokeOpacity="0.3" strokeWidth="2" />
          </svg>
        </motion.div>

        {/* WATCH SHAPE (Right Side, Overlapping Card Edge) */}
        <motion.div
          className="absolute right-[-80px] sm:right-[-100px] md:right-[-120px] lg:right-[-145px] xl:right-[-165px] top-[40%] -translate-y-1/2 w-[165px] sm:w-[210px] md:w-[240px] lg:w-[270px] xl:w-[300px] aspect-square pointer-events-none select-none z-20"
          initial={{ opacity: 0.92 }}
          animate={{
            x: [-8, 8, -8],
            y: ["-47%", "-53%", "-47%"],
            opacity: [0.9, 1.0, 0.9],
          }}
          transition={{
            duration: 9.0,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          {/* Rich Ambient Radial Glow */}
          <div className="absolute inset-0 bg-gradient-to-tr from-[#2563EB]/30 via-[#00D9FF]/22 to-transparent rounded-full blur-[35px] sm:blur-[45px] md:blur-[60px]"></div>

          <svg
            viewBox="0 0 300 300"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full drop-shadow-[0_0_30px_rgba(37,99,235,0.45)]"
          >
            <defs>
              <linearGradient id="eyeEyelidGrad" x1="30" y1="150" x2="270" y2="150" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity="1" />
                <stop offset="50%" stopColor="#00E5FF" stopOpacity="1" />
                <stop offset="100%" stopColor="#1D4ED8" stopOpacity="1" />
              </linearGradient>
              <linearGradient id="irisGrad" x1="150" y1="100" x2="150" y2="200" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#00E5FF" stopOpacity="1" />
                <stop offset="100%" stopColor="#1E40AF" stopOpacity="0.75" />
              </linearGradient>
              <radialGradient id="pupilGrad" cx="150" cy="151" r="25" fx="138" fy="138" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#00E5FF" />
                <stop offset="45%" stopColor="#2563EB" />
                <stop offset="100%" stopColor="#0C0E14" />
              </radialGradient>
            </defs>

            {/* Outer Echoing Tech Rings */}
            <circle cx="150" cy="151" r="125" stroke="white" strokeOpacity="0.05" strokeWidth="1" />
            <circle cx="150" cy="151" r="105" stroke="white" strokeOpacity="0.07" strokeDasharray="5 4" />

            {/* Eyelids combined shape */}
            <path
              d="M 30,151 C 80,75 220,75 270,151 C 220,227 80,227 30,151 Z"
              fill="rgba(13, 17, 28, 0.85)"
              stroke="url(#eyeEyelidGrad)"
              strokeWidth="2.5"
              className="backdrop-blur-[3px]"
            />

            {/* Inner Iris group with pulse scale */}
            <motion.g
              animate={{
                scale: [0.96, 1.04, 0.96],
              }}
              transition={{
                duration: 6.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              style={{
                originX: "150px",
                originY: "151px",
              }}
            >
              <circle
                cx="150"
                cy="151"
                r="46"
                fill="url(#irisGrad)"
                stroke="#00D9FF"
                strokeWidth="2"
                strokeOpacity="0.9"
                style={{ filter: "drop-shadow(0 0 12px rgba(0, 229, 255, 0.6))" }}
              />

              {/* Smaller pupil */}
              <circle
                cx="150"
                cy="151"
                r="20"
                fill="url(#pupilGrad)"
                stroke="rgba(0, 217, 255, 0.95)"
                strokeWidth="1.5"
              />
              
              {/* Highlight dot for three dimensionality */}
              <circle cx="139" cy="140" r="3.5" fill="white" fillOpacity="0.95" />
            </motion.g>

            {/* Abstract Tech Compass-like radar ticks around the eye */}
            <path d="M 150,60 L 150,70" stroke="#00D9FF" strokeOpacity="0.75" strokeWidth="1.5" />
            <path d="M 150,232 L 150,242" stroke="#2563EB" strokeOpacity="0.75" strokeWidth="1.5" />
            <path d="M 60,151 L 70,151" stroke="#2563EB" strokeOpacity="0.75" strokeWidth="1.5" />
            <path d="M 230,151 L 240,151" stroke="#00D9FF" strokeOpacity="0.75" strokeWidth="1.5" />
          </svg>
        </motion.div>

        {/* Main CTA structure */}
        <ScrollReveal className="panik-glass p-8 sm:p-14 lg:p-16 rounded-3xl border border-white/[0.08] bg-[#111318]/60 relative overflow-hidden z-10" id="cta-inner-block" duration={0.65}>
          
          {/* Accent lighting in background */}
          <div className="absolute -bottom-24 left-1/2 -translate-x-1/2 w-80 h-80 bg-panik-orange/15 rounded-full blur-3xl pointer-events-none"></div>

          <h2 className="font-display font-bold text-3xl sm:text-5xl tracking-tight leading-tight text-[#F0F4FF] mb-5">
            Apply for Early Access
          </h2>

          <p className="text-panik-text-secondary text-sm sm:text-base max-w-2xl mx-auto mb-12 leading-relaxed">
            Get first access to Compass, Watch, and Advisor before public launch. Help us shape the future of DeFi risk management.
          </p>

          {/* Onboarding Trigger Button Area */}
          <div className="max-w-md mx-auto mb-10 py-2">
            {hasSubscribed ? (
              <div className="p-6 rounded-xl bg-orange-500/5 border border-panik-orange/30 backdrop-blur-md flex gap-4 items-center justify-start text-left animate-fade-in" id="bottom-form-success">
                <div className="w-10 h-10 rounded-full bg-panik-orange/20 border border-panik-orange/40 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-6 h-6 text-panik-orange" />
                </div>
                <div>
                  <h3 className="font-mono text-xs tracking-wider uppercase text-panik-orange font-semibold">ACCESS GRANTED // SLOT IMMINENT</h3>
                  <p className="text-xs text-panik-text-secondary mt-0.5">
                    You're in. We'll reach out directly when beta opens for your cohort.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => onOpenWaitlistModal()}
                  className="w-full sm:w-auto h-14 px-10 bg-panik-orange hover:bg-panik-orange/90 text-white font-mono text-sm uppercase tracking-wider font-bold rounded-lg flex items-center justify-center gap-3 cursor-pointer transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] panik-glow-orange shrink-0 shadow-xl shadow-orange-500/20"
                  id="bottom-btn-submit"
                >
                  <span>JOIN THE WAITLIST →</span>
                </button>
              </div>
            )}
          </div>

        </ScrollReveal>

      </div>
    </section>
  );
}
