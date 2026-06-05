import React from "react";
import ReactDOM from "react-dom/client";
import "@livekit/components-styles";
import App from "./App";
import "./index.scss";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
