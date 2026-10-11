import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/components/arc/foundation.css";
import "./index.css";
import { SalesDashboard } from "./SalesDashboard";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SalesDashboard />
  </StrictMode>,
);
