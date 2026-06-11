/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { BASE_PROTOCOLS } from "../data";
import { ShieldCheck, Award, FileSpreadsheet, Percent, HelpCircle } from "lucide-react";
import { ScrollReveal } from "./ScrollReveal";

export function ProtocolCoverage() {
  return (
    <section id="protocols" className="relative py-28 px-6 bg-[#0A0A0B] overflow-hidden">
      
      {/* Visual glowing layout */}
      <div className="absolute top-1/2 left-0 w-[500px] h-[500px] bg-gradient-to-r from-panik-orange/[0.01] to-transparent rounded-full blur-3xl pointer-events-none"></div>

      <div className="max-w-7xl mx-auto relative z-10">
        
        {/* Section Header */}
        <ScrollReveal duration={0.6}>
          <div className="max-w-3xl mb-16 text-left" id="protocols-header">
            <span className="text-[10px] sm:text-xs font-mono font-bold text-panik-orange tracking-widest uppercase bg-panik-orange/10 px-3 py-1 rounded-full border border-panik-orange/20 inline-block">
              ECOSYSTEM INTEGRATIONS
            </span>
            <h2 className="font-display font-bold text-4xl sm:text-5xl tracking-tight leading-tight text-[#F0F4FF] mt-4 mb-4">
              Built for Base.<br />
              <span className="font-semibold text-panik-text-secondary">Starting with the two protocols that matter.</span>
            </h2>
            <p className="text-panik-text-secondary text-sm sm:text-base max-w-xl">
              We don't inflate statistics integrating experimental forks. PANIK operates deep indexing nodes dedicated strictly to the top liquidity channels on the L2.
            </p>
          </div>
        </ScrollReveal>

        {/* Side by side cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8" id="protocols-grid">
          {BASE_PROTOCOLS.map((proto, idx) => (
            <ScrollReveal 
              key={proto.name}
              delay={idx * 0.15}
              duration={0.5}
              yOffset={25}
              className="panik-glass p-8 rounded-2xl relative overflow-hidden flex flex-col justify-between h-full"
              id={`protocol-card-${proto.name.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {/* Highlight gradient bar representing status */}
              <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${
                proto.name === "Aave V3" 
                  ? "from-emerald-500/50 via-emerald-500/10 to-transparent" 
                  : "from-panik-orange/50 via-panik-orange/10 to-transparent"
              }`}></div>

              <div>
                {/* Protocol Card Top Row */}
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <span className="text-[10px] font-mono text-panik-text-secondary tracking-widest uppercase block">
                      DEFI STANDARD
                    </span>
                    <h3 className="font-display font-bold text-2xl text-[#F0F4FF] mt-1">
                      {proto.name}
                    </h3>
                  </div>

                  <span className={`text-[9px] font-mono font-bold tracking-widest uppercase px-2 py-0.5 rounded ${
                    proto.badge === "Blue-Chip" 
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                      : "bg-panik-orange/10 text-panik-orange border border-panik-orange/20"
                  }`}>
                    {proto.badge}
                  </span>
                </div>

                {/* Narrative description */}
                <p className="text-sm text-panik-text-secondary leading-relaxed mb-8">
                  {proto.description}
                </p>

                {/* Detailed statistics metrics grid */}
                <div className="grid grid-cols-2 gap-4 mb-8">
                  {/* Metric 1 */}
                  <div className="p-4 bg-[#0A0D14]/60 border border-white/[0.04] rounded-xl flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-white/[0.02] border border-white/[0.08] flex items-center justify-center shrink-0">
                      <Percent className="w-4 h-4 text-panik-orange" />
                    </div>
                    <div>
                      <span className="block text-[9px] font-mono text-panik-text-secondary uppercase">TVL Depth</span>
                      <span className="text-sm font-mono font-bold text-[#F0F4FF]">{proto.tvl}</span>
                    </div>
                  </div>

                  {/* Metric 2 */}
                  <div className="p-4 bg-[#0A0D14]/60 border border-white/[0.04] rounded-xl flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-white/[0.02] border border-white/[0.08] flex items-center justify-center shrink-0">
                      <ShieldCheck className="w-4 h-4 text-panik-orange" />
                    </div>
                    <div>
                      <span className="block text-[9px] font-mono text-panik-text-secondary uppercase">SEC AUDITS</span>
                      <span className="text-sm font-mono font-bold text-[#F0F4FF]">{proto.auditCount} Verified</span>
                    </div>
                  </div>

                  {/* Metric 3 */}
                  <div className="p-4 bg-[#0A0D14]/60 border border-white/[0.04] rounded-xl flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-white/[0.02] border border-white/[0.08] flex items-center justify-center shrink-0">
                      <FileSpreadsheet className="w-4 h-4 text-panik-orange" />
                    </div>
                    <div>
                      <span className="block text-[9px] font-mono text-panik-text-secondary uppercase">Base Share</span>
                      <span className="text-sm font-mono font-bold text-[#F0F4FF]">{proto.marketShare}</span>
                    </div>
                  </div>

                  {/* Metric 4 */}
                  <div className="p-4 bg-[#0A0D14]/60 border border-white/[0.04] rounded-xl flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-white/[0.02] border border-white/[0.08] flex items-center justify-center shrink-0">
                      <Award className="w-4 h-4 text-panik-orange" />
                    </div>
                    <div>
                      <span className="block text-[9px] font-mono text-panik-text-secondary uppercase">Vulnerability rating</span>
                      <span className="text-sm font-mono font-bold text-emerald-400">Class A</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Exploit History Note */}
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] text-xs font-mono text-panik-text-secondary">
                <span className="text-white block font-semibold text-[10px] uppercase mb-1">AUDIT SUMMARY:</span>
                {proto.exploitHistory}
              </div>

            </ScrollReveal>
          ))}
        </div>

      </div>
    </section>
  );
}
