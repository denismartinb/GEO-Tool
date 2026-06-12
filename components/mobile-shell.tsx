"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type MobileShellContextValue = {
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  metaOpen: boolean;
  setMetaOpen: (open: boolean) => void;
  closeAll: () => void;
  navTriggerRef: React.RefObject<HTMLButtonElement | null>;
};

const MobileShellContext = createContext<MobileShellContextValue | null>(null);

export function useMobileShell() {
  const ctx = useContext(MobileShellContext);
  if (!ctx) {
    throw new Error("useMobileShell must be used within MobileShellProvider");
  }
  return ctx;
}

export function MobileShellProvider({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const navTriggerRef = useRef<HTMLButtonElement | null>(null);

  const closeAll = useCallback(() => {
    setMobileNavOpen(false);
    setMetaOpen(false);
  }, []);

  useEffect(() => {
    if (!mobileNavOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
        navTriggerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileNavOpen]);

  return (
    <MobileShellContext.Provider
      value={{ mobileNavOpen, setMobileNavOpen, metaOpen, setMetaOpen, closeAll, navTriggerRef }}
    >
      <div className={`shell ${mobileNavOpen ? "mobnav-open" : ""}`}>{children}</div>
    </MobileShellContext.Provider>
  );
}
