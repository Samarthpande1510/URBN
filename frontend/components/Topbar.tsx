"use client";

import { useRef, useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { useProducts } from "@/lib/products-context";
import { getSession, Session } from "@/lib/auth";
import { Menu, Search } from "lucide-react";
import { NotificationBell } from "./NotificationBell";

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
  deadline: "",
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

  useEffect(() => {
    setSession(getSession());
  }, []);

  function update<K extends keyof typeof emptyForm>(key: K, value: typeof emptyForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
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
              Product name *
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
                Factory *
              </label>
              <input
                required
                value={form.factory}
                onChange={(e) => update("factory", e.target.value)}
                placeholder="e.g. Shenzhen PowerTech"
                className="w-full rounded-md border border-[#bfdbfe]/50 bg-[#ffffff] px-3 py-2.5 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-normal uppercase tracking-wide text-[#1d4ed8]">
                Factory SKU *
              </label>
              <input
                required
                value={form.factorySku}
                onChange={(e) => update("factorySku", e.target.value)}
                placeholder="e.g. UPR136"
                className="w-full rounded-md border border-[#bfdbfe]/50 bg-[#ffffff] px-3 py-2.5 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd]"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-normal uppercase tracking-wide text-[#1d4ed8]">
              Priority *
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

          <div className="rounded-md bg-[#eff6ff] p-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-[#0f172a]">Sample received?</label>
              <button
                type="button"
                onClick={() => update("sampleReceived", !form.sampleReceived)}
                className={`relative h-6 w-11 rounded-full transition ${
                  form.sampleReceived ? "bg-[#16a34a]" : "bg-[#e2e8f0]"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-[#ffffff] transition ${
                    form.sampleReceived ? "left-5" : "left-0.5"
                  }`}
                />
              </button>
            </div>
            {form.sampleReceived && (
              <div className="mt-3">
                <label className="mb-1 block text-xs font-normal uppercase tracking-wide text-[#1d4ed8]">
                  Date given to QA team
                </label>
                <input
                  type="date"
                  value={form.sampleGivenDate}
                  onChange={(e) => update("sampleGivenDate", e.target.value)}
                  className="w-full rounded-md border border-[#bfdbfe]/50 bg-[#ffffff] px-3 py-2.5 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd]"
                />
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-normal uppercase tracking-wide text-[#1d4ed8]">
              Deadline *
            </label>
            <input
              required
              type="date"
              value={form.deadline}
              onChange={(e) => update("deadline", e.target.value)}
              className="w-full rounded-md border border-[#bfdbfe]/50 bg-[#ffffff] px-3 py-2.5 text-sm text-[#0f172a] outline-none focus:border-[#93c5fd]"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-normal uppercase tracking-wide text-[#1d4ed8]">
              Product image
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setImageName(file?.name ?? null);
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (ev) => setImageDataUrl(ev.target?.result as string ?? null);
                  reader.readAsDataURL(file);
                } else {
                  setImageDataUrl(null);
                }
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="relative w-full overflow-hidden rounded-md border-2 border-dashed border-[#bfdbfe]/50 bg-[#ffffff] text-sm text-[#1d4ed8] hover:bg-[#eff6ff]"
            >
              {imageDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageDataUrl} alt="preview" className="h-40 w-full object-cover" />
              ) : (
                <div className="flex flex-col items-center justify-center py-8">
                  <span className="text-2xl">↑</span>
                  <span className="mt-2">Click to upload photo</span>
                </div>
              )}
            </button>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="flex-1 rounded-md border border-[#bfdbfe]/50 bg-[#ffffff] py-2.5 text-sm font-medium text-[#1d4ed8] hover:bg-[#eff6ff]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded-md bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Add to Intake
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}