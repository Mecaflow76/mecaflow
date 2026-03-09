"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

/* ───── Types ───── */
interface Client {
  id: string;
  nom: string;
  prenom: string;
  email?: string;
}
interface Vehicule {
  id: string;
  marque: string;
  modele: string;
  plaque: string;
  client_id: string;
  vin: string;
  moteur: string;
  lieu_fabrication: string;
}
interface LabourRow {
  id: string;
  desc: string;
  qty: number;
  rate: number;
}
interface PartRow {
  id: string;
  desc: string;
  num: string;
  qty: number;
  cost: number | string;
  price: number | string;
}
interface Facture {
  id: string;
  client_id: string;
  vehicule_id: string;
  date_facture: string;
  montant_total: number;
  statut: string;
  notes: string;
  description: string;
  garantie: string;
  km: string;
  discount_pct: number;
  deposit: number;
  sous_total: number;
  tps: number;
  tvq: number;
  notes_internes: string;
  labour_rows: LabourRow[];
  parts_rows: PartRow[];
  clients?: Client;
  vehicules?: Vehicule;
}

/* ───── Constants ───── */
const STATUTS = [
  { value: "brouillon", label: "Brouillon", color: "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300" },
  { value: "envoyee", label: "Envoyee", color: "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400" },
  { value: "payee", label: "Payee", color: "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400" },
  { value: "en_retard", label: "En retard", color: "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400" },
  { value: "annulee", label: "Annulee", color: "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400" },
];

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const fmt = (n: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(n);

const DEFAULT_RATE = 89.95;

const emptyForm = {
  client_id: "",
  vehicule_id: "",
  date_facture: new Date().toISOString().slice(0, 10),
  statut: "brouillon",
  garantie: "",
  km: "",
  description: "",
  discount_pct: "",
  deposit: "",
  notes: "",
  notes_internes: "",
};

/* ───── Component ───── */
export default function FacturesPageWrapper() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500 dark:text-gray-400">Chargement...</div>}>
      <FacturesPage />
    </Suspense>
  );
}

function FacturesPage() {
  const searchParams = useSearchParams();
  const [factures, setFactures] = useState<Facture[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [vehicules, setVehicules] = useState<Vehicule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingFacture, setEditingFacture] = useState<Facture | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [labourRows, setLabourRows] = useState<LabourRow[]>([]);
  const [partsRows, setPartsRows] = useState<PartRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailConfirm, setEmailConfirm] = useState(false);
  const [emailResult, setEmailResult] = useState<{ success?: boolean; error?: string } | null>(null);

  /* ── Auto-open form from URL params ── */
  const didAutoOpen = useRef(false);
  useEffect(() => {
    if (didAutoOpen.current) return;
    const clientId = searchParams.get("client_id");
    const vehiculeId = searchParams.get("vehicule_id");
    if (clientId || vehiculeId) {
      didAutoOpen.current = true;
      setEditingFacture(null);
      setForm({
        ...emptyForm,
        client_id: clientId || "",
        vehicule_id: vehiculeId || "",
      });
      setLabourRows([{ id: uid(), desc: "", qty: 1, rate: DEFAULT_RATE }]);
      setPartsRows([{ id: uid(), desc: "", num: "", qty: 1, cost: "", price: "" }]);
      setShowForm(true);
    }
  }, [searchParams]);

  /* ── Fetch ── */
  useEffect(() => {
    fetchFactures();
    fetchClients();
    fetchVehicules();
  }, []);

  async function fetchFactures() {
    setLoading(true);
    const { data, error } = await supabase
      .from("factures")
      .select(
        "*, clients(id, nom, prenom, email), vehicules(id, marque, modele, plaque, vin, moteur, lieu_fabrication)"
      )
      .order("date_facture", { ascending: false });
    if (error) setError(error.message);
    else setFactures(data || []);
    setLoading(false);
  }

  async function fetchClients() {
    const { data } = await supabase
      .from("clients")
      .select("id, nom, prenom, email")
      .order("nom");
    setClients(data || []);
  }

  async function fetchVehicules() {
    const { data } = await supabase
      .from("vehicules")
      .select("id, marque, modele, plaque, client_id, vin, moteur, lieu_fabrication")
      .order("marque");
    setVehicules(data || []);
  }

  /* ── Calculations ── */
  const calcTotals = useCallback(() => {
    const labourTotal = labourRows.reduce((s, r) => s + r.qty * r.rate, 0);
    const partsTotal = partsRows.reduce((s, r) => s + r.qty * (parseFloat(String(r.price)) || 0), 0);
    const partsCost = partsRows.reduce((s, r) => s + (parseFloat(String(r.cost)) || 0) * r.qty, 0);
    const sub = labourTotal + partsTotal;
    const discPct = parseFloat(form.discount_pct) || 0;
    // Rabais sur le prix detail des pieces
    const disc = partsTotal * (discPct / 100);
    const dep = parseFloat(form.deposit) || 0;
    const taxable = Math.max(0, sub - disc);
    const tps = taxable * 0.05;
    const tvq = taxable * 0.09975;
    const total = taxable + tps + tvq;
    const due = Math.max(0, total - dep);
    return { labourTotal, partsTotal, partsCost, sub, disc, discPct, taxable, tps, tvq, total, dep, due };
  }, [labourRows, partsRows, form.discount_pct, form.deposit]);

  const totals = calcTotals();

  /* ── Internal margin (parts) — after discount ── */
  const totalCost = totals.partsCost;
  const totalSell = totals.partsTotal;
  const margeAvantRabais =
    totalSell > 0 && totalCost > 0
      ? Math.round(((totalSell - totalCost) / totalCost) * 100)
      : null;
  const margeApresRabais =
    totalSell > 0 && totalCost > 0 && totals.disc > 0
      ? Math.round(((totalSell - totals.disc - totalCost) / totalCost) * 100)
      : null;

  /* ── Filtered vehicles by selected client ── */
  const filteredVehicules = form.client_id
    ? vehicules.filter((v) => v.client_id === form.client_id)
    : vehicules;

  /* ── Open / Close ── */
  function openNew() {
    setEditingFacture(null);
    setForm(emptyForm);
    setLabourRows([{ id: uid(), desc: "", qty: 1, rate: DEFAULT_RATE }]);
    setPartsRows([{ id: uid(), desc: "", num: "", qty: 1, cost: "", price: "" }]);
    setShowForm(true);
  }

  function openEdit(f: Facture) {
    setEditingFacture(f);
    setForm({
      client_id: f.client_id || "",
      vehicule_id: f.vehicule_id || "",
      date_facture: f.date_facture || "",
      statut: f.statut || "brouillon",
      garantie: f.garantie || "",
      km: f.km || "",
      description: f.description || "",
      discount_pct: f.discount_pct?.toString() || "",
      deposit: f.deposit?.toString() || "",
      notes: f.notes || "",
      notes_internes: f.notes_internes || "",
    });
    setLabourRows(
      f.labour_rows && Array.isArray(f.labour_rows) ? f.labour_rows : []
    );
    setPartsRows(
      f.parts_rows && Array.isArray(f.parts_rows) ? f.parts_rows : []
    );
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingFacture(null);
    setForm(emptyForm);
    setLabourRows([]);
    setPartsRows([]);
    setEmailResult(null);
  }

  /* ── Envoi courriel ── */
  async function handleSendEmail() {
    if (!editingFacture) return;
    setEmailConfirm(false);
    setSendingEmail(true);
    setEmailResult(null);
    try {
      const res = await fetch("/api/factures/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factureId: editingFacture.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEmailResult({ error: data.error || "Erreur lors de l'envoi." });
      } else {
        setEmailResult({ success: true });
        fetchFactures();
        if (data.statusUpdated && form.statut === "brouillon") {
          setForm((prev) => ({ ...prev, statut: "envoyee" }));
        }
        // Auto-dismiss après 5 secondes
        setTimeout(() => setEmailResult(null), 5000);
      }
    } catch {
      setEmailResult({ error: "Erreur reseau. Reessayez." });
    } finally {
      setSendingEmail(false);
    }
  }

  /* ── Labour rows ── */
  function addLabour() {
    setLabourRows((prev) => [
      ...prev,
      { id: uid(), desc: "", qty: 1, rate: DEFAULT_RATE },
    ]);
  }
  function removeLabour(id: string) {
    setLabourRows((prev) => prev.filter((r) => r.id !== id));
  }
  function updateLabour(id: string, field: keyof LabourRow, val: string) {
    setLabourRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              [field]: ["qty", "rate"].includes(field)
                ? parseFloat(val) || 0
                : val,
            }
          : r
      )
    );
  }

  /* ── Parts rows ── */
  function addPart() {
    setPartsRows((prev) => [
      ...prev,
      { id: uid(), desc: "", num: "", qty: 1, cost: "", price: "" },
    ]);
  }
  function removePart(id: string) {
    setPartsRows((prev) => prev.filter((r) => r.id !== id));
  }
  function updatePart(id: string, field: keyof PartRow, val: string) {
    setPartsRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              [field]: field === "qty"
                ? parseFloat(val) || 0
                : ["cost", "price"].includes(field)
                  ? val === "" ? "" : parseFloat(val) || 0
                  : val,
            }
          : r
      )
    );
  }

  /* ── Submit ── */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const t = calcTotals();

    const payload = {
      client_id: form.client_id || null,
      vehicule_id: form.vehicule_id || null,
      date_facture: form.date_facture,
      statut: form.statut,
      garantie: form.garantie,
      km: form.km,
      description: form.description,
      discount_pct: parseFloat(form.discount_pct) || 0,
      deposit: parseFloat(form.deposit) || 0,
      notes: form.notes,
      notes_internes: form.notes_internes,
      labour_rows: labourRows,
      parts_rows: partsRows,
      sous_total: t.sub,
      tps: t.tps,
      tvq: t.tvq,
      montant_total: t.total,
    };

    if (editingFacture) {
      const { error } = await supabase
        .from("factures")
        .update(payload)
        .eq("id", editingFacture.id);
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.from("factures").insert(payload);
      if (error) setError(error.message);
    }

    setSaving(false);
    closeForm();
    fetchFactures();
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer cette facture ?")) return;
    const { error } = await supabase.from("factures").delete().eq("id", id);
    if (error) setError(error.message);
    else fetchFactures();
  }

  /* ── Helpers ── */
  function getStatutBadge(statut: string) {
    const s = STATUTS.find((st) => st.value === statut);
    return s ? (
      <span
        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${s.color}`}
      >
        {s.label}
      </span>
    ) : (
      <span className="text-gray-500">{statut}</span>
    );
  }

  const filteredFactures = factures.filter((f) => {
    const term = search.toLowerCase();
    const clientName = f.clients
      ? `${f.clients.nom} ${f.clients.prenom}`.toLowerCase()
      : "";
    return (
      clientName.includes(term) ||
      f.date_facture?.includes(term) ||
      f.statut?.toLowerCase().includes(term) ||
      f.montant_total?.toString().includes(term)
    );
  });

  const grandTotal = filteredFactures.reduce(
    (sum, f) => sum + (f.montant_total || 0),
    0
  );

  /* ═══════════════════════════════════════ RENDER ═══════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-6xl print:hidden">
        {/* ── Header ── */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-foreground">Factures</h1>
            <span className="rounded-full bg-blue-100 dark:bg-blue-900/30 px-3 py-1 text-sm font-medium text-blue-800 dark:text-blue-400">
              {filteredFactures.length} facture
              {filteredFactures.length !== 1 && "s"}
            </span>
            <span className="rounded-full bg-green-100 dark:bg-green-900/30 px-3 py-1 text-sm font-medium text-green-800 dark:text-green-400">
              Total : {fmt(grandTotal)}
            </span>
          </div>
          <button
            onClick={openNew}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            + Nouvelle facture
          </button>
        </div>

        {/* ── Search ── */}
        <input
          type="text"
          placeholder="Rechercher par client, date, statut ou montant..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-6 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />

        {/* ── States ── */}
        {loading && (
          <p className="py-12 text-center text-gray-500 dark:text-gray-400">Chargement...</p>
        )}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/30 p-4 text-sm text-red-600 dark:text-red-400">
            Erreur : {error}
          </div>
        )}
        {!loading && !error && filteredFactures.length === 0 && (
          <p className="py-12 text-center text-gray-500 dark:text-gray-400">
            Aucune facture trouvee.
          </p>
        )}

        {/* ── Table ── */}
        {!loading && !error && filteredFactures.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900 text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Client</th>
                  <th className="px-6 py-3">Vehicule</th>
                  <th className="px-6 py-3">Montant</th>
                  <th className="px-6 py-3">Statut</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredFactures.map((f) => (
                  <tr
                    key={f.id}
                    className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                    onClick={() => openEdit(f)}
                  >
                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">
                      {f.date_facture}
                    </td>
                    <td className="px-6 py-4 text-gray-700 dark:text-gray-300">
                      {f.clients
                        ? `${f.clients.nom} ${f.clients.prenom}`
                        : "\u2014"}
                    </td>
                    <td className="px-6 py-4 text-gray-700 dark:text-gray-300">
                      {f.vehicules
                        ? `${f.vehicules.marque} ${f.vehicules.modele}`
                        : "\u2014"}
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">
                      {fmt(f.montant_total)}
                    </td>
                    <td className="px-6 py-4">{getStatutBadge(f.statut)}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(f);
                        }}
                        className="mr-3 text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        Modifier
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(f.id);
                        }}
                        className="text-red-600 hover:text-red-800 text-sm font-medium"
                      >
                        Supprimer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══════════════════ MODAL FACTURE ═══════════════════ */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-2">
          <div className="my-2 w-full max-w-6xl rounded-xl bg-white dark:bg-gray-800 p-4 shadow-xl">
            {/* ═══ En-tête impression PRO ═══ */}
            <div className="hidden print:block mb-0 print-header-pro">
              {/* Bandeau garage bleu foncé */}
              <div style={{ background: "#1e3a5f", padding: "20px 24px", textAlign: "center", borderRadius: "8px 8px 0 0" }}>
                <h1 style={{ margin: 0, color: "#ffffff", fontSize: "22px", fontWeight: 700, letterSpacing: "1px" }}>GARAGE LAGARDE</h1>
                <p style={{ margin: "6px 0 0", color: "#93c5fd", fontSize: "12px" }}>
                  2232 Rang Des Continuations, St-Jacques, QC J0K 2R0<br />
                  (450) 750-6862 — garagelagarde@outlook.com
                </p>
              </div>
              {/* Bande FACTURE bleue */}
              <div style={{ background: "#2563eb", padding: "8px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#ffffff", fontWeight: 700, fontSize: "15px" }}>FACTURE</span>
                <span style={{ color: "#bfdbfe", fontSize: "13px" }}>{form.date_facture}</span>
              </div>
            </div>
            <h2 className="mb-2 text-base font-semibold text-gray-900 dark:text-gray-100 print:hidden">
              {editingFacture ? "Modifier la facture" : "Nouvelle facture"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-2">
              {/* ── En-tete impression (texte statique) ── */}
              {(() => {
                const sc = clients.find((c) => c.id === form.client_id);
                const sv = vehicules.find((v) => v.id === form.vehicule_id);
                return (
                  <div className="hidden print:block" style={{ padding: "16px 0", borderBottom: "1px solid #e5e7eb" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <div>
                        <p style={{ margin: "0 0 3px", fontSize: "11px", textTransform: "uppercase", color: "#6b7280", fontWeight: 600 }}>Client</p>
                        <p style={{ margin: 0, fontSize: "15px", fontWeight: 600 }}>{sc ? `${sc.prenom} ${sc.nom}` : "\u2014"}</p>
                      </div>
                      {sv && (
                        <div>
                          <p style={{ margin: "0 0 3px", fontSize: "11px", textTransform: "uppercase", color: "#6b7280", fontWeight: 600 }}>Vehicule</p>
                          <p style={{ margin: 0, fontSize: "13px" }}>
                            {sv.marque} {sv.modele}{sv.plaque ? ` — ${sv.plaque}` : ""}{sv.vin ? ` (VIN: ${sv.vin})` : ""}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* ── En-tete ecran (selects) — 6 colonnes compactes ── */}
              <div className="grid grid-cols-6 gap-2 print:hidden">
                <div>
                  <label className="mb-0.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Client *
                  </label>
                  <select
                    required
                    value={form.client_id}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        client_id: e.target.value,
                        vehicule_id: "",
                      })
                    }
                    className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-xs text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">-- Client --</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.prenom} {c.nom}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-0.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Vehicule
                  </label>
                  <select
                    value={form.vehicule_id}
                    onChange={(e) =>
                      setForm({ ...form, vehicule_id: e.target.value })
                    }
                    className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-xs text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">-- Vehicule --</option>
                    {filteredVehicules.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.marque} {v.modele}{" "}
                        {v.plaque ? `\u2014 ${v.plaque}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-0.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={form.date_facture}
                    onChange={(e) =>
                      setForm({ ...form, date_facture: e.target.value })
                    }
                    className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-xs text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Km
                  </label>
                  <input
                    type="text"
                    placeholder="75000"
                    value={form.km}
                    onChange={(e) => setForm({ ...form, km: e.target.value })}
                    className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-xs text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Statut
                  </label>
                  <select
                    value={form.statut}
                    onChange={(e) =>
                      setForm({ ...form, statut: e.target.value })
                    }
                    className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-xs text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none"
                  >
                    {STATUTS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-0.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Garantie
                  </label>
                  <input
                    type="text"
                    placeholder="3 mois / 5 000 km"
                    value={form.garantie}
                    onChange={(e) =>
                      setForm({ ...form, garantie: e.target.value })
                    }
                    className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-xs text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* ── Info vehicule ── */}
              {form.vehicule_id && (() => {
                const v = vehicules.find((x) => x.id === form.vehicule_id);
                if (!v || (!v.vin && !v.moteur && !v.lieu_fabrication)) return null;
                return (
                  <div className="flex flex-wrap gap-3 rounded bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-[10px] text-gray-600 dark:text-gray-400">
                    {v.vin && <span><strong className="text-gray-700 dark:text-gray-300">VIN :</strong> {v.vin}</span>}
                    {v.moteur && <span><strong className="text-gray-700 dark:text-gray-300">Moteur :</strong> {v.moteur}</span>}
                    {v.lieu_fabrication && <span><strong className="text-gray-700 dark:text-gray-300">Lieu fab. :</strong> {v.lieu_fabrication}</span>}
                  </div>
                );
              })()}

              {/* Km/Garantie impression */}
              <div className="hidden print:flex print:gap-6 text-sm">
                {form.km && (
                  <span>
                    <span className="font-semibold">Kilometrage :</span> {form.km} km
                  </span>
                )}
                {form.garantie && (
                  <span>
                    <span className="font-semibold">Garantie :</span> {form.garantie}
                  </span>
                )}
              </div>

              <div>
                <label className="mb-0.5 block text-xs font-medium text-gray-700 dark:text-gray-300 print:hidden">
                  Description des travaux
                </label>
                <span className="hidden print:block text-sm font-semibold mb-1">Description des travaux</span>
                <textarea
                  rows={1}
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* ════════════ MAIN D'OEUVRE ════════════ */}
              <div>
                <h3 className="mb-1 text-xs font-semibold text-gray-800 dark:text-gray-200 uppercase tracking-wide print:text-gray-500">
                  Main d&apos;oeuvre
                </h3>
                  <div className="overflow-hidden rounded border border-gray-200 dark:border-gray-700">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 dark:bg-gray-900 text-[10px] text-gray-500 dark:text-gray-400 uppercase">
                        <tr>
                          <th className="px-2 py-1 text-left" style={{ width: "44%" }}>Description</th>
                          <th className="px-2 py-1 text-center" style={{ width: "14%" }}>Heures</th>
                          <th className="px-2 py-1 text-center" style={{ width: "18%" }}>Taux ($/h)</th>
                          <th className="px-2 py-1 text-right" style={{ width: "16%" }}>Sous-total</th>
                          <th className="px-1 py-1 text-center print:hidden" style={{ width: "8%" }}></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {labourRows.map((r) => (
                          <tr key={r.id} className="bg-white dark:bg-gray-800">
                            <td className="px-1 py-0.5">
                              <input
                                type="text"
                                value={r.desc}
                                onChange={(e) =>
                                  updateLabour(r.id, "desc", e.target.value)
                                }
                                placeholder="Description..."
                                className="w-full rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-1.5 py-1 text-xs text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none"
                              />
                            </td>
                            <td className="px-1 py-0.5">
                              <input
                                type="number"
                                step="0.25"
                                min="0"
                                value={r.qty}
                                onChange={(e) =>
                                  updateLabour(r.id, "qty", e.target.value)
                                }
                                className="w-full rounded border border-gray-200 px-1.5 py-1 text-center text-xs focus:border-blue-500 focus:outline-none"
                              />
                            </td>
                            <td className="px-1 py-0.5">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={r.rate}
                                onChange={(e) =>
                                  updateLabour(r.id, "rate", e.target.value)
                                }
                                className="w-full rounded border border-gray-200 px-1.5 py-1 text-center text-xs focus:border-blue-500 focus:outline-none"
                              />
                            </td>
                            <td className="px-2 py-0.5 text-right text-xs font-medium text-gray-900 dark:text-gray-100">
                              {fmt(r.qty * r.rate)}
                            </td>
                            <td className="px-1 py-0.5 text-center print:hidden">
                              <button
                                type="button"
                                onClick={() => removeLabour(r.id)}
                                className="text-red-400 hover:text-red-600 text-sm leading-none"
                                title="Supprimer"
                              >
                                &times;
                              </button>
                            </td>
                          </tr>
                        ))}
                        <tr
                          className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors print:hidden"
                          onClick={addLabour}
                        >
                          <td colSpan={5} className="px-2 py-1 text-center text-[10px] text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400">
                            + Ajouter une ligne
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
              </div>

              {/* ════════════ PIECES ════════════ */}
              <div>
                <h3 className="mb-1 text-xs font-semibold text-gray-800 dark:text-gray-200 uppercase tracking-wide print:text-gray-500">
                  Pieces
                </h3>
                  <div className="overflow-hidden rounded border border-gray-200 dark:border-gray-700">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 dark:bg-gray-900 text-[10px] text-gray-500 dark:text-gray-400 uppercase">
                        <tr>
                          <th className="px-2 py-1 text-left" style={{ width: "26%" }}>Description</th>
                          <th className="px-2 py-1 text-center" style={{ width: "12%" }}>N&deg; piece</th>
                          <th className="px-1 py-1 text-center" style={{ width: "7%" }}>Qte</th>
                          <th className="px-2 py-1 text-center print:hidden" style={{ width: "12%" }}>
                            <span title="Cout interne (non visible au client)">Cout</span>
                          </th>
                          <th className="px-2 py-1 text-center" style={{ width: "12%" }}>Prix unit.</th>
                          <th className="px-2 py-1 text-right print:hidden" style={{ width: "9%" }}>Marge</th>
                          <th className="px-2 py-1 text-right" style={{ width: "12%" }}>Sous-total</th>
                          <th className="px-1 py-1 text-center print:hidden" style={{ width: "5%" }}></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {partsRows.map((r) => {
                          const rPrice = parseFloat(String(r.price)) || 0;
                          const rCost = parseFloat(String(r.cost)) || 0;
                          const marge =
                            rPrice > 0 && rCost > 0
                              ? Math.round(
                                  ((rPrice - rCost) / rCost) * 100
                                )
                              : null;
                          const margeColor =
                            marge !== null
                              ? marge >= 30
                                ? "text-green-600"
                                : marge >= 15
                                  ? "text-yellow-600"
                                  : "text-red-600"
                              : "text-gray-400";
                          return (
                            <tr key={r.id} className="bg-white dark:bg-gray-800">
                              <td className="px-1 py-0.5">
                                <input
                                  type="text"
                                  value={r.desc}
                                  onChange={(e) =>
                                    updatePart(r.id, "desc", e.target.value)
                                  }
                                  placeholder="Description..."
                                  className="w-full rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-1.5 py-1 text-xs text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none"
                                />
                              </td>
                              <td className="px-1 py-0.5">
                                <input
                                  type="text"
                                  value={r.num}
                                  onChange={(e) =>
                                    updatePart(r.id, "num", e.target.value)
                                  }
                                  placeholder="OEM-123"
                                  className="w-full rounded border border-gray-200 px-1.5 py-1 text-center text-xs focus:border-blue-500 focus:outline-none"
                                />
                              </td>
                              <td className="px-1 py-0.5">
                                <input
                                  type="number"
                                  min="1"
                                  value={r.qty}
                                  onChange={(e) =>
                                    updatePart(r.id, "qty", e.target.value)
                                  }
                                  className="w-full rounded border border-gray-200 px-1 py-1 text-center text-xs focus:border-blue-500 focus:outline-none"
                                />
                              </td>
                              <td className="px-1 py-0.5 print:hidden">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={r.cost}
                                  onChange={(e) =>
                                    updatePart(r.id, "cost", e.target.value)
                                  }
                                  className="w-full rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-1 text-center text-xs text-gray-900 dark:text-gray-100 focus:border-amber-500 focus:outline-none"
                                  title="Cout interne (non visible au client)"
                                />
                              </td>
                              <td className="px-1 py-0.5">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={r.price}
                                  onChange={(e) =>
                                    updatePart(r.id, "price", e.target.value)
                                  }
                                  className="w-full rounded border border-gray-200 px-1.5 py-1 text-center text-xs focus:border-blue-500 focus:outline-none"
                                />
                              </td>
                              <td
                                className={`px-2 py-0.5 text-right text-xs font-medium print:hidden ${margeColor}`}
                              >
                                {marge !== null ? `${marge}%` : "\u2014"}
                              </td>
                              <td className="px-2 py-0.5 text-right text-xs font-medium text-gray-900 dark:text-gray-100">
                                {fmt(r.qty * rPrice)}
                              </td>
                              <td className="px-1 py-0.5 text-center print:hidden">
                                <button
                                  type="button"
                                  onClick={() => removePart(r.id)}
                                  className="text-red-400 hover:text-red-600 text-sm leading-none"
                                  title="Supprimer"
                                >
                                  &times;
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        <tr
                          className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors print:hidden"
                          onClick={addPart}
                        >
                          <td colSpan={8} className="px-2 py-1 text-center text-[10px] text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400">
                            + Ajouter une piece
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
              </div>

              {/* ════════════ TOTAUX & OPTIONS ════════════ */}
              <div className="grid grid-cols-2 gap-3 print:grid-cols-1">
                {/* ── Left: discount, deposit, notes (ecran seulement) ── */}
                <div className="space-y-2 print:hidden">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-0.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                        Rabais sur pieces (%)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={form.discount_pct}
                        onChange={(e) =>
                          setForm({ ...form, discount_pct: e.target.value })
                        }
                        placeholder="0"
                        className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-xs text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                        Acompte recu ($)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.deposit}
                        onChange={(e) =>
                          setForm({ ...form, deposit: e.target.value })
                        }
                        placeholder="0.00"
                        className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-xs text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-0.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
                      Notes (visible sur facture)
                    </label>
                    <textarea
                      rows={1}
                      value={form.notes}
                      onChange={(e) =>
                        setForm({ ...form, notes: e.target.value })
                      }
                      className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-0.5 block text-xs font-medium text-amber-700 dark:text-amber-400">
                      Notes internes (jamais imprime)
                    </label>
                    <textarea
                      rows={1}
                      value={form.notes_internes}
                      onChange={(e) =>
                        setForm({ ...form, notes_internes: e.target.value })
                      }
                      className="w-full rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* ── Notes impression (texte simple) ── */}
                {form.notes && (
                  <div className="hidden print:block text-sm mt-2">
                    <span className="font-semibold">Notes :</span>{" "}
                    {form.notes}
                  </div>
                )}

                {/* ── Right: totals box ── */}
                <div className="rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3">
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Main d&apos;oeuvre</span>
                      <span className="font-medium">{fmt(totals.labourTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Pieces</span>
                      <span className="font-medium">{fmt(totals.partsTotal)}</span>
                    </div>
                    {margeAvantRabais !== null && (
                      <div className="flex justify-between text-xs print:hidden">
                        <span className="text-amber-600">
                          Marge pieces{margeApresRabais !== null ? " (avant rabais)" : ""}
                        </span>
                        <span className="font-medium text-amber-600">
                          {margeAvantRabais}%
                        </span>
                      </div>
                    )}
                    {margeApresRabais !== null && (
                      <div className="flex justify-between text-xs print:hidden">
                        <span className="text-red-500 dark:text-red-400">
                          Marge après rabais
                        </span>
                        <span className="font-medium text-red-500 dark:text-red-400">
                          {margeApresRabais}%
                        </span>
                      </div>
                    )}
                    <div className="border-t border-gray-300 dark:border-gray-600 pt-1 flex justify-between font-medium">
                      <span>Sous-total</span>
                      <span>{fmt(totals.sub)}</span>
                    </div>

                    {totals.disc > 0 && (
                      <div className="flex justify-between text-red-600 dark:text-red-400">
                        <span>
                          Rabais ({totals.discPct}%)
                        </span>
                        <span>-{fmt(totals.disc)}</span>
                      </div>
                    )}

                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">TPS (5%)</span>
                      <span>{fmt(totals.tps)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">TVQ (9,975%)</span>
                      <span>{fmt(totals.tvq)}</span>
                    </div>

                    <div className="border-t border-gray-300 dark:border-gray-600 pt-1 flex justify-between text-sm font-bold">
                      <span>TOTAL</span>
                      <span>{fmt(totals.total)}</span>
                    </div>

                    {totals.dep > 0 && (
                      <>
                        <div className="flex justify-between text-gray-600">
                          <span>Acompte</span>
                          <span>-{fmt(totals.dep)}</span>
                        </div>
                        <div className="flex justify-between text-sm font-bold text-blue-700 dark:text-blue-400">
                          <span>SOLDE DU</span>
                          <span>{fmt(totals.due)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Feedback toast courriel ── */}
              {emailResult && (
                <div
                  className={`mb-4 rounded-lg p-3 text-sm print:hidden ${
                    emailResult.success
                      ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800"
                      : "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800"
                  }`}
                >
                  {emailResult.success
                    ? "✅ Facture envoyee par courriel avec succes!"
                    : `❌ ${emailResult.error}`}
                </div>
              )}

              {/* ═══ Pied de page impression PRO ═══ */}
              <div className="hidden print:block print-footer-pro" style={{ marginTop: "24px", background: "#f9fafb", padding: "16px 24px", textAlign: "center", borderTop: "1px solid #e5e7eb", borderRadius: "0 0 8px 8px" }}>
                <p style={{ margin: "0 0 4px", fontWeight: 600, color: "#374151", fontSize: "14px" }}>Merci de votre confiance!</p>
                <p style={{ margin: 0, fontSize: "12px", color: "#6b7280" }}>
                  Garage Lagarde — (450) 750-6862 — garagelagarde@outlook.com
                </p>
              </div>

              {/* ── Buttons ── */}
              <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-2 print:hidden">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-1.5"
                  >
                    🖨️ Imprimer
                  </button>
                  {editingFacture && (
                    <button
                      type="button"
                      disabled={sendingEmail || form.statut === "annulee"}
                      onClick={() => {
                        const c = clients.find((cl) => cl.id === form.client_id);
                        if (!c?.email) {
                          setEmailResult({ error: "Ce client n'a pas d'adresse courriel. Ajoutez-la dans la fiche client." });
                          setTimeout(() => setEmailResult(null), 5000);
                          return;
                        }
                        setEmailConfirm(true);
                      }}
                      className="rounded border border-blue-300 dark:border-blue-600 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sendingEmail ? (
                        <>
                          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                          Envoi...
                        </>
                      ) : (
                        <>✉️ Envoyer par courriel</>
                      )}
                    </button>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={closeForm}
                    className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded bg-blue-600 px-5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving
                      ? "Enregistrement..."
                      : editingFacture
                        ? "Enregistrer"
                        : "Creer la facture"}
                  </button>
                </div>
              </div>
            </form>

            {/* ── Dialogue de confirmation courriel ── */}
            {emailConfirm && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
                <div className="w-full max-w-sm rounded-xl bg-white dark:bg-gray-800 p-6 shadow-2xl border border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
                    Confirmer l&apos;envoi
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                    Envoyer cette facture de <span className="font-semibold text-gray-900 dark:text-gray-100">{fmt(totals.total)}</span> a :
                  </p>
                  <p className="text-base font-medium text-blue-600 dark:text-blue-400 mb-4">
                    {(() => {
                      const c = clients.find((cl) => cl.id === form.client_id);
                      return c ? `${c.prenom} ${c.nom} — ${c.email}` : "";
                    })()}
                  </p>
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setEmailConfirm(false)}
                      className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={handleSendEmail}
                      className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 flex items-center gap-2"
                    >
                      ✉️ Envoyer
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
