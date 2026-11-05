import type { Metadata } from "next";
import "@fontsource-variable/dm-sans/wght.css";
import "@fontsource-variable/dm-sans/wght-italic.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Eat Leet Repeat",
  description: "See every accepted LeetCode solve, including the problems you come back to.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
