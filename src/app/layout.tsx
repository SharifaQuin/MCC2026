import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MCC Training Portal",
  description: "Employee training and onboarding portal for Mama's Cleaning Crew",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
