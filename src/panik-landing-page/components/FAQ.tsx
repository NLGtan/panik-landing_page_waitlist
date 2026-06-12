/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, HelpCircle, ShieldAlert, Sparkles, AlertCircle, Cpu } from "lucide-react";
import { ScrollReveal } from "./ScrollReveal";

interface FAQItem {
  id: string;
  question: string;
  answer: React.ReactNode;
  category: "GENERAL" | "RISK ENGINE" | "SECURITY";
}

export function FAQ() {
  const [activeId, setActiveId] = useState<string | null>("panik-what-is");

  const faqs: FAQItem[] = [
    {
      id: "panik-what-is",
      category: "GENERAL",
      question: "What is Panik and how does it protect my assets?",
      answer: "Panik is a non-custodial DeFi risk management layer. It continuously scores your open positions against your personal risk tolerance, tells you when something needs attention, and surfaces a specific recommendation when action is required.",
    },
    {
      id: "panik-scoring",
      category: "RISK ENGINE",
      question: "What are the three levels of the Panik Risk Score?",
      answer: (
        <>
          <span style={{ color: "#F8FAFC", fontWeight: 500 }}>Protocol Score</span> evaluates how safe a protocol is: audit history, exploit track record, and governance stability. <span style={{ color: "#F8FAFC", fontWeight: 500 }}>Pool Score</span> monitors the specific pool you are in: utilization, oracle reliability, and withdrawal accessibility. <span style={{ color: "#F8FAFC", fontWeight: 500 }}>Position Score</span> tracks your individual position: health factor, liquidation distance, and collateral strength. All three combine into one unified score matched to your risk profile.
        </>
      ),
    },
    {
      id: "panik-custody",
      category: "SECURITY",
      question: "Is Panik a custodial service? Do you hold my private keys?",
      answer: "No. Panik is fully non-custodial. Your positions live in your own wallet on-chain. Panik's smart contract calls protocols directly on your behalf. You sign every transaction. We never hold your funds or your keys.",
    },
    {
      id: "panik-advisor",
      category: "RISK ENGINE",
      question: "What does Advisor actually do?",
      answer: "Advisor fires when a position crosses your risk threshold. It tells you what happened, why it matters for your specific position, and exactly what to do, backed by live on-chain data. You make the final call.",
    },
  ];

  const toggleItem = (id: string) => {
    setActiveId(prevId => (prevId === id ? null : id));
  };

  return (
    <section id="faq" className="relative py-28 px-6 bg-[#0A0A0B] overflow-hidden border-t border-white/[0.04]">
      {/* Absolute Ambient Background Radial Glow behind Accordion */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-panik-orange/[0.02] via-[#2563EB]/[0.01] to-transparent rounded-full blur-[120px] pointer-events-none"></div>

      <div className="max-w-4xl mx-auto relative z-10">
        
        {/* Header Section */}
        <ScrollReveal duration={0.6}>
          <div className="text-center mb-16">
            <h2 className="font-display font-medium text-4xl sm:text-5xl tracking-tight leading-tight text-[#F8FAFC] mt-4 mb-5">
              Frequently Asked Questions
            </h2>
            <p className="text-panik-text-secondary text-sm max-w-xl mx-auto leading-relaxed">
              Everything you need to know about how Panik works.
            </p>
          </div>
        </ScrollReveal>

        {/* Accordion Questions List */}
        <ScrollReveal duration={0.65} delay={0.15}>
          <div className="space-y-4" id="faq-accordion-container">
            {faqs.map((item, index) => {
              const isOpen = activeId === item.id;
              
              return (
                <div
                  key={item.id}
                  className={`border rounded-2xl overflow-hidden transition-all duration-300 ${
                    isOpen 
                      ? "bg-[#111318]/50 border-white/[0.12] shadow-[0_4px_25px_rgba(0,0,0,0.5)]" 
                      : "bg-[#111318]/15 border-white/[0.06] hover:border-white/[0.1] hover:bg-[#111318]/30"
                  }`}
                  id={`faq-item-${item.id}`}
                >
                  {/* Accordion Title Header */}
                  <button
                    onClick={() => toggleItem(item.id)}
                    className="w-full flex items-center justify-between p-5 md:p-6 text-left cursor-pointer group"
                    aria-expanded={isOpen}
                    type="button"
                  >
                    <div className="flex items-center gap-4 pr-4">
                      {/* Left icon wrapper */}
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center border shrink-0 transition-all ${
                        isOpen 
                          ? "bg-[#F97316]/10 border-panik-orange/30 text-panik-orange" 
                          : "bg-white/[0.02] border-white/[0.06] text-panik-text-secondary group-hover:text-white"
                      }`}>
                        {item.category === "RISK ENGINE" && <Cpu className="w-3.5 h-3.5" />}
                        {item.category === "SECURITY" && <AlertCircle className="w-3.5 h-3.5" />}
                        {item.category === "GENERAL" && <HelpCircle className="w-3.5 h-3.5" />}
                      </div>

                      <span className={`text-xs md:text-sm font-semibold tracking-wide font-sans transition-colors ${
                        isOpen ? "text-[#F8FAFC]" : "text-[#E2E8F0] group-hover:text-white"
                      }`}>
                        {item.question}
                      </span>
                    </div>

                    {/* Animated Arrow */}
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center border shrink-0 transition-all duration-300 ${
                      isOpen 
                        ? "bg-panik-orange border-panik-orange text-white" 
                        : "border-white/[0.12] text-panik-text-secondary group-hover:text-white"
                    }`}>
                      <ChevronDown className={`w-3 h-3 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
                    </div>
                  </button>

                  {/* Accordion Body Content */}
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                      >
                        <div className="px-5 md:px-6 pb-6 pt-1 border-t border-white/[0.03] text-xs font-mono tracking-wide leading-relaxed text-panik-text-secondary">
                          <p className="pl-[48px]">
                            {item.answer}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </ScrollReveal>

      </div>
    </section>
  );
}
