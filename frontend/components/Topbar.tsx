"use client";

import { useRef, useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { useProducts } from "@/lib/products-context";
import { getSession, Session } from "@/lib/auth";
import { Menu } from "lucide-react";
import { NotificationBell } from "./NotificationBell";

const PRIORITY_OPTIONS = ["P1 — Urgent", "P2 — High", "P3 — Medium", "P4 — Low"];

// Placeholder — swap for the real QA roster once the backend exists.
const QA_OPTIONS = ["Ms. Shirin Memon", "Mr. Rohan Dave", "Ms. Aisha Khan"];

const emptyForm = {
  productName: "",
  factory: "",
  factorySku: "",
  priority: PRIORITY_OPTIONS[0],
  assignedQa: QA_OPTIONS[0],
  specifications: "",
  sampleReceived: false,
  sampleGivenDate: "",
  deadline: "",
};

  export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { addProduct } = useProducts();
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
      <div className="flex items-center justify-between gap-3 border-b border-[#1a3a6e]/50 bg-[#03102b]/70 px-4 py-4 backdrop-blur sm:px-8">
        <button
          onClick={onMenuClick}
          className="rounded-lg p-2 text-[#ddeeff] transition hover:bg-[#1a3a6e]/30 md:hidden"
        >
          <Menu size={20} />
        </button>

        <div className="flex flex-1 items-center justify-end gap-2 sm:gap-3">
          {session && (
            <p className="hidden text-sm text-[#90bce0] sm:block">
              Hi, <span className="font-medium text-[#ddeeff]">{session.name}</span>
            </p>
          )}
          <NotificationBell />
          <button
            onClick={() => setAddOpen(true)}
            className="rounded-full bg-[#1a4a8a] px-4 py-2 text-sm font-medium text-[#ddeeff] transition hover:bg-[#1e57a8] sm:px-5"
          >
            + New Product
          </button>
        </div>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#ddeeff]">Add Product</h2>
          <button onClick={() => setAddOpen(false)} className="text-[#3a6a9a] hover:text-[#ddeeff]">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#90bce0]">
              Product name *
            </label>
            <input
              required
              value={form.productName}
              onChange={(e) => update("productName", e.target.value)}
              placeholder="e.g. Aria Knit Tee"
              className="w-full rounded-xl border border-[#1a3a6e]/50 bg-[#060f26] px-3 py-2.5 text-sm text-[#ddeeff] outline-none focus:border-[#2a6aaa]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#90bce0]">
                Factory *
              </label>
              <input
                required
                value={form.factory}
                onChange={(e) => update("factory", e.target.value)}
                placeholder="e.g. Shenzhen PowerTech"
                className="w-full rounded-xl border border-[#1a3a6e]/50 bg-[#060f26] px-3 py-2.5 text-sm text-[#ddeeff] outline-none focus:border-[#2a6aaa]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#90bce0]">
                Factory SKU *
              </label>
              <input
                required
                value={form.factorySku}
                onChange={(e) => update("factorySku", e.target.value)}
                placeholder="e.g. UPR136"
                className="w-full rounded-xl border border-[#1a3a6e]/50 bg-[#060f26] px-3 py-2.5 text-sm text-[#ddeeff] outline-none focus:border-[#2a6aaa]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#90bce0]">
                Priority *
              </label>
              <select
                value={form.priority}
                onChange={(e) => update("priority", e.target.value)}
                className="w-full rounded-xl border border-[#1a3a6e]/50 bg-[#060f26] px-3 py-2.5 text-sm text-[#ddeeff] outline-none focus:border-[#2a6aaa]"
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#90bce0]">
                Assign to QA *
              </label>
              <select
                value={form.assignedQa}
                onChange={(e) => update("assignedQa", e.target.value)}
                className="w-full rounded-xl border border-[#1a3a6e]/50 bg-[#060f26] px-3 py-2.5 text-sm text-[#ddeeff] outline-none focus:border-[#2a6aaa]"
              >
                {QA_OPTIONS.map((q) => (
                  <option key={q}>{q}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#90bce0]">
              Specifications
            </label>
            <textarea
              value={form.specifications}
              onChange={(e) => update("specifications", e.target.value)}
              placeholder="Capacity, wattage, key specs..."
              rows={3}
              className="w-full rounded-xl border border-[#1a3a6e]/50 bg-[#060f26] px-3 py-2.5 text-sm text-[#ddeeff] outline-none focus:border-[#2a6aaa]"
            />
          </div>

          <div className="rounded-xl bg-[#0a1e42] p-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-[#ddeeff]">Sample received?</label>
              <button
                type="button"
                onClick={() => update("sampleReceived", !form.sampleReceived)}
                className={`relative h-6 w-11 rounded-full transition ${
                  form.sampleReceived ? "bg-[#1a6a4a]" : "bg-[#d9cfba]"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-[#060f26] transition ${
                    form.sampleReceived ? "left-5" : "left-0.5"
                  }`}
                />
              </button>
            </div>
            {form.sampleReceived && (
              <div className="mt-3">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#90bce0]">
                  Date given to QA team
                </label>
                <input
                  type="date"
                  value={form.sampleGivenDate}
                  onChange={(e) => update("sampleGivenDate", e.target.value)}
                  className="w-full rounded-xl border border-[#1a3a6e]/50 bg-[#060f26] px-3 py-2.5 text-sm text-[#ddeeff] outline-none focus:border-[#2a6aaa]"
                />
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#90bce0]">
              Deadline *
            </label>
            <input
              required
              type="date"
              value={form.deadline}
              onChange={(e) => update("deadline", e.target.value)}
              className="w-full rounded-xl border border-[#1a3a6e]/50 bg-[#060f26] px-3 py-2.5 text-sm text-[#ddeeff] outline-none focus:border-[#2a6aaa]"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#90bce0]">
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
              className="relative w-full overflow-hidden rounded-xl border-2 border-dashed border-[#1a3a6e]/50 bg-[#060f26] text-sm text-[#90bce0] hover:bg-[#0a1e42]"
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
              className="flex-1 rounded-xl border border-[#1a3a6e]/50 bg-[#060f26] py-2.5 text-sm font-medium text-[#90bce0] hover:bg-[#0a1e42]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded-xl bg-[#3b2f23] py-2.5 text-sm font-medium text-[#ddeeff] hover:opacity-90"
            >
              Add to Intake
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}