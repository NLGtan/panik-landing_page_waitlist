import React from "react";

/** Protocol brand mark — matches by name substring ("aave" / "moonwell"). */
export function ProtocolLogo({ protocol, size = "w-6 h-6" }: { protocol: string; size?: string }) {
  if (protocol.toLowerCase().includes("aave")) {
    return (
      <div className={`rounded-xl overflow-hidden shrink-0 ${size} flex items-center justify-center bg-[#8C82F2] p-1.5 border border-white/[0.08]`}>
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Aave Ghost Arc */}
          <path d="M 12,50 A 38,38 0 0,1 88,50 L 76,50 A 26,26 0 0,0 24,50 Z" fill="#FFFFFF" />
          {/* Aave Eyes */}
          <circle cx="37" cy="50" r="7.5" fill="#FFFFFF" />
          <circle cx="63" cy="50" r="7.5" fill="#FFFFFF" />
        </svg>
      </div>
    );
  }
  if (protocol.toLowerCase().includes("moonwell")) {
    return (
      <div className={`rounded-xl overflow-hidden shrink-0 ${size} flex items-center justify-center bg-[#1D6AF3] p-1.5 border border-white/[0.08]`}>
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Moonwell Left Crescent */}
          <path d="M 42,28 C 28,31 16,42 16,50 C 16,58 28,69 42,72 C 32,66 26,59 26,50 C 26,41 32,34 42,28 Z" fill="#FFFFFF" />
          {/* Moonwell Right Crescent */}
          <path d="M 58,28 C 72,31 84,42 84,50 C 84,58 72,69 58,72 C 68,66 74,59 74,50 C 74,41 68,34 58,28 Z" fill="#FFFFFF" />
        </svg>
      </div>
    );
  }
  return (
    <div className={`rounded-xl bg-orange-500/15 border border-panik-orange/30 flex items-center justify-center font-mono font-bold text-xs text-panik-orange shrink-0 ${size}`}>
      {protocol[0]}
    </div>
  );
}
