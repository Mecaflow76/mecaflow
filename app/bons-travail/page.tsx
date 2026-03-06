"use client";

import { Suspense, useEffect, useState, useRef, useCallback } from "react";
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
}

interface ChronoSegment {
  debut: string;
  fin: string;
}

interface BonTravail {
  id: string;
  client_id: string;
  vehicule_id: string;
  date_creation: string;
  heure_debut: string;
  heure_fin: string;
  km: string;
  statut: string;
  mecanicien: string;
  symptomes: string;
  diagnostic: string;
  travaux: string;
  notes: string;
  chrono_ms: number;
  chrono_segments: ChronoSegment[];
  clients?: Client;
  vehicules?: Vehicule;
}

/* ───── Constants ───── */
const STATUTS = [
  { value: "ouvert", label: "Ouvert", color: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400" },
  { value: "en_cours", label: "En cours", color: "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400" },
  { value: "attente_pieces", label: "Attente pieces", color: "bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-400" },
  { value: "complete", label: "Complete", color: "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400" },
  { value: "annule", label: "Annule", color: "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400" },
];

const emptyForm = {
  client_id: "",
  vehicule_id: "",
  date_creation: new Date().toISOString().split("T")[0],
  heure_debut: "08:00",
  heure_fin: "17:00",
  km: "",
  statut: "ouvert",
  mecanicien: "",
  symptomes: "",
  diagnostic: "",
  travaux: "",
  notes: "",
};

/* ───── Chrono helpers ───── */
function chronoDisplay(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return (
    String(h).padStart(2, "0") +
    ":" +
    String(m).padStart(2, "0") +
    ":" +
    String(s).padStart(2, "0")
  );
}

type ChronoState = "idle" | "running" | "paused" | "stopped";

/* ───── Component ───── */
export default function BonsTravailPageWrapper() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500 dark:text-gray-400">Chargement...</div>}>
      <BonsTravailPage />
    </Suspense>
  );
}

function BonsTravailPage() {
  const searchParams = useSearchParams();
  const [bons, setBons] = useState<BonTravail[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [vehicules, setVehicules] = useState<Vehicule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatut, setFilterStatut] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingBon, setEditingBon] = useState<BonTravail | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  /* ── Auto-open form from URL params ── */
  const didAutoOpen = useRef(false);
  useEffect(() => {
    if (didAutoOpen.current) return;
    const clientId = searchParams.get("client_id");
    const vehiculeId = searchParams.get("vehicule_id");
    if (clientId || vehiculeId) {
      didAutoOpen.current = true;
      setEditingBon(null);
      setForm({
        ...emptyForm,
        client_id: clientId || "",
        vehicule_id: vehiculeId || "",
      });
      setShowForm(true);
    }
  }, [searchParams]);

  /* ── Auto-open bon for editing from edit_id param ── */
  const didAutoEdit = useRef(false);
  useEffect(() => {
    if (didAutoEdit.current || loading) return;
    const editId = searchParams.get("edit_id");
    if (editId && bons.length > 0) {
      const bon = bons.find((b) => b.id === editId);
      if (bon) {
        didAutoEdit.current = true;
        openEdit(bon);
      }
    }
  }, [searchParams, bons, loading]);

  /* ── Chrono state ── */
  const [chronoState, setChronoState] = useState<ChronoState>("idle");
  const [chronoDisplayMs, setChronoDisplayMs] = useState(0);
  const chronoElapsed = useRef(0);
  const chronoStartTs = useRef<number | null>(null);
  const chronoInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const segmentsRef = useRef<ChronoSegment[]>([]);

  const chronoTick = useCallback(() => {
    const total =
      chronoElapsed.current +
      (chronoStartTs.current ? Date.now() - chronoStartTs.current : 0);
    setChronoDisplayMs(total);
  }, []);

  function nowHHMM(): string {
    const d = new Date();
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function closeCurrentSegment() {
    const now = nowHHMM();
    const segs = segmentsRef.current;
    if (segs.length > 0 && !segs[segs.length - 1].fin) {
      segs[segs.length - 1].fin = now;
    }
    return [...segs];
  }

  function saveSegments(segs: ChronoSegment[], extra: Record<string, unknown> = {}) {
    if (editingBon) {
      supabase
        .from("bons_travail")
        .update({ chrono_segments: segs, ...extra })
        .eq("id", editingBon.id)
        .then();
    }
  }

  function chronoStart() {
    chronoStartTs.current = Date.now();
    chronoInterval.current = setInterval(chronoTick, 1000);
    setChronoState("running");

    // Nouveau segment ouvert
    const now = nowHHMM();
    segmentsRef.current.push({ debut: now, fin: "" });

    // Premier segment = heure_debut du bon
    const isFirst = segmentsRef.current.length === 1;
    if (isFirst) {
      setForm((prev) => ({ ...prev, heure_debut: now, statut: "en_cours" }));
    } else {
      setForm((prev) => ({ ...prev, statut: "en_cours" }));
    }

    saveSegments([...segmentsRef.current], {
      ...(isFirst ? { heure_debut: now } : {}),
      statut: "en_cours",
    });
  }

  function chronoPause() {
    if (chronoInterval.current) clearInterval(chronoInterval.current);
    if (chronoStartTs.current) {
      chronoElapsed.current += Date.now() - chronoStartTs.current;
    }
    chronoStartTs.current = null;
    setChronoDisplayMs(chronoElapsed.current);
    setChronoState("paused");

    // Fermer le segment en cours
    const segs = closeCurrentSegment();
    segmentsRef.current = segs;
    saveSegments(segs, { chrono_ms: chronoElapsed.current });
  }

  function chronoResume() {
    chronoStartTs.current = Date.now();
    chronoInterval.current = setInterval(chronoTick, 1000);
    setChronoState("running");

    // Nouveau segment ouvert
    const now = nowHHMM();
    segmentsRef.current.push({ debut: now, fin: "" });
    setForm((prev) => ({ ...prev, statut: "en_cours" }));
    saveSegments([...segmentsRef.current], { statut: "en_cours" });
  }

  function chronoStop() {
    if (chronoInterval.current) clearInterval(chronoInterval.current);
    const total =
      chronoElapsed.current +
      (chronoStartTs.current ? Date.now() - chronoStartTs.current : 0);
    chronoElapsed.current = total;
    chronoStartTs.current = null;
    setChronoDisplayMs(total);
    setChronoState("stopped");

    // Fermer le segment en cours + mettre heure_fin
    const now = nowHHMM();
    const segs = closeCurrentSegment();
    segmentsRef.current = segs;
    setForm((prev) => ({ ...prev, heure_fin: now }));
    saveSegments(segs, { heure_fin: now, chrono_ms: total });
  }

  function chronoReset() {
    if (chronoInterval.current) clearInterval(chronoInterval.current);
    chronoElapsed.current = 0;
    chronoStartTs.current = null;
    setChronoDisplayMs(0);
    setChronoState("idle");
  }

  function chronoResetSilent() {
    if (chronoInterval.current) clearInterval(chronoInterval.current);
    chronoElapsed.current = 0;
    chronoStartTs.current = null;
    setChronoDisplayMs(0);
  }

  function getChronoMs(): number {
    return (
      chronoElapsed.current +
      (chronoStartTs.current ? Date.now() - chronoStartTs.current : 0)
    );
  }

  /* ── Fetch ── */
  useEffect(() => {
    fetchBons();
    fetchClients();
    fetchVehicules();
  }, []);

  async function fetchBons() {
    setLoading(true);
    const { data, error } = await supabase
      .from("bons_travail")
      .select(
        "*, chrono_segments, clients(id, nom, prenom), vehicules(id, marque, modele, plaque)"
      )
      .order("date_creation", { ascending: false });

    if (error) setError(error.message);
    else setBons(data || []);
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
      .select("id, marque, modele, plaque")
      .order("marque");
    setVehicules(data || []);
  }

  /* ── Open / Close ── */
  function openNew() {
    setEditingBon(null);
    setForm(emptyForm);
    chronoResetSilent();
    segmentsRef.current = [];
    setChronoState("idle");
    setChronoDisplayMs(0);
    setShowForm(true);
  }

  function openEdit(bon: BonTravail) {
    setEditingBon(bon);
    setForm({
      client_id: bon.client_id || "",
      vehicule_id: bon.vehicule_id || "",
      date_creation: bon.date_creation || "",
      heure_debut: bon.heure_debut || "08:00",
      heure_fin: bon.heure_fin || "17:00",
      km: bon.km || "",
      statut: bon.statut || "ouvert",
      mecanicien: bon.mecanicien || "",
      symptomes: bon.symptomes || "",
      diagnostic: bon.diagnostic || "",
      travaux: bon.travaux || "",
      notes: bon.notes || "",
    });

    // Restore chrono + segments
    chronoResetSilent();
    segmentsRef.current = bon.chrono_segments || [];
    const ms = bon.chrono_ms || 0;
    if (ms > 0) {
      chronoElapsed.current = ms;
      setChronoDisplayMs(ms);
      setChronoState("paused"); // Show Resume + Reset
    } else {
      setChronoState("idle");
      setChronoDisplayMs(0);
    }

    setShowForm(true);
  }

  function closeForm() {
    chronoResetSilent();
    segmentsRef.current = [];
    setChronoState("idle");
    setChronoDisplayMs(0);
    setShowForm(false);
    setEditingBon(null);
    setForm(emptyForm);
  }

  /* ── Submit ── */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload = {
      client_id: form.client_id || null,
      vehicule_id: form.vehicule_id || null,
      date_creation: form.date_creation,
      heure_debut: form.heure_debut,
      heure_fin: form.heure_fin,
      km: form.km,
      statut: form.statut,
      mecanicien: form.mecanicien,
      symptomes: form.symptomes,
      diagnostic: form.diagnostic,
      travaux: form.travaux,
      notes: form.notes,
      chrono_ms: getChronoMs(),
      chrono_segments: segmentsRef.current,
    };

    if (editingBon) {
      const { error } = await supabase
        .from("bons_travail")
        .update(payload)
        .eq("id", editingBon.id);
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.from("bons_travail").insert(payload);
      if (error) setError(error.message);
    }

    setSaving(false);
    closeForm();
    fetchBons();
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer ce bon de travail ?")) return;
    const { error } = await supabase
      .from("bons_travail")
      .delete()
      .eq("id", id);
    if (error) setError(error.message);
    else fetchBons();
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
      <span className="text-gray-500 dark:text-gray-400">{statut}</span>
    );
  }

  const filteredBons = bons.filter((bon) => {
    const term = search.toLowerCase();
    const clientName = bon.clients
      ? `${bon.clients.nom} ${bon.clients.prenom}`.toLowerCase()
      : "";
    const vehiculeName = bon.vehicules
      ? `${bon.vehicules.marque} ${bon.vehicules.modele}`.toLowerCase()
      : "";
    const matchSearch =
      clientName.includes(term) ||
      vehiculeName.includes(term) ||
      bon.symptomes?.toLowerCase().includes(term) ||
      bon.travaux?.toLowerCase().includes(term) ||
      bon.mecanicien?.toLowerCase().includes(term) ||
      bon.date_creation?.includes(term);
    const matchStatut = !filterStatut || bon.statut === filterStatut;
    return matchSearch && matchStatut;
  });

  /* ═══════════════════════ RENDER ═══════════════════════ */
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-foreground">
              Bons de travail
            </h1>
            <span className="rounded-full bg-blue-100 dark:bg-blue-900/30 px-3 py-1 text-sm font-medium text-blue-800 dark:text-blue-400">
              {filteredBons.length} bon{filteredBons.length !== 1 && "s"}
            </span>
          </div>
          <button
            onClick={openNew}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            + Nouveau bon
          </button>
        </div>

        <div className="mb-6 flex gap-4">
          <input
            type="text"
            placeholder="Rechercher par client, vehicule, symptomes, travaux..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <select
            value={filterStatut}
            onChange={(e) => setFilterStatut(e.target.value)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Tous les statuts</option>
            {STATUTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {loading && (
          <p className="py-12 text-center text-gray-500 dark:text-gray-400">Chargement...</p>
        )}

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/30 p-4 text-sm text-red-600 dark:text-red-400">
            Erreur : {error}
          </div>
        )}

        {!loading && !error && filteredBons.length === 0 && (
          <p className="py-12 text-center text-gray-500 dark:text-gray-400">
            Aucun bon de travail trouve.
          </p>
        )}

        {!loading && !error && filteredBons.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900 text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Client</th>
                  <th className="px-6 py-3">Vehicule</th>
                  <th className="px-6 py-3">Mecanicien</th>
                  <th className="px-6 py-3">Symptomes</th>
                  <th className="px-6 py-3">Statut</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredBons.map((bon) => (
                  <tr
                    key={bon.id}
                    className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                    onClick={() => openEdit(bon)}
                  >
                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">
                      {bon.date_creation}
                    </td>
                    <td className="px-6 py-4 text-gray-700 dark:text-gray-300">
                      {bon.clients
                        ? `${bon.clients.nom} ${bon.clients.prenom}`
                        : "\u2014"}
                    </td>
                    <td className="px-6 py-4 text-gray-700 dark:text-gray-300">
                      {bon.vehicules
                        ? `${bon.vehicules.marque} ${bon.vehicules.modele}`
                        : "\u2014"}
                    </td>
                    <td className="px-6 py-4 text-gray-700 dark:text-gray-300">
                      {bon.mecanicien || "\u2014"}
                    </td>
                    <td className="px-6 py-4 text-gray-500 dark:text-gray-400 text-xs max-w-[200px] truncate">
                      {bon.symptomes || "\u2014"}
                    </td>
                    <td className="px-6 py-4">
                      {getStatutBadge(bon.statut)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(bon);
                        }}
                        className="mr-3 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium"
                      >
                        Modifier
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(bon.id);
                        }}
                        className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm font-medium"
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

      {/* ═══════════════════ MODAL ═══════════════════ */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-2xl rounded-xl bg-white dark:bg-gray-800 p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="mb-6 text-lg font-semibold text-gray-900 dark:text-gray-100">
              {editingBon
                ? "Modifier le bon de travail"
                : "Nouveau bon de travail"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Client & Vehicule */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Client
                  </label>
                  <select
                    required
                    value={form.client_id}
                    onChange={(e) =>
                      setForm({ ...form, client_id: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">-- Selectionner --</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom} {c.prenom}
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
                    {vehicules.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.marque} {v.modele}{" "}
                        {v.plaque ? `\u2014 ${v.plaque}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Date, heures, km */}
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    value={form.date_creation}
                    onChange={(e) =>
                      setForm({ ...form, date_creation: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Heure debut
                  </label>
                  <input
                    type="time"
                    value={form.heure_debut}
                    onChange={(e) =>
                      setForm({ ...form, heure_debut: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Heure fin
                  </label>
                  <input
                    type="time"
                    value={form.heure_fin}
                    onChange={(e) =>
                      setForm({ ...form, heure_fin: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Kilometrage
                  </label>
                  <input
                    type="text"
                    value={form.km}
                    onChange={(e) =>
                      setForm({ ...form, km: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Mecanicien & Statut */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Mecanicien
                  </label>
                  <input
                    type="text"
                    value={form.mecanicien}
                    onChange={(e) =>
                      setForm({ ...form, mecanicien: e.target.value })
                    }
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
              </div>

              {/* ════════════ CHRONOMETRE ════════════ */}
              <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4">
                <label className="mb-2 block text-sm font-semibold text-blue-800 dark:text-blue-400">
                  Chronometre
                </label>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-mono text-2xl font-black text-blue-600 min-w-[100px]">
                    {chronoDisplay(chronoDisplayMs)}
                  </span>

                  {/* Idle: show Start */}
                  {chronoState === "idle" && (
                    <button
                      type="button"
                      onClick={chronoStart}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      Demarrer
                    </button>
                  )}

                  {/* Running: show Pause + Figer */}
                  {chronoState === "running" && (
                    <>
                      <button
                        type="button"
                        onClick={chronoPause}
                        className="rounded-lg bg-gray-200 dark:bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                      >
                        Pause
                      </button>
                      <button
                        type="button"
                        onClick={chronoStop}
                        className="rounded-lg bg-red-100 dark:bg-red-900/30 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50"
                      >
                        Figer
                      </button>
                    </>
                  )}

                  {/* Paused: show Resume + Figer + Reset */}
                  {chronoState === "paused" && (
                    <>
                      <button
                        type="button"
                        onClick={chronoResume}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                      >
                        Reprendre
                      </button>
                      <button
                        type="button"
                        onClick={chronoStop}
                        className="rounded-lg bg-red-100 dark:bg-red-900/30 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50"
                      >
                        Figer
                      </button>
                      <button
                        type="button"
                        onClick={chronoReset}
                        className="rounded-lg bg-gray-200 dark:bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                      >
                        Reset
                      </button>
                    </>
                  )}

                  {/* Stopped: show Reset */}
                  {chronoState === "stopped" && (
                    <button
                      type="button"
                      onClick={chronoReset}
                      className="rounded-lg bg-gray-200 dark:bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                    >
                      Reset
                    </button>
                  )}
                </div>

                {/* Status message */}
                {chronoState === "stopped" && (
                  <p className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                    Temps fige — sauvegarde avec le bon
                  </p>
                )}
                {chronoState === "paused" &&
                  editingBon &&
                  chronoDisplayMs > 0 && (
                    <p className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                      {chronoDisplay(chronoDisplayMs)} — Cliquez Reprendre pour
                      continuer
                    </p>
                  )}
              </div>

              <hr className="border-gray-200 dark:border-gray-700" />

              {/* Symptomes */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Symptomes / Plainte du client
                </label>
                <textarea
                  value={form.symptomes}
                  onChange={(e) =>
                    setForm({ ...form, symptomes: e.target.value })
                  }
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Diagnostic */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Diagnostic
                </label>
                <textarea
                  value={form.diagnostic}
                  onChange={(e) =>
                    setForm({ ...form, diagnostic: e.target.value })
                  }
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Travaux */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Travaux effectues
                </label>
                <textarea
                  value={form.travaux}
                  onChange={(e) =>
                    setForm({ ...form, travaux: e.target.value })
                  }
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Notes
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) =>
                    setForm({ ...form, notes: e.target.value })
                  }
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
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
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving
                    ? "Enregistrement..."
                    : editingBon
                      ? "Enregistrer"
                      : "Creer le bon"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
