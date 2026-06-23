"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { CheckCircle } from "lucide-react";

interface ToastItem { id: number; message: string }

interface ToastCtx { showToast: (msg: string) => void }

const ToastContext = createContext<ToastCtx>({ showToast: () => {} });

export function useToast() { return useContext(ToastContext); }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2800);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex flex-col items-center gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id}
            className="flex items-center gap-2 rounded-xl border border-green-500/40 bg-[#020b1e]/95 px-4 py-2.5 shadow-lg backdrop-blur animate-in fade-in slide-in-from-bottom-2 duration-200">
            <CheckCircle size={15} className="text-green-400 shrink-0" />
            <span className="text-sm text-[#ddeeff]">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
