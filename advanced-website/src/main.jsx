import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import "./media.css";

const root = document.getElementById("root");
if (!root) throw new Error("Nexora Advanced Documentation root element is missing.");

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
