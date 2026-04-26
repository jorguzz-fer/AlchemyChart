"use client";

import React, { useState, ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import SidebarMenu from "@/components/Layout/SidebarMenu";
import Header from "@/components/Layout/Header";
import Footer from "@/components/Layout/Footer";

interface LayoutProviderProps {
  children: ReactNode;
}

const AUTH_PATHS = ["/", "/login", "/signup", "/forgot-password", "/reset-password", "/privacidade", "/termos", "/api/password-reset"];

const LayoutProvider: React.FC<LayoutProviderProps> = ({ children }) => {
  const pathname = usePathname();
  const [active, setActive] = useState<boolean>(false);

  const toggleActive = () => setActive((prev) => !prev);

  const isAuthPage = AUTH_PATHS.includes(pathname);

  return (
    <SessionProvider>
      {isAuthPage ? (
        <div className="min-h-screen">{children}</div>
      ) : (
        <div className={`main-content-wrap transition-all ${active ? "active" : ""}`}>
          <SidebarMenu toggleActive={toggleActive} />
          <Header toggleActive={toggleActive} />
          <div className="main-content transition-all flex flex-col overflow-hidden min-h-screen">
            {children}
            <Footer />
          </div>
        </div>
      )}
    </SessionProvider>
  );
};

export default LayoutProvider;
