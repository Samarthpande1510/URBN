"use client";

import { useRef, useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { useProducts } from "@/lib/products-context";
import { getSession, Session } from "@/lib/auth";
import { Menu, Search, Upload, ZoomIn, X } from "lucide-react";
import { NotificationBell } from "./NotificationBell";
import { uploadFile } from "@/lib/upload";

const PRIORITY_OPTIONS = ["Urgent", "P1 — High", "P2 — Medium", "P3 — Low"];

const emptyForm = {
  productName: "",
  factory: "",
  factorySku: "",
  colors: "",
  priority: PRIORITY_OPTIONS[0],
  specifications: "",
  sampleReceived: false,
  sampleGivenDate: "",
  deadline: new Date().toISOString().split("T")[0],
};

  export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { addProduct, search, setSearch } = useProducts();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [session, setSession] = useState<Session | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [imageName, setImageName] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);

  useEffect(() => {
    setSession(getSession());
  }, []);

  function update<K extends keyof typeof emptyForm>(key: K, value: typeof emptyForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (uploading) return;
    addProduct({
      productName: form.productName,
      factory: form.factory,
      factorySku: form.factorySku,
      colors: form.colors,
      priorityLabel: form.priority,
      specifications: form.specifications,
      sampleReceived: form.sampleReceived,
      sampleGivenDate: form.sampleGivenDate,
      deadline: form.deadline,
      imageName,
      imageDataUrl,
    });

    setForm(emptyForm);
    setImageName(null);
    setImageDataUrl(null);
    setAddOpen(false);
   router.push("/dashboard");
  }

  return (
    <>
      <div className="flex items-center gap-2 border-b border-blue-100 bg-white/80 backdrop-blur-sm px-4 py-3 sm:px-6 shadow-sm">
        <button
          onClick={onMenuClick}
          className="shrink-0 rounded p-2 text-slate-500 transition hover:bg-blue-50 hover:text-blue-700 md:hidden"
        >
          <Menu size={18} />
        </button>

        {/* Search */}
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full rounded-lg border border-blue-100 bg-blue-50/60 py-2 pl-8 pr-3 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-blue-300 focus:bg-white focus:ring-0 transition"
          />
        </div>

        <div className="flex shrink-0 items-center gap-2 ml-auto">
          {session && (
            <p className="hidden text-sm text-slate-500 lg:block">
              Hi, <span className="font-medium text-slate-800">{session.name}</span>
            </p>
          )}
          <NotificationBell />
          <button
            onClick={() => setAddOpen(true)}
            className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 sm:px-4 shadow-sm"
          >
            <span className="hidden sm:inline">+ Add Product</span>
            <span className="sm:hidden">+</span>
          </button>
        </div>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#0f172a]">Add Product</h2>
          <button onClick={() => setAddOpen(false)} className="text-[#64748b] hover:text-[#0f172a]">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          <div>
            <label className="mb-1 block text-xs font-normal uppercase tracking-wide text-[#1d4ed8]">
              Product Name *
            </label>
            <input
              required
              value={form.productName}
              onChange={(e) => update("productName", e.target.value)}
              placeholder="e.g. Aria Knit Tee"
              className="w-full rounded-md border border-[#bfdbfe]/50 bg-[#ffffff] px-3 py-2.5 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd]"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-normal uppercase tracking-wide text-[#1d4ed8]">
                Factory Name
              </label>
              <input
                value={form.factory}
                onChange={(e) => update("factory", e.target.value)}
                placeholder="e.g. Shenzhen PowerTech"
                className="w-full rounded-md border border-[#bfdbfe]/50 bg-[#ffffff] px-3 py-2.5 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-normal uppercase tracking-wide text-[#1d4ed8]">
                Factory SKU
              </label>
              <input
                value={form.factorySku}
                onChange={(e) => update("factorySku", e.target.value)}
                placeholder="e.g. UPR136"
                className="w-full rounded-md border border-[#bfdbfe]/50 bg-[#ffffff] px-3 py-2.5 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd]"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-normal uppercase tracking-wide text-[#1d4ed8]">
              Priority 
            </label>
            <select
              value={form.priority}
              onChange={(e) => update("priority", e.target.value)}
              className="w-full rounded-md border border-[#bfdbfe]/50 bg-[#ffffff] px-3 py-2.5 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd]"
            >
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-normal uppercase tracking-wide text-[#1d4ed8]">
              Specifications
            </label>
            <textarea
              value={form.specifications}
              onChange={(e) => update("specifications", e.target.value)}
              placeholder="Capacity, wattage, key specs..."
              rows={3}
              className="w-full rounded-md border border-[#bfdbfe]/50 bg-[#ffffff] px-3 py-2.5 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd]"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-normal uppercase tracking-wide text-[#1d4ed8]">
              Deadline
            </label>
            <input
              type="date"
              value={form.deadline}
              onChange={(e) => update("deadline", e.target.value)}
              className="w-full rounded-md border border-[#bfdbfe]/50 bg-[#ffffff] px-3 py-2.5 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd]"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-normal uppercase tracking-wide text-[#1d4ed8]">
              Product Image
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0] ?? null;
                if (!file) { setImageName(null); setImageDataUrl(null); return; }
                if (file.size > 10 * 1024 * 1024) {
                  alert("Image too large — max 10MB");
                  e.target.value = "";
                  return;
                }
                setImageName(file.name);
                setUploading(true);
                try {
                  // compressed to WebP in-browser, stored in R2 — DB only gets the URL
                  const url = await uploadFile(file, "products");
                  setImageDataUrl(url);
                } catch (err) {
                  alert(err instanceof Error ? err.message : "Upload failed");
                  setImageName(null);
                  setImageDataUrl(null);
                  e.target.value = "";
                } finally {
                  setUploading(false);
                }
              }}
            />
            {uploading ? (
              <div className="flex h-56 w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-[#bfdbfe]/50 bg-[#eff6ff] text-[#1d4ed8]">
                <span className="block h-6 w-6 rounded-full border-[3px] border-blue-100 border-t-blue-600 animate-spin" />
                <span className="animate-pulse text-sm">Uploading & compressing…</span>
              </div>
            ) : imageDataUrl ? (
              <div className="overflow-hidden rounded-md border border-[#bfdbfe]/60 bg-[#f8fbff]">
                {/* Full image, uncropped — click to zoom */}
                <button
                  type="button"
                  onClick={() => setZoomOpen(true)}
                  className="group relative block w-full"
                  title="Click to zoom"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageDataUrl} alt="product preview" className="mx-auto max-h-64 w-full object-contain" />
                  <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-black/55 px-2 py-1 text-[11px] font-medium text-white opacity-0 transition group-hover:opacity-100">
                    <ZoomIn size={12} /> Zoom
                  </span>
                </button>
                <div className="flex items-center justify-between gap-2 border-t border-[#bfdbfe]/50 bg-white px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-xs text-[#64748b]">{imageName}</span>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      className="text-xs font-medium text-[#1d4ed8] hover:underline">Replace</button>
                    <button type="button"
                      onClick={() => { setImageName(null); setImageDataUrl(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                      className="text-xs font-medium text-red-500 hover:underline">Remove</button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-[#bfdbfe]/50 bg-[#ffffff] text-sm text-[#1d4ed8] transition hover:border-[#93c5fd] hover:bg-[#eff6ff]"
              >
                <Upload size={22} className="text-[#93c5fd]" />
                <span className="font-medium">Click to upload photo</span>
                <span className="text-xs text-[#94a3b8]">PNG, JPG or WebP — compressed automatically</span>
              </button>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setForm(emptyForm); setImageName(null); setImageDataUrl(null); }}
              className="rounded-md border border-[#bfdbfe]/50 bg-[#ffffff] px-4 py-2.5 text-sm font-medium text-[#64748b] hover:bg-[#eff6ff]"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="flex-1 rounded-md border border-[#bfdbfe]/50 bg-[#ffffff] py-2.5 text-sm font-medium text-[#1d4ed8] hover:bg-[#eff6ff]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="flex-1 rounded-md bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {uploading ? "Uploading image…" : "Add to Intake"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Full-screen image zoom lightbox */}
      {zoomOpen && imageDataUrl && (
        <div
          className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
          onClick={() => setZoomOpen(false)}
        >
          <button
            type="button"
            onClick={() => setZoomOpen(false)}
            className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
            title="Close"
          >
            <X size={20} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageDataUrl}
            alt="product full preview"
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}