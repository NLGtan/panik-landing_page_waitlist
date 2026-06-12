/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { motion, HTMLMotionProps } from "motion/react";

interface ScrollRevealProps extends HTMLMotionProps<"div"> {
  delay?: number;
  duration?: number;
  yOffset?: number;
  once?: boolean;
}

export function ScrollReveal({
  children,
  delay = 0,
  duration = 0.5,
  yOffset = 20,
  once = false, // Set to false to allow elements to fade in when scrolling up as well
  ...props
}: ScrollRevealProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: yOffset }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: "-60px 0px -60px 0px" }}
      transition={{
        duration,
        delay,
        ease: [0.215, 0.610, 0.355, 1.000], // outQuart cubic-bezier
      }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
