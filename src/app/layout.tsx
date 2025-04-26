// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css"; // Your global styles (includes Tailwind)
import Navbar from "@/components/Navbar"; // <--- 1. IMPORT the Navbar component

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Bidly - Campus Auctions", // Updated title
  description: "Your campus marketplace for timed auctions.", // Updated description
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50`}> {/* Added a light background */}
        <Navbar /> {/* <--- 2. RENDER the Navbar component here */}
        <main className="pt-4"> {/* Optional: Add some padding top to main content */}
          {children} {/* Page content will be rendered here */}
        </main>
      </body>
    </html>
  );
}