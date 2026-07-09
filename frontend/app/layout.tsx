import type { Metadata } from "next";
import { Inter, Instrument_Serif, Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import { ProductsProvider } from "@/lib/products-context";
import { ToastProvider } from "@/components/Toast";
import { GlobalLoader } from "@/components/GlobalLoader";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
});
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "URBN ",
  description: "Internal product pipeline tracker",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${instrumentSerif.variable} ${cormorant.variable} font-sans`}>
        <ProductsProvider><ToastProvider>{children}<GlobalLoader /></ToastProvider></ProductsProvider>
      </body>
    </html>
  );
}