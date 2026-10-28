import React from "react";
import ReactDOM from "react-dom/client";
import { AppRoutes } from "./routes";
import { cleanupObsoleteStorage } from "./lib/storage";
import "./index.css";

cleanupObsoleteStorage();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppRoutes />
  </React.StrictMode>,
);
