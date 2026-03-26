import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

import LanguageProvider from "./contexts/LanguageContext";
import CDNProvider from "./contexts/CDNContext";

// Handle /present route before React mounts to avoid StrictMode/HMR issues
if (window.location.pathname === "/present") {
  const params = new URLSearchParams(window.location.search);
  const docKey = params.get("docKey") || "openslides_present_html";
  const html = sessionStorage.getItem(docKey);
  if (html) {
    document.open();
    document.write(html);
    document.close();
  } else {
    document.body.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#000;color:rgba(255,255,255,0.7);font-size:14px;">Presentation content is unavailable for this tab.</div>';
  }
} else {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <LanguageProvider>
        <CDNProvider>
          <App />
        </CDNProvider>
      </LanguageProvider>
    </React.StrictMode>
  );
}
