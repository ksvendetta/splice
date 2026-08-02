import { useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import CopperHome from "@/pages/CopperHome";
import NotFound from "@/pages/not-found";

// Base path derived from the Vite base (BASE_URL). This is "/splice/" for the
// GitHub Pages build and "/" when built with --base=/ (the propcortex subdomain),
// so the router basename matches wherever the app is served.
const basePath = import.meta.env.BASE_URL.replace(/\/+$/, "");

function AppRouter({ mode, setMode }: { mode: "fiber" | "copper"; setMode: (mode: "fiber" | "copper") => void }) {
  return (
    <Switch>
      <Route path="/">
        {mode === "fiber" ? <Home mode={mode} setMode={setMode} /> : <CopperHome mode={mode} setMode={setMode} />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [mode, setMode] = useState<"fiber" | "copper">("fiber");

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <WouterRouter base={basePath}>
          <AppRouter mode={mode} setMode={setMode} />
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
