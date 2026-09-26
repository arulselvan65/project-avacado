import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Project Avocado — Tree & Plant Registry",
  description:
    "Internal tool for registering and mapping trees and plants on the farm.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className="h-full antialiased font-sans"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
