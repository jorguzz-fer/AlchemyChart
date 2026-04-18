import "material-symbols";
import "remixicon/fonts/remixicon.css";
import "./globals.css";

import LayoutProvider from "@/providers/LayoutProvider";
import type { Metadata } from "next";
import { Raleway } from "next/font/google";

const raleway = Raleway({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Alchemy Control Chart — Controle de Qualidade Laboratorial",
  description:
    "Sistema de Controle de Qualidade Interno (CQI) para laboratórios clínicos. Gráficos Levey-Jennings, regras de Westgard e gestão de analitos, equipamentos e materiais.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" dir="ltr">
      <body className={`${raleway.variable} antialiased`}>
        <LayoutProvider>{children}</LayoutProvider>
      </body>
    </html>
  );
}
