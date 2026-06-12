/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { ShieldAlert, BookOpen, Twitter, Github, Globe } from "lucide-react";

interface FooterProps {
  onScrollTo: (sectionId: string) => void;
}

export function Footer({ onScrollTo }: FooterProps) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[#0A0A0B] border-t border-white/[0.05] py-16 px-6 relative overflow-hidden">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8 relative z-10">
        
        {/* Left footer: logo and subtitle */}
        <div className="flex flex-col items-center md:items-start text-center md:text-left">
          <div 
            onClick={() => onScrollTo("hero")}
            className="flex items-center gap-2.5 cursor-pointer group mb-3"
            id="footer-brand-container"
          >
            <ShieldAlert className="w-5 h-5 text-panik-orange" />
            <span className="font-display font-bold text-lg tracking-wider text-[#F0F4FF] group-hover:text-white transition-colors">
              PANIK
            </span>
          </div>
          <p className="text-xs text-panik-text-secondary font-mono max-w-sm leading-relaxed">
            DeFi risk intelligence layer. Your positions, fully automated and protected against systemic liquidation vectors.
          </p>
        </div>

        {/* Center footer: navigation */}
        <div className="flex flex-wrap items-center justify-center gap-8 text-[11px] font-mono tracking-wider text-panik-text-secondary">
          <button 
            type="button"
            onClick={() => onScrollTo("how-it-works")} 
            className="hover:text-white uppercase transition-colors py-1 cursor-pointer"
          >
            Mechanism
          </button>
          <button 
            type="button"
            onClick={() => onScrollTo("scoring")} 
            className="hover:text-white uppercase transition-colors py-1 cursor-pointer"
          >
            Risk Scoring
          </button>
          <button 
            type="button"
            onClick={() => onScrollTo("protocols")} 
            className="hover:text-white uppercase transition-colors py-1 cursor-pointer"
          >
            Verified Chains
          </button>
          <button 
            type="button"
            onClick={() => onScrollTo("faq")} 
            className="hover:text-white uppercase transition-colors py-1 cursor-pointer"
          >
            FAQ
          </button>
          <span className="text-white/10 hidden sm:inline">•</span>
          <span className="flex items-center gap-1.5 text-panik-orange bg-panik-orange/10 border border-panik-orange/20 px-2.5 py-0.5 rounded text-[9px] font-bold">
            BUILT ON BASE
          </span>
        </div>

        {/* Right footer: socials */}
        <div className="flex items-center gap-4">
          <a 
            href="https://twitter.com" 
            target="_blank" 
            rel="noreferrer referrer" 
            className="w-8 h-8 rounded-lg bg-white/[0.01] border border-white/[0.06] flex items-center justify-center hover:border-panik-orange hover:text-panik-orange transition-colors"
            aria-label="Twitter Profile"
          >
            <Twitter className="w-4 h-4" />
          </a>
          <a 
            href="https://github.com" 
            target="_blank" 
            rel="noreferrer referrer" 
            className="w-8 h-8 rounded-lg bg-white/[0.01] border border-white/[0.06] flex items-center justify-center hover:border-panik-orange hover:text-panik-orange transition-colors"
            aria-label="Github Profile"
          >
            <Github className="w-4 h-4" />
          </a>
          <a 
            href="https://discord.com" 
            target="_blank" 
            rel="noreferrer referrer" 
            className="w-8 h-8 rounded-lg bg-white/[0.01] border border-white/[0.06] flex items-center justify-center hover:border-panik-orange hover:text-panik-orange transition-colors"
            aria-label="Discord Server"
          >
            <svg className="w-4 h-4" viewBox="0 0 127.14 96.36" fill="currentColor">
              <path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,52.8,6.83,77.19,77.19,0,0,0,49.5,0,105.15,105.15,0,0,0,19.06,8.07C2.75,32.41-1.72,56.12,.48,79.43A105.11,105.11,0,0,0,31.42,96.36a77.7,77.7,0,0,0,6.63-10.85,67.43,67.43,0,0,1-10.5-5c1-.73,2-1.5,2.94-2.3a75.16,75.16,0,0,0,66,0c.93,.8,1.91,1.57,2.93,2.3a67.8,67.8,0,0,1-10.5,5,78,78,0,0,0,6.63,10.85,105.11,105.11,0,0,0,31-16.93C129.24,51.84,124.3,28.37,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.83,46,53.83,53,48.74,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.24,60,73.24,53S78.41,40.36,84.69,40.36,96.07,46,96.07,53,91,65.69,84.69,65.69Z" />
            </svg>
          </a>
          <a 
            href="https://farcaster.xyz" 
            target="_blank" 
            rel="noreferrer referrer" 
            className="w-8 h-8 rounded-lg bg-white/[0.01] border border-white/[0.06] flex items-center justify-center hover:border-panik-orange hover:text-panik-orange transition-colors"
            aria-label="Farcaster Profile"
          >
            <Globe className="w-4 h-4" />
          </a>
        </div>

      </div>

      {/* Disclaimers & Copyright bar */}
      <div className="max-w-7xl mx-auto mt-12 pt-6 border-t border-white/[0.03] flex flex-col sm:flex-row justify-between items-center gap-4 text-[10px] font-mono text-panik-text-secondary">
        <div>
          © {currentYear} PANIK Intelligence. All rights reserved. Registered Sandbox Cohort.
        </div>
        <div className="text-center sm:text-right max-w-lg leading-normal">
          DISCLAIMER: PANIK is a non-custodial telemetry software provider. All actions, calculations, recommendation outputs, and simulations are educational, not financial advice. Capital locked in decentralized consensus layers remains susceptible to smart-contract failure.
        </div>
      </div>
    </footer>
  );
}
