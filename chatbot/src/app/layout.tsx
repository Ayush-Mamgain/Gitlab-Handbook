import type { Metadata } from "next";
import "./globals.css";
import ReduxProvider from "@/providers/ReduxProvider";
import { Toaster } from "react-hot-toast";

export const metadata: Metadata = {
  title: "GitLab Handbook Chat",
  description: "Conversational access to the GitLab Handbook",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-[#0f0f1a] antialiased font-sans">
        <ReduxProvider>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: "#1e1e2e",
                color: "#e2e8f0",
                border: "1px solid rgba(255,255,255,0.08)",
                fontSize: "13px",
              },
              error: { iconTheme: { primary: "#E24329", secondary: "#fff" } },
              success: { iconTheme: { primary: "#22c55e", secondary: "#fff" } },
            }}
          />
        </ReduxProvider>
      </body>
    </html>
  );
}
