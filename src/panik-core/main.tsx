/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppProviders } from "./providers/AppProviders";
import { AppDemo } from "./AppDemo";
import "../index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders>
      <AppDemo />
    </AppProviders>
  </StrictMode>,
);
