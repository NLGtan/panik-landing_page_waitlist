/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";

interface PanikLogoMarkProps {
  className?: string;
  size?: number;
}

export function PanikLogoMark({ className = "", size = 32 }: PanikLogoMarkProps) {
  return (
    <img
      src="/panik-logo.png"
      alt="PANIK"
      width={size}
      height={size}
      className={className}
      style={{ objectFit: "contain" }}
    />
  );
}
