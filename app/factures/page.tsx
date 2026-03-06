"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

/* ───── Types ───── */
interface Client {
  id: string;
  nom: string;
  prenom: string;
}
interface Vehicule {
  id: string;
  marque: string;
  modele: string;
  plaque: string;
  client_id: string;
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
        "*, clients(id, nom, prenom), vehicules(id, marque, modele, plaque)"
      )
      .order("date_facture", { ascending: false });
    if (error) setError(error.message);
    else setFactures(data || []);
    setLoading(false);
  }

  async function fetchClients() {
    const { data } = await supabase
      .from("clients")
      .select("id, nom, prenom")
      .order("nom");
    setClients(data || []);
  }

  async function fetchVehicules() {
    const { data } = await supabase
      .from("vehicules")
      .select("id, marque, modele, plaque, client_id")
      .order("marque");
    setVehicules(data || []);
  }

  /* ── Calculations ── */
  const calcTotals = useCallback(() => {
    const labourTotal = labourRows.reduce((s, r) => s + r.qty * r.rate, 0);
    const partsTotal = partsRows.reduce((s, r) => s + r.qty * (parseFloat(String(r.price)) || 0), 0);
    const sub = labourTotal + partsTotal;
    const discPct = parseFloat(form.discount_pct) || 0;
    const disc = partsTotal * (discPct / 100);
    const dep = parseFloat(form.deposit) || 0;
    const taxable = Math.max(0, sub - disc);
    const tps = taxable * 0.05;
    const tvq = taxable * 0.09975;
    const total = taxable + tps + tvq;
    const due = Math.max(0, total - dep);
    return { labourTotal, partsTotal, sub, disc, discPct, taxable, tps, tvq, total, dep, due };
  }, [labourRows, partsRows, form.discount_pct, form.deposit]);

  const totals = calcTotals();

  /* ── Internal margin (parts) ── */
  const totalCost = partsRows.reduce((s, r) => s + (parseFloat(String(r.cost)) || 0) * r.qty, 0);
  const totalSell = partsRows.reduce((s, r) => s + (parseFloat(String(r.price)) || 0) * r.qty, 0);
  const margeGlobale =
    totalSell > 0 && totalCost > 0
      ? Math.round(((totalSell - totalCost) / totalCost) * 100)
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
      <div className="mx-auto max-w-6xl">
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
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-8 w-full max-w-4xl rounded-xl bg-white dark:bg-gray-800 p-6 shadow-xl">
            <h2 className="mb-6 text-lg font-semibold text-gray-900 dark:text-gray-100">
              {editingFacture ? "Modifier la facture" : "Nouvelle facture"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* ── En-tete ── */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
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
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">-- Selectionner --</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.prenom} {c.nom}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Vehicule
                  </label>
                  <select
                    value={form.vehicule_id}
                    onChange={(e) =>
                      setForm({ ...form, vehicule_id: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">-- Selectionner --</option>
                    {filteredVehicules.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.marque} {v.modele}{" "}
                        {v.plaque ? `\u2014 ${v.plaque}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={form.date_facture}
                    onChange={(e) =>
                      setForm({ ...form, date_facture: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Kilometrage
                  </label>
                  <input
                    type="text"
                    placeholder="75000"
                    value={form.km}
                    onChange={(e) => setForm({ ...form, km: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Statut
                  </label>
                  <select
                    value={form.statut}
                    onChange={(e) =>
                      setForm({ ...form, statut: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {STATUTS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Garantie
                  </label>
                  <input
                    type="text"
                    placeholder="3 mois / 5 000 km"
                    value={form.garantie}
                    onChange={(e) =>
                      setForm({ ...form, garantie: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Description des travaux
                </label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* ════════════ MAIN D'OEUVRE ════════════ */}
              <div>
                <div className="mb-2">
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    Main d&apos;oeuvre
                  </h3>
                </div>
                  <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-900 text-xs text-gray-500 dark:text-gray-400">
                        <tr>
                          <th className="px-3 py-2 text-left" style={{ width: "44%" }}>
                            Description
                          </th>
                          <th className="px-3 py-2 text-center" style={{ width: "14%" }}>
                            Heures
                          </th>
                          <th className="px-3 py-2 text-center" style={{ width: "18%" }}>
                            Taux ($/h)
                          </th>
                          <th className="px-3 py-2 text-right" style={{ width: "16%" }}>
                            Sous-total
                          </th>
                          <th className="px-3 py-2 text-center" style={{ width: "8%" }}></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {labourRows.map((r) => (
                          <tr key={r.id} className="bg-white dark:bg-gray-800">
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                value={r.desc}
                                onChange={(e) =>
                                  updateLabour(r.id, "desc", e.target.value)
                                }
                                placeholder="Description..."
                                className="w-full rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="number"
                                step="0.25"
                                min="0"
                                value={r.qty}
                                onChange={(e) =>
                                  updateLabour(r.id, "qty", e.target.value)
                                }
                                className="w-full rounded border border-gray-200 px-2 py-1.5 text-center text-sm focus:border-blue-500 focus:outline-none"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={r.rate}
                                onChange={(e) =>
                                  updateLabour(r.id, "rate", e.target.value)
                                }
                                className="w-full rounded border border-gray-200 px-2 py-1.5 text-center text-sm focus:border-blue-500 focus:outline-none"
                              />
                            </td>
                            <td className="px-3 py-1.5 text-right text-sm font-medium text-gray-900 dark:text-gray-100">
                              {fmt(r.qty * r.rate)}
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              <button
                                type="button"
                                onClick={() => removeLabour(r.id)}
                                className="text-red-400 hover:text-red-600 text-lg leading-none"
                                title="Supprimer"
                              >
                                &times;
                              </button>
                            </td>
                          </tr>
                        ))}
                        <tr
                          className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                          onClick={addLabour}
                        >
                          <td colSpan={5} className="px-3 py-2 text-center text-xs text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400">
                            + Ajouter une ligne
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
              </div>

              {/* ════════════ PIECES ════════════ */}
              <div>
                <div className="mb-2">
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    Pieces
                  </h3>
                </div>
                  <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-900 text-xs text-gray-500 dark:text-gray-400">
                        <tr>
                          <th className="px-3 py-2 text-left" style={{ width: "26%" }}>
                            Description
                          </th>
                          <th className="px-3 py-2 text-center" style={{ width: "12%" }}>
                            N&deg; piece
                          </th>
                          <th className="px-3 py-2 text-center" style={{ width: "8%" }}>
                            Qte
                          </th>
                          <th className="px-3 py-2 text-center" style={{ width: "13%" }}>
                            <span title="Cout interne (non visible au client)">
                              Cout
                            </span>
                          </th>
                          <th className="px-3 py-2 text-center" style={{ width: "13%" }}>
                            Prix unit.
                          </th>
                          <th className="px-3 py-2 text-right" style={{ width: "10%" }}>
                            Marge
                          </th>
                          <th className="px-3 py-2 text-right" style={{ width: "12%" }}>
                            Sous-total
                          </th>
                          <th className="px-3 py-2 text-center" style={{ width: "6%" }}></th>
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
                              <td className="px-2 py-1.5">
                                <input
                                  type="text"
                                  value={r.desc}
                                  onChange={(e) =>
                                    updatePart(r.id, "desc", e.target.value)
                                  }
                                  placeholder="Description..."
                                  className="w-full rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="text"
                                  value={r.num}
                                  onChange={(e) =>
                                    updatePart(r.id, "num", e.target.value)
                                  }
                                  placeholder="OEM-123"
                                  className="w-full rounded border border-gray-200 px-2 py-1.5 text-center text-sm focus:border-blue-500 focus:outline-none"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="number"
                                  min="1"
                                  value={r.qty}
                                  onChange={(e) =>
                                    updatePart(r.id, "qty", e.target.value)
                                  }
                                  className="w-full rounded border border-gray-200 px-2 py-1.5 text-center text-sm focus:border-blue-500 focus:outline-none"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={r.cost}
                                  onChange={(e) =>
                                    updatePart(r.id, "cost", e.target.value)
                                  }
                                  className="w-full rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 px-2 py-1.5 text-center text-sm text-gray-900 dark:text-gray-100 focus:border-amber-500 focus:outline-none"
                                  title="Cout interne (non visible au client)"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={r.price}
                                  onChange={(e) =>
                                    updatePart(r.id, "price", e.target.value)
                                  }
                                  className="w-full rounded border border-gray-200 px-2 py-1.5 text-center text-sm focus:border-blue-500 focus:outline-none"
                                />
                              </td>
                              <td
                                className={`px-3 py-1.5 text-right text-sm font-medium ${margeColor}`}
                              >
                                {marge !== null ? `${marge}%` : "\u2014"}
                              </td>
                              <td className="px-3 py-1.5 text-right text-sm font-medium text-gray-900 dark:text-gray-100">
                                {fmt(r.qty * rPrice)}
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => removePart(r.id)}
                                  className="text-red-400 hover:text-red-600 text-lg leading-none"
                                  title="Supprimer"
                                >
                                  &times;
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        <tr
                          className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                          onClick={addPart}
                        >
                          <td colSpan={8} className="px-3 py-2 text-center text-xs text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400">
                            + Ajouter une piece
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
              </div>

              {/* ════════════ TOTAUX & OPTIONS ════════════ */}
              <div className="grid grid-cols-2 gap-6">
                {/* ── Left: discount, deposit, notes ── */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
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
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
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
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Notes (visible sur facture)
                    </label>
                    <textarea
                      rows={2}
                      value={form.notes}
                      onChange={(e) =>
                        setForm({ ...form, notes: e.target.value })
                      }
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-amber-700 dark:text-amber-400">
                      Notes internes (jamais imprime)
                    </label>
                    <textarea
                      rows={2}
                      value={form.notes_internes}
                      onChange={(e) =>
                        setForm({ ...form, notes_internes: e.target.value })
                      }
                      className="w-full rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>

                {/* ── Right: totals box ── */}
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Main d&apos;oeuvre</span>
                      <span className="font-medium">{fmt(totals.labourTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Pieces</span>
                      <span className="font-medium">{fmt(totals.partsTotal)}</span>
                    </div>
                    {margeGlobale !== null && (
                      <div className="flex justify-between text-xs">
                        <span className="text-amber-600">
                          Marge globale pieces
                        </span>
                        <span className="font-medium text-amber-600">
                          {margeGlobale}%
                        </span>
                      </div>
                    )}
                    <div className="border-t border-gray-300 dark:border-gray-600 pt-2 flex justify-between font-medium">
                      <span>Sous-total</span>
                      <span>{fmt(totals.sub)}</span>
                    </div>

                    {totals.disc > 0 && (
                      <div className="flex justify-between text-red-600 dark:text-red-400">
                        <span>
                          Rabais ({totals.discPct}% pieces)
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

                    <div className="border-t border-gray-300 dark:border-gray-600 pt-2 flex justify-between text-base font-bold">
                      <span>TOTAL</span>
                      <span>{fmt(totals.total)}</span>
                    </div>

                    {totals.dep > 0 && (
                      <>
                        <div className="flex justify-between text-gray-600">
                          <span>Acompte</span>
                          <span>-{fmt(totals.dep)}</span>
                        </div>
                        <div className="flex justify-between text-base font-bold text-blue-700 dark:text-blue-400">
                          <span>SOLDE DU</span>
                          <span>{fmt(totals.due)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Buttons ── */}
              <div className="flex justify-end gap-3 border-t border-gray-200 dark:border-gray-700 pt-4">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving
                    ? "Enregistrement..."
                    : editingFacture
                      ? "Enregistrer"
                      : "Creer la facture"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
