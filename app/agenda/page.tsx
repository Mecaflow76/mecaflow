"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

/* ───── Types ───── */
interface Client {
  id: string;
  nom: string;
  prenom: string;
}
interface Vehicule {
  id: string;
  client_id: string;
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
  statut: string;
  mecanicien: string;
  symptomes: string;
  chrono_segments?: ChronoSegment[];
  clients?: Client;
  vehicules?: Vehicule;
}
interface RendezVous {
  id: string;
  client_id: string;
  vehicule_id: string;
  date_rdv: string;
  heure: string;
  heure_fin: string;
  titre: string;
  statut: string;
  notes: string;
  clients?: Client;
}

/* ───── Constants ───── */
const HEURE_DEBUT = 7;
const HEURE_FIN = 19;
const TOTAL_MIN = (HEURE_FIN - HEURE_DEBUT) * 60;
const PX_MIN = 3;
const HAUTEUR = TOTAL_MIN * PX_MIN;
const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MOIS = [
  "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
];

const RDV_STATUTS = [
  { value: "en_attente", label: "En attente" },
  { value: "confirme", label: "Confirme" },
  { value: "termine", label: "Termine" },
  { value: "annule", label: "Annule" },
];

type ViewMode = "3days" | "week" | "month";

/* ───── Helpers ───── */
function heureEnMin(h: string | null): number | null {
  if (!h) return null;
  const [hh, mm] = h.split(":").map(Number);
  return hh * 60 + (mm || 0);
}

function getLundiSemaine(d: Date): Date {
  const result = new Date(d);
  const day = result.getDay();
  const diff = day === 0 ? 6 : day - 1;
  result.setDate(result.getDate() - diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function formatDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(d: Date): string {
  return `${d.getDate()} ${MOIS[d.getMonth()].slice(0, 3).toLowerCase()}`;
}

function getDayName(d: Date): string {
  return JOURS[(d.getDay() + 6) % 7];
}

function minEnHeure(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function snapTo15(min: number): number {
  return Math.round(min / 15) * 15;
}

interface DragState {
  rdvId: string;
  type: "top" | "bottom";
  startY: number;
  origDebutMin: number;
  origFinMin: number;
  currentHeure: string;
  currentHeureFin: string;
}

/* ───── Component ───── */
export default function AgendaPage() {
  const router = useRouter();
  const [dateRef, setDateRef] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [bons, setBons] = useState<BonTravail[]>([]);
  const [rdvs, setRdvs] = useState<RendezVous[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [vehicules, setVehicules] = useState<Vehicule[]>([]);
  const [loading, setLoading] = useState(true);

  /* RDV form */
  const [showRdvForm, setShowRdvForm] = useState(false);
  const [editingRdv, setEditingRdv] = useState<RendezVous | null>(null);
  const [rdvForm, setRdvForm] = useState({
    client_id: "",
    vehicule_id: "",
    date_rdv: "",
    heure: "09:00",
    heure_fin: "10:00",
    titre: "",
    statut: "en_attente",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  /* ── Drag resize ── */
  const dragRef = useRef<DragState | null>(null);
  const dragMoved = useRef(false);

  function handlePointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    rdvId: string,
    type: "top" | "bottom",
    debutMin: number,
    finMin: number
  ) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      rdvId,
      type,
      startY: e.clientY,
      origDebutMin: debutMin,
      origFinMin: finMin,
      currentHeure: minEnHeure(debutMin),
      currentHeureFin: minEnHeure(finMin),
    };
    dragMoved.current = false;
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    dragMoved.current = true;
    const dy = e.clientY - drag.startY;
    const dMin = snapTo15(dy / PX_MIN);

    if (drag.type === "top") {
      const newDebut = Math.max(
        HEURE_DEBUT * 60,
        Math.min(drag.origFinMin - 15, drag.origDebutMin + dMin)
      );
      drag.currentHeure = minEnHeure(newDebut);
    } else {
      const newFin = Math.min(
        HEURE_FIN * 60,
        Math.max(drag.origDebutMin + 15, drag.origFinMin + dMin)
      );
      drag.currentHeureFin = minEnHeure(newFin);
    }

    setRdvs((prev) =>
      prev.map((r) => {
        if (r.id !== drag.rdvId) return r;
        return {
          ...r,
          heure: drag.currentHeure,
          heure_fin: drag.currentHeureFin,
        };
      })
    );
  }

  async function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    dragRef.current = null;

    if (!dragMoved.current) {
      dragMoved.current = false;
      return;
    }

    await supabase
      .from("rendezvous")
      .update({
        heure: drag.currentHeure,
        heure_fin: drag.currentHeureFin,
      })
      .eq("id", drag.rdvId);

    dragMoved.current = false;
  }

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    const [bRes, rRes, cRes, vRes] = await Promise.all([
      supabase
        .from("bons_travail")
        .select("id, client_id, vehicule_id, date_creation, heure_debut, heure_fin, statut, mecanicien, symptomes, chrono_segments, clients(id, nom, prenom), vehicules(id, marque, modele, plaque)")
        .order("date_creation"),
      supabase
        .from("rendezvous")
        .select("id, client_id, vehicule_id, date_rdv, heure, heure_fin, titre, statut, notes, clients(id, nom, prenom)")
        .order("date_rdv"),
      supabase.from("clients").select("id, nom, prenom").order("nom"),
      supabase.from("vehicules").select("id, client_id, marque, modele, plaque").order("marque"),
    ]);
    setBons((bRes.data as unknown as BonTravail[]) || []);
    setRdvs((rRes.data as unknown as RendezVous[]) || []);
    setClients(cRes.data || []);
    setVehicules(vRes.data || []);
    setLoading(false);
  }

  /* ── Navigation ── */
  const visibleDays = useMemo(() => {
    if (viewMode === "3days") {
      const start = new Date(dateRef);
      start.setHours(0, 0, 0, 0);
      return Array.from({ length: 3 }, (_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        return d;
      });
    }
    const monday = getLundiSemaine(dateRef);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, [dateRef, viewMode]);

  const monthDays = useMemo(() => {
    if (viewMode !== "month") return [];
    const year = dateRef.getFullYear();
    const month = dateRef.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDay = getLundiSemaine(firstDay);
    const endDay = new Date(lastDay);
    const endDow = endDay.getDay();
    if (endDow !== 0) endDay.setDate(endDay.getDate() + (7 - endDow));
    const days: Date[] = [];
    const current = new Date(startDay);
    while (current <= endDay) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return days;
  }, [dateRef, viewMode]);

  const today = formatDateStr(new Date());
  const colCount = viewMode === "3days" ? 3 : 7;

  const titre = useMemo(() => {
    if (viewMode === "month") {
      return `${MOIS[dateRef.getMonth()]} ${dateRef.getFullYear()}`;
    }
    const days = visibleDays;
    if (days.length === 0) return "";
    const d1 = days[0];
    const d2 = days[days.length - 1];
    return `${formatDateLabel(d1)} \u2014 ${formatDateLabel(d2)} ${d2.getFullYear()}`;
  }, [viewMode, dateRef, visibleDays]);

  function goToday() {
    setDateRef(new Date());
  }
  function goPrev() {
    const d = new Date(dateRef);
    if (viewMode === "3days") d.setDate(d.getDate() - 3);
    else if (viewMode === "week") d.setDate(d.getDate() - 7);
    else d.setMonth(d.getMonth() - 1);
    setDateRef(d);
  }
  function goNext() {
    const d = new Date(dateRef);
    if (viewMode === "3days") d.setDate(d.getDate() + 3);
    else if (viewMode === "week") d.setDate(d.getDate() + 7);
    else d.setMonth(d.getMonth() + 1);
    setDateRef(d);
  }

  /* ── Get events for a day ── */
  const getBonsForDate = useCallback(
    (dateStr: string) =>
      bons.filter((b) => (b.date_creation || "").slice(0, 10) === dateStr),
    [bons]
  );

  const getRdvsForDate = useCallback(
    (dateStr: string) =>
      rdvs.filter((r) => (r.date_rdv || "").slice(0, 10) === dateStr),
    [rdvs]
  );

  /* ── RDV Form ── */
  function openNewRdv(dateStr?: string) {
    setEditingRdv(null);
    setRdvForm({
      client_id: "",
      vehicule_id: "",
      date_rdv: dateStr || formatDateStr(new Date()),
      heure: "09:00",
      heure_fin: "10:00",
      titre: "",
      statut: "en_attente",
      notes: "",
    });
    setShowRdvForm(true);
  }

  function openEditRdv(rdv: RendezVous) {
    setEditingRdv(rdv);
    setRdvForm({
      client_id: rdv.client_id || "",
      vehicule_id: rdv.vehicule_id || "",
      date_rdv: (rdv.date_rdv || "").slice(0, 10),
      heure: rdv.heure || "09:00",
      heure_fin: rdv.heure_fin || "10:00",
      titre: rdv.titre || "",
      statut: rdv.statut || "en_attente",
      notes: rdv.notes || "",
    });
    setShowRdvForm(true);
  }

  async function handleRdvSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      client_id: rdvForm.client_id || null,
      vehicule_id: rdvForm.vehicule_id || null,
      date_rdv: rdvForm.date_rdv,
      heure: rdvForm.heure,
      heure_fin: rdvForm.heure_fin,
      titre: rdvForm.titre,
      statut: rdvForm.statut,
      notes: rdvForm.notes,
    };
    if (editingRdv) {
      await supabase.from("rendezvous").update(payload).eq("id", editingRdv.id);
    } else {
      await supabase.from("rendezvous").insert(payload);
    }
    setSaving(false);
    setShowRdvForm(false);
    setEditingRdv(null);
    fetchAll();
  }

  async function handleRdvDelete() {
    if (!editingRdv) return;
    if (!confirm("Supprimer ce rendez-vous ?")) return;
    await supabase.from("rendezvous").delete().eq("id", editingRdv.id);
    setShowRdvForm(false);
    setEditingRdv(null);
    fetchAll();
  }

  /* ═══════════════════════ RENDER ═══════════════════════ */
  return (
    <div className="min-h-screen bg-background flex flex-col" style={{ height: "100vh" }}>
      {/* ── Nav bar ── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={goPrev}
            className="rounded-lg bg-gray-100 dark:bg-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            &larr;
          </button>
          <button
            onClick={goToday}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Aujourd&apos;hui
          </button>
          <button
            onClick={goNext}
            className="rounded-lg bg-gray-100 dark:bg-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            &rarr;
          </button>
        </div>

        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">{titre}</h1>

        <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
          {([
            { key: "3days" as ViewMode, label: "3 jours" },
            { key: "week" as ViewMode, label: "Semaine" },
            { key: "month" as ViewMode, label: "Mois" },
          ]).map((v) => (
            <button
              key={v.key}
              onClick={() => setViewMode(v.key)}
              className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                viewMode === v.key
                  ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <p className="text-center text-gray-500 dark:text-gray-400 py-12">Chargement...</p>
      )}

      {!loading && viewMode !== "month" && (
        <>
          {/* ── Day headers ── */}
          <div
            className="grid border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex-shrink-0"
            style={{ gridTemplateColumns: `44px repeat(${colCount}, 1fr)` }}
          >
            <div />
            {visibleDays.map((d, i) => {
              const ds = formatDateStr(d);
              const isToday = ds === today;
              return (
                <div
                  key={i}
                  className={`border-l border-gray-200 dark:border-gray-700 ${
                    isToday
                      ? "bg-blue-50 text-blue-700 font-bold"
                      : "text-gray-600 dark:text-gray-400"
                  }`}
                >
                  <div className="py-1.5 text-center">
                    <div className="text-xs">{getDayName(d)}</div>
                    <div className={`text-lg leading-tight ${isToday ? "text-blue-700" : "text-gray-900 dark:text-gray-100"}`}>
                      {d.getDate()}
                    </div>
                  </div>
                  <div className="flex border-t border-gray-200 dark:border-gray-700 text-[9px] font-semibold">
                    <div className="flex-1 text-center py-0.5 text-blue-600 bg-blue-50/50">
                      <button
                        onClick={() => openNewRdv(ds)}
                        className="hover:text-blue-800"
                        title="Ajouter un rendez-vous"
                      >
                        Prevu +
                      </button>
                    </div>
                    <div className="flex-1 text-center py-0.5 text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-900/20 border-l border-gray-200 dark:border-gray-700">Reel</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Timeline ── */}
          <div className="flex-1 overflow-y-auto">
            <div
              className="grid relative"
              style={{
                gridTemplateColumns: `44px repeat(${colCount}, 1fr)`,
                height: `${HAUTEUR}px`,
              }}
            >
              {/* Hour labels column */}
              <div className="relative">
                {Array.from({ length: HEURE_FIN - HEURE_DEBUT + 1 }, (_, i) => {
                  const h = HEURE_DEBUT + i;
                  return (
                    <div
                      key={h}
                      className="absolute text-[10px] text-gray-400 dark:text-gray-500 pr-1 text-right w-full"
                      style={{ top: `${i * 60 * PX_MIN}px` }}
                    >
                      {String(h).padStart(2, "0")}h
                    </div>
                  );
                })}
              </div>

              {/* Day columns */}
              {visibleDays.map((d, colIdx) => {
                const ds = formatDateStr(d);
                const isToday = ds === today;
                const dayBons = getBonsForDate(ds);
                const dayRdvs = getRdvsForDate(ds);

                return (
                  <div
                    key={colIdx}
                    className="relative border-l border-gray-200 dark:border-gray-700"
                    style={{
                      height: `${HAUTEUR}px`,
                      background: isToday
                        ? "rgba(59, 130, 246, 0.03)"
                        : undefined,
                    }}
                  >
                    {/* Gridlines */}
                    {Array.from(
                      { length: HEURE_FIN - HEURE_DEBUT + 1 },
                      (_, i) => (
                        <div
                          key={i}
                          className="absolute left-0 right-0 border-t border-gray-100"
                          style={{ top: `${i * 60 * PX_MIN}px` }}
                        />
                      )
                    )}

                    {/* Ligne de separation verticale au milieu */}
                    <div
                      className="absolute top-0 bottom-0 border-l border-gray-200/60 dark:border-gray-700/60"
                      style={{ left: "50%" }}
                    />

                    {/* Bons de travail (doré) — MOITIE DROITE — un bloc par segment chrono */}
                    {dayBons.map((bon) => {
                      const clientName = bon.clients
                        ? `${bon.clients.prenom} ${bon.clients.nom}`
                        : `Bon`;
                      const vehicleName = bon.vehicules
                        ? `${bon.vehicules.marque} ${bon.vehicules.modele}`
                        : "";

                      // Si chrono_segments existe et a des entrees, afficher un bloc par segment
                      const segments = bon.chrono_segments && bon.chrono_segments.length > 0
                        ? bon.chrono_segments.filter((seg) => seg.debut && seg.fin)
                        : null;

                      if (segments) {
                        return segments.map((seg, segIdx) => {
                          const debut = heureEnMin(seg.debut) ?? HEURE_DEBUT * 60;
                          const fin = heureEnMin(seg.fin) ?? debut + 30;
                          const top = (debut - HEURE_DEBUT * 60) * PX_MIN;
                          const haut = Math.max(20, (fin - debut) * PX_MIN);

                          return (
                            <div
                              key={`b-${bon.id}-s${segIdx}`}
                              className="absolute rounded px-1 py-0.5 overflow-hidden cursor-pointer hover:opacity-90"
                              style={{
                                top: `${top}px`,
                                height: `${haut}px`,
                                left: "calc(50% + 2px)",
                                right: "2px",
                                background: "rgba(234,179,8,0.18)",
                                borderLeft: "3px solid #eab308",
                                fontSize: "10px",
                                lineHeight: "1.3",
                              }}
                              title={`${clientName} — ${vehicleName}\n${seg.debut} - ${seg.fin}\n${bon.symptomes || ""}`}
                              onClick={() => router.push(`/bons-travail?edit_id=${bon.id}`)}
                            >
                              <div className="font-semibold text-amber-800 truncate">
                                {clientName}
                              </div>
                              {haut > 30 && (
                                <div className="text-amber-500 truncate text-[10px]">
                                  {seg.debut} - {seg.fin}
                                </div>
                              )}
                              {haut > 45 && vehicleName && (
                                <div className="text-amber-600 truncate text-[10px]">
                                  {vehicleName}
                                </div>
                              )}
                            </div>
                          );
                        });
                      }

                      // Fallback: pas de segments, afficher un seul bloc (ancien comportement)
                      const debut = heureEnMin(bon.heure_debut) ?? HEURE_DEBUT * 60;
                      const fin = heureEnMin(bon.heure_fin) ?? debut + 60;
                      const top = (debut - HEURE_DEBUT * 60) * PX_MIN;
                      const haut = Math.max(24, (fin - debut) * PX_MIN);

                      return (
                        <div
                          key={`b-${bon.id}`}
                          className="absolute rounded px-1 py-0.5 overflow-hidden cursor-pointer hover:opacity-90"
                          style={{
                            top: `${top}px`,
                            height: `${haut}px`,
                            left: "calc(50% + 2px)",
                            right: "2px",
                            background: "rgba(234,179,8,0.15)",
                            borderLeft: "3px solid #eab308",
                            fontSize: "10px",
                            lineHeight: "1.3",
                          }}
                          title={`${clientName} — ${vehicleName}\n${bon.symptomes || ""}`}
                          onClick={() => router.push(`/bons-travail?edit_id=${bon.id}`)}
                        >
                          <div className="font-semibold text-amber-800 truncate">
                            {clientName}
                          </div>
                          {haut > 35 && vehicleName && (
                            <div className="text-amber-600 truncate text-[10px]">
                              {vehicleName}
                            </div>
                          )}
                          {haut > 50 && bon.symptomes && (
                            <div className="text-amber-500 truncate text-[10px]">
                              {bon.symptomes}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Rendez-vous (bleu) — MOITIE GAUCHE — avec drag resize */}
                    {dayRdvs.map((rdv) => {
                      const debutMin =
                        heureEnMin(rdv.heure) ?? HEURE_DEBUT * 60;
                      const finMin =
                        heureEnMin(rdv.heure_fin) ?? debutMin + 60;
                      const top = (debutMin - HEURE_DEBUT * 60) * PX_MIN;
                      const haut = Math.max(24, (finMin - debutMin) * PX_MIN);
                      const clientName = rdv.clients
                        ? `${rdv.clients.prenom} ${rdv.clients.nom}`
                        : "";

                      return (
                        <div
                          key={`r-${rdv.id}`}
                          className="absolute rounded overflow-hidden cursor-pointer hover:opacity-90 select-none"
                          style={{
                            top: `${top}px`,
                            height: `${haut}px`,
                            left: "2px",
                            right: "calc(50% + 2px)",
                            background: "rgba(59,130,246,0.15)",
                            borderLeft: "3px solid #3b82f6",
                            fontSize: "10px",
                            lineHeight: "1.3",
                          }}
                          title={`${rdv.titre || "RDV"} (${rdv.heure || ""} - ${rdv.heure_fin || ""})\n${clientName}\n${rdv.notes || ""}`}
                          onClick={() => {
                            if (!dragMoved.current) openEditRdv(rdv);
                          }}
                        >
                          {/* Handle haut (resize heure debut) */}
                          <div
                            className="absolute top-0 left-0 right-0 hover:bg-blue-400/50 touch-none"
                            style={{ height: "10px", cursor: "ns-resize", zIndex: 10 }}
                            onPointerDown={(e) =>
                              handlePointerDown(e, rdv.id, "top", debutMin, finMin)
                            }
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                          >
                            <div className="mx-auto mt-1 pointer-events-none" style={{ width: "20px", height: "3px", borderRadius: "2px", background: "rgba(59,130,246,0.4)" }} />
                          </div>

                          <div className="px-1.5 pt-2.5 pb-2.5 pointer-events-none" style={{ position: "relative", zIndex: 1 }}>
                            <div className="font-semibold text-blue-800 truncate">
                              {rdv.titre || "Rendez-vous"}
                            </div>
                            {haut > 40 && clientName && (
                              <div className="text-blue-600 truncate text-[10px]">
                                {clientName}
                              </div>
                            )}
                            {haut > 55 && (
                              <div className="text-blue-500 truncate text-[10px]">
                                {rdv.heure} - {rdv.heure_fin}
                              </div>
                            )}
                          </div>

                          {/* Handle bas (resize heure fin) */}
                          <div
                            className="absolute bottom-0 left-0 right-0 hover:bg-blue-400/50 touch-none"
                            style={{ height: "10px", cursor: "ns-resize", zIndex: 10 }}
                            onPointerDown={(e) =>
                              handlePointerDown(e, rdv.id, "bottom", debutMin, finMin)
                            }
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                          >
                            <div className="pointer-events-none mx-auto" style={{ width: "20px", height: "3px", borderRadius: "2px", background: "rgba(59,130,246,0.4)", position: "absolute", bottom: "3px", left: "50%", transform: "translateX(-50%)" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ── Vue mensuelle ── */}
      {!loading && viewMode === "month" && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden">
            {/* En-têtes jours */}
            {JOURS.map((j) => (
              <div key={j} className="bg-gray-50 dark:bg-gray-800 text-center py-2 text-xs font-semibold text-gray-600 dark:text-gray-400">
                {j}
              </div>
            ))}
            {/* Cellules jours */}
            {monthDays.map((d, i) => {
              const ds = formatDateStr(d);
              const isToday = ds === today;
              const isCurrentMonth = d.getMonth() === dateRef.getMonth();
              const dayBons = getBonsForDate(ds);
              const dayRdvs = getRdvsForDate(ds);
              return (
                <div
                  key={i}
                  className={`min-h-[100px] p-1.5 ${
                    isCurrentMonth
                      ? "bg-white dark:bg-gray-800"
                      : "bg-gray-50/50 dark:bg-gray-800/50"
                  } ${isToday ? "ring-2 ring-blue-500 ring-inset" : ""}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-xs font-medium ${
                        isToday
                          ? "bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center"
                          : isCurrentMonth
                            ? "text-gray-700 dark:text-gray-300"
                            : "text-gray-400 dark:text-gray-600"
                      }`}
                    >
                      {d.getDate()}
                    </span>
                    {isCurrentMonth && (
                      <button
                        onClick={() => openNewRdv(ds)}
                        className="text-blue-500 hover:text-blue-700 text-xs font-bold leading-none"
                        title="Ajouter un rendez-vous"
                      >
                        +
                      </button>
                    )}
                  </div>
                  {dayRdvs.map((rdv) => (
                    <div
                      key={`r-${rdv.id}`}
                      className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded px-1 py-0.5 mb-0.5 truncate cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-900/50"
                      onClick={() => openEditRdv(rdv)}
                      title={`${rdv.titre} (${rdv.heure} - ${rdv.heure_fin})`}
                    >
                      {rdv.heure?.slice(0, 5)} {rdv.titre || "RDV"}
                    </div>
                  ))}
                  {dayBons.map((bon) => {
                    const clientName = bon.clients
                      ? `${bon.clients.prenom} ${bon.clients.nom}`
                      : "Bon";
                    return (
                      <div
                        key={`b-${bon.id}`}
                        className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded px-1 py-0.5 mb-0.5 truncate cursor-pointer hover:bg-amber-200 dark:hover:bg-amber-900/50"
                        onClick={() => router.push(`/bons-travail?edit_id=${bon.id}`)}
                        title={clientName}
                      >
                        {bon.heure_debut?.slice(0, 5)} {clientName}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════════════ MODAL RDV ═══════════════════ */}
      {showRdvForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-gray-800 p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
              {editingRdv ? "Modifier le rendez-vous" : "Nouveau rendez-vous"}
            </h2>

            <form onSubmit={handleRdvSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Titre *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Changement huile, Inspection..."
                  value={rdvForm.titre}
                  onChange={(e) =>
                    setRdvForm({ ...rdvForm, titre: e.target.value })
                  }
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Client
                  </label>
                  <select
                    value={rdvForm.client_id}
                    onChange={(e) =>
                      setRdvForm({ ...rdvForm, client_id: e.target.value, vehicule_id: "" })
                    }
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">-- Aucun --</option>
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
                    value={rdvForm.vehicule_id}
                    onChange={(e) =>
                      setRdvForm({ ...rdvForm, vehicule_id: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">-- Aucun --</option>
                    {(rdvForm.client_id
                      ? vehicules.filter((v) => v.client_id === rdvForm.client_id)
                      : vehicules
                    ).map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.marque} {v.modele} {v.plaque ? `(${v.plaque})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Statut
                </label>
                <select
                  value={rdvForm.statut}
                  onChange={(e) =>
                    setRdvForm({ ...rdvForm, statut: e.target.value })
                  }
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {RDV_STATUTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={rdvForm.date_rdv}
                    onChange={(e) =>
                      setRdvForm({ ...rdvForm, date_rdv: e.target.value })
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
                    value={rdvForm.heure}
                    onChange={(e) =>
                      setRdvForm({ ...rdvForm, heure: e.target.value })
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
                    value={rdvForm.heure_fin}
                    onChange={(e) =>
                      setRdvForm({ ...rdvForm, heure_fin: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={rdvForm.notes}
                  onChange={(e) =>
                    setRdvForm({ ...rdvForm, notes: e.target.value })
                  }
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-between pt-2">
                <div>
                  {editingRdv && (
                    <button
                      type="button"
                      onClick={handleRdvDelete}
                      className="rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100"
                    >
                      Supprimer
                    </button>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowRdvForm(false);
                      setEditingRdv(null);
                    }}
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
                      ? "..."
                      : editingRdv
                        ? "Enregistrer"
                        : "Creer"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
