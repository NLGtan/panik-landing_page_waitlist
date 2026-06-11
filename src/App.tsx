/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Navigation } from "./components/Navigation";
import { Hero } from "./components/Hero";
import { DashboardScrollPreview } from "./components/DashboardScrollPreview";
import { HowItWorks } from "./components/HowItWorks";
import { RiskVisualization } from "./components/RiskVisualization";
import { WhyPanik } from "./components/WhyPanik";
import { ProtocolCoverage } from "./components/ProtocolCoverage";
import { FAQ } from "./components/FAQ";
import { WaitlistCTA } from "./components/WaitlistCTA";
import { Footer } from "./components/Footer";
import { AppMockup } from "./components/AppMockup";
import { TechyGlobe } from "./components/TechyGlobe";
import { WaitlistModal } from "./components/WaitlistModal";
import { INITIAL_SUBSCRIBERS } from "./data";
import { WaitlistEntry } from "./types";

export default function App() {
  const [viewMode, setViewMode] = useState<"landing" | "app">("landing");

  // Subscribers State - Load from localStorage if present to maintain real local persistence
  const [subscribers, setSubscribers] = useState<WaitlistEntry[]>(() => {
    const saved = localStorage.getItem("panik_subscribers");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved waitlist", e);
      }
    }
    return INITIAL_SUBSCRIBERS;
  });

  const [hasSubscribed, setHasSubscribed] = useState<boolean>(() => {
    return localStorage.getItem("panik_has_subscribed") === "true";
  });

  const [isWaitlistModalOpen, setIsWaitlistModalOpen] = useState(false);
  const [waitlistInitialEmail, setWaitlistInitialEmail] = useState("");

  // Keep localStorage synched
  useEffect(() => {
    localStorage.setItem("panik_subscribers", JSON.stringify(subscribers));
    localStorage.setItem("panik_has_subscribed", String(hasSubscribed));
  }, [subscribers, hasSubscribed]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [viewMode]);

  // Smooth scroll handler
  const handleScrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleOpenWaitlistModal = (initialEmail: string = "") => {
    setWaitlistInitialEmail(initialEmail);
    setIsWaitlistModalOpen(true);
  };

  // Submit hander
  const handleJoinWaitlist = (email: string, source: string = "Authorized Signer") => {
    if (subscribers.some(sub => sub.email.toLowerCase() === email.toLowerCase())) {
      setHasSubscribed(true);
      return;
    }

    const nextPosition = subscribers.length > 0 
      ? subscribers[0].position + 1 
      : 48;

    const newEntry: WaitlistEntry = {
      email,
      timestamp: "Just Now",
      position: nextPosition,
      source: source
    };

    // Prepend to top so it's visible in list logs immediately
    setSubscribers([newEntry, ...subscribers]);
    setHasSubscribed(true);
  };

  if (viewMode === "app") {
    return (
      <AppMockup 
        onBackToLanding={() => setViewMode("landing")}
        onJoinWaitlist={handleJoinWaitlist}
        hasSubscribed={hasSubscribed}
      />
    );
  }

  return (
    <div className="relative min-h-screen bg-[#0A0A0B] text-[#F0F4FF] selection:bg-panik-orange/30 selection:text-white overflow-x-clip">
      {/* Navigation section */}
      <Navigation 
        onScrollTo={handleScrollToSection} 
        subscriberCount={subscribers.length} 
        onLaunchMockup={() => setViewMode("app")}
      />

      {/* Global continuous background techy globe spanning Hero and Dashboard preview */}
      <div className="absolute left-1/2 top-[480px] sm:top-[520px] -translate-y-1/2 -translate-x-1/2 w-full max-w-[110rem] h-[1050px] z-0 select-none overflow-hidden pointer-events-none opacity-30">
        <TechyGlobe />
        <div className="absolute inset-x-0 top-0 h-[250px] bg-gradient-to-b from-[#0A0A0B] to-transparent pointer-events-none z-20"></div>
        <div className="absolute inset-x-0 bottom-0 h-[250px] bg-gradient-to-t from-[#0A0A0B] to-transparent pointer-events-none z-20"></div>
      </div>

      {/* Hero section */}
      <Hero 
        subscriberCount={subscribers.length} 
        hasSubscribed={hasSubscribed}
        onLaunchMockup={() => setViewMode("app")}
        onOpenWaitlistModal={handleOpenWaitlistModal}
      />

      {/* Interactive dashboard scroll-revealing preview */}
      <DashboardScrollPreview />

      {/* How It works */}
      <HowItWorks />

      {/* Risk Dimension Score Visualizations */}
      <RiskVisualization />

      {/* Why PANIK Comparison Table */}
      <WhyPanik />

      {/* Protocol coverage benchmarks (Temporarily hidden from frontend as requested, file kept intact) */}
      {/* <ProtocolCoverage /> */}

      {/* Bottom CTA & Live allowed addresses queue */}
      <WaitlistCTA 
        onJoinWaitlist={handleJoinWaitlist} 
        subscribersList={subscribers} 
        hasSubscribed={hasSubscribed}
        onOpenWaitlistModal={handleOpenWaitlistModal}
      />

      {/* Frequently Asked Questions */}
      <FAQ />

      {/* Premium minimal footer */}
      <Footer onScrollTo={handleScrollToSection} />

      {/* Dynamic multi-step onboarding modal */}
      <WaitlistModal 
        isOpen={isWaitlistModalOpen} 
        onClose={() => setIsWaitlistModalOpen(false)} 
        onJoinSuccess={(email, source) => handleJoinWaitlist(email, source)}
        initialEmail={waitlistInitialEmail}
      />
    </div>
  );
}
