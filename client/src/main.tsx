import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerServiceWorker } from "./registerSW";

// Register service worker for PWA
registerServiceWorker();

// Match the Android build: the app always renders in dark mode.
document.documentElement.classList.add("dark");

createRoot(document.getElementById("root")!).render(<App />);
