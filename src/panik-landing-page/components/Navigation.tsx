/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { ShieldAlert, Crosshair, ChevronDown, ChevronRight, Compass, Eye, Zap, Shield, Menu, X } from "lucide-react";
import { PanikLogoMark } from "./PanikLogo";

interface NavigationProps {
  onScrollTo: (sectionId: string) => void;
  subscriberCount: number;
  onOpenWaitlistModal: () => void;
  hasSubscribed?: boolean;
}

export function Navigation({ onScrollTo, subscriberCount, onOpenWaitlistModal, hasSubscribed = false }: NavigationProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 h-20 bg-[#09090B]/80 backdrop-blur-xl border-b border-white/[0.06] transition-all duration-300">
        <div className="max-w-7xl mx-auto h-full px-6 flex items-center justify-between">
          
          {/* Logo Brand */}
          <div 
            onClick={() => onScrollTo("hero")} 
            className="flex items-center gap-3 cursor-pointer group"
            id="nav-logo-container"
          >
            <PanikLogoMark size={32} />
            <span className="font-display font-medium text-lg tracking-[0.1em] text-[#F8FAFC] group-hover:text-white transition-colors uppercase">
              PANIK
            </span>
          </div>

          {/* Center Links (Desktop) */}
          <div className="hidden md:flex items-center gap-7 text-[11px] font-mono tracking-wider text-panik-text-secondary select-none">
            
            {/* Products Dropdown (Aave style) */}
            <div className="relative group py-5">
              <button className="flex items-center gap-1.5 hover:text-[#F8FAFC] transition-colors cursor-pointer uppercase font-medium">
                <span>Products</span>
                <ChevronDown className="w-3.5 h-3.5 opacity-60 group-hover:rotate-180 transition-transform duration-300" />
              </button>
              
              {/* Dropdown Panel */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 w-80 bg-[#111318] border border-white/[0.08] rounded-xl p-4.5 shadow-2xl opacity-0 translate-y-2 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto transition-all duration-300 z-50 backdrop-blur-xl">
                <span className="block text-[8px] font-mono text-white/40 tracking-widest uppercase mb-3">PANIK SUITE</span>
                <div className="space-y-4">
                  <div className="group/item cursor-pointer" onClick={() => onScrollTo("how-it-works")}>
                    <div className="flex items-center gap-2 text-white font-sans text-xs font-semibold group-hover/item:text-panik-orange transition-colors">
                      <Compass className="w-3.5 h-3.5 text-panik-orange" />
                      <span>Compass</span>
                    </div>
                    <span className="block text-[10.5px] text-panik-text-secondary mt-0.5 font-sans leading-normal">Surfaces calibrated risk profiles before you commit capital.</span>
                  </div>
                  
                  <div className="group/item cursor-pointer" onClick={() => onScrollTo("scoring")}>
                    <div className="flex items-center gap-2 text-white font-sans text-xs font-semibold group-hover/item:text-panik-orange transition-colors">
                      <Eye className="w-3.5 h-3.5 text-panik-orange" />
                      <span>Watch</span>
                    </div>
                    <span className="block text-[10.5px] text-panik-text-secondary mt-0.5 font-sans leading-normal">Continuous 60-second auditing on live collateral pools.</span>
                  </div>

                  <div className="group/item cursor-pointer" onClick={() => onScrollTo("how-it-works")}>
                    <div className="flex items-center gap-2 text-white font-sans text-xs font-semibold group-hover/item:text-panik-orange transition-colors">
                      <Zap className="w-3.5 h-3.5 text-panik-orange" />
                      <span>Advisor</span>
                    </div>
                    <span className="block text-[10.5px] text-panik-text-secondary mt-0.5 font-sans leading-normal">Plain-language recommendations with precise transaction costs.</span>
                  </div>
                </div>
              </div>
            </div>

            <span className="text-white/5 select-none">•</span>
            
            <button 
              onClick={() => onScrollTo("how-it-works")} 
              className="hover:text-[#F8FAFC] transition-colors cursor-pointer uppercase font-medium"
              id="btn-nav-how-it-works"
            >
              How it works
            </button>
            
            <span className="text-white/5 select-none">•</span>

            <button
              onClick={() => onScrollTo("faq")}
              className="hover:text-[#F8FAFC] transition-colors cursor-pointer uppercase font-medium"
              id="btn-nav-faq"
            >
              FAQ
            </button>
          </div>

          {/* Right Area (Desktop) — persistent CTA */}
          <div className="hidden md:flex items-center gap-4">
            {!hasSubscribed && (
              <button
                type="button"
                onClick={onOpenWaitlistModal}
                className="h-9 px-5 bg-panik-orange hover:bg-panik-orange/90 text-white font-mono text-[11px] uppercase tracking-wider font-semibold rounded-lg flex items-center gap-2 transition-all duration-300 cursor-pointer shadow-md shadow-orange-500/20"
              >
                JOIN WAITLIST →
              </button>
            )}
          </div>

          {/* Hamburger Menu (Mobile Toggle) */}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)} 
            className="md:hidden p-2 text-panik-text-secondary hover:text-white transition-colors"
            id="btn-mobile-menu-toggle"
            aria-label="Toggle Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

        </div>
      </nav>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 top-20 z-45 bg-[#09090B] md:hidden border-t border-white/[0.05] p-6 flex flex-col justify-between">
          <div className="space-y-6 pt-4">
            {!hasSubscribed && (
              <button
                type="button"
                onClick={() => { onOpenWaitlistModal(); setMobileMenuOpen(false); }}
                className="w-full h-12 bg-panik-orange hover:bg-panik-orange/90 text-white font-mono text-xs uppercase tracking-wider font-semibold rounded-lg flex items-center justify-center gap-2 transition-all duration-300 cursor-pointer shadow-lg shadow-orange-500/20"
              >
                JOIN WAITLIST →
              </button>
            )}
            <button 
              onClick={() => {
                onScrollTo("how-it-works");
                setMobileMenuOpen(false);
              }}
              className="block w-full text-left text-sm font-mono text-panik-text-primary hover:text-panik-orange transition-colors"
            >
              01 // HOW IT WORKS
            </button>
            <button 
              onClick={() => {
                onScrollTo("scoring");
                setMobileMenuOpen(false);
              }}
              className="block w-full text-left text-sm font-mono text-panik-text-primary hover:text-panik-orange transition-colors"
            >
              02 // SCORING ENGINE
            </button>
            <button
              onClick={() => {
                onScrollTo("faq");
                setMobileMenuOpen(false);
              }}
              className="block w-full text-left text-sm font-mono text-panik-text-primary hover:text-panik-orange transition-colors"
            >
              03 // FREQUENTLY ASKED QUESTIONS
            </button>
          </div>
        </div>
      )}
    </>
  );
}
