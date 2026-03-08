"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";

/* ───── Types ───── */
interface Client {
  id: string;
  nom: string;
  prenom: string;
}
interface Facture {
  id: string;
  client_id: string;
  vehicule_id: string;
  date_facture: string;
  montant_total: number;
  statut: string;
  labour_rows: LabourRow[] | null;
  parts_rows: PartRow[] | null;
  discount_pct: number;
}
interface LabourRow {
  desc: string;
  qty: number;
  rate: number;
}
interface PartRow {
  desc: string;
  num: string;
  qty: number;
  cost: number;
  price: number;
}

/* ───── Helpers ───── */
const fmt = (n: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(n);

function getWeekRange(): [string, string] {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return [monday.toISOString().slice(0, 10), sunday.toISOString().slice(0, 10)];
}

function getMonthRange(): [string, string] {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}

function getYearRange(): [string, string] {
  const y = new Date().getFullYear();
  return [`${y}-01-01`, `${y}-12-31`];
}

function getPrevPeriodRange(
  period: Period,
  from: string,
  to: string
): [string, string] {
  if (period === "semaine") {
    const f = new Date(from);
    f.setDate(f.getDate() - 7);
    const t = new Date(to);
    t.setDate(t.getDate() - 7);
    return [f.toISOString().slice(0, 10), t.toISOString().slice(0, 10)];
  }
  if (period === "mois") {
    const f = new Date(from);
    f.setMonth(f.getMonth() - 1);
    const t = new Date(to);
    t.setMonth(t.getMonth() - 1);
    return [f.toISOString().slice(0, 10), t.toISOString().slice(0, 10)];
  }
  if (period === "annee") {
    const f = new Date(from);
    f.setFullYear(f.getFullYear() - 1);
    const t = new Date(to);
    t.setFullYear(t.getFullYear() - 1);
    return [f.toISOString().slice(0, 10), t.toISOString().slice(0, 10)];
  }
  // custom: même durée, décalée avant
  const fd = new Date(from);
  const td = new Date(to);
  const dur = td.getTime() - fd.getTime();
  const prevEnd = new Date(fd.getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - dur);
  return [prevStart.toISOString().slice(0, 10), prevEnd.toISOString().slice(0, 10)];
}

type Period = "semaine" | "mois" | "annee" | "custom";

/* ───── Icon Components ───── */
function IconDollar() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M12 3v3m0 12v3" />
    </svg>
  );
}

function IconReceipt() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function IconDocuments() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconWrench() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75a4.5 4.5 0 01-4.884 4.484c-1.076-.091-2.264.071-2.95.904l-7.152 8.684a2.548 2.548 0 11-3.586-3.586l8.684-7.152c.833-.686.995-1.874.904-2.95a4.5 4.5 0 016.336-4.486l-3.276 3.276a3.004 3.004 0 002.25 2.25l3.276-3.276c.256.565.398 1.192.398 1.852z" />
    </svg>
  );
}

/* ═══════════════════════ Component ═══════════════════════ */
export default function RapportsPage() {
  const [factures, setFactures] = useState<Facture[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("mois");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    const [fRes, cRes] = await Promise.all([
      supabase
        .from("factures")
        .select("id, client_id, vehicule_id, date_facture, montant_total, statut, labour_rows, parts_rows, discount_pct")
        .order("date_facture", { ascending: false }),
      supabase.from("clients").select("id, nom, prenom"),
    ]);
    setFactures(fRes.data || []);
    setClients(cRes.data || []);
    setLoading(false);
  }

  /* ── Période courante ── */
  const [dateFrom, dateTo] = useMemo(() => {
    if (period === "semaine") return getWeekRange();
    if (period === "mois") return getMonthRange();
    if (period === "annee") return getYearRange();
    return [customFrom, customTo];
  }, [period, customFrom, customTo]);

  const filtered = useMemo(() => {
    if (!dateFrom || !dateTo) return factures;
    return factures.filter(
      (f) => f.date_facture >= dateFrom && f.date_facture <= dateTo
    );
  }, [factures, dateFrom, dateTo]);

  /* ── Période précédente ── */
  const [prevFrom, prevTo] = useMemo(() => {
    if (!dateFrom || !dateTo) return ["", ""];
    return getPrevPeriodRange(period, dateFrom, dateTo);
  }, [period, dateFrom, dateTo]);

  const prevFiltered = useMemo(() => {
    if (!prevFrom || !prevTo) return [];
    return factures.filter(
      (f) => f.date_facture >= prevFrom && f.date_facture <= prevTo
    );
  }, [factures, prevFrom, prevTo]);

  /* ── Stats courantes ── */
  const stats = useMemo(() => {
    const payees = filtered.filter((f) => f.statut === "payee");
    const nonPayees = filtered.filter(
      (f) => f.statut !== "payee" && f.statut !== "annulee"
    );
    const revenus = payees.reduce((s, f) => s + (f.montant_total || 0), 0);
    const totalFacture = filtered.reduce(
      (s, f) => s + (f.montant_total || 0),
      0
    );
    const totalMO = filtered.reduce((s, f) => {
      const rows = f.labour_rows || [];
      return s + rows.reduce((ss, r) => ss + (r.qty || 0) * (r.rate || 0), 0);
    }, 0);

    return {
      revenus,
      totalFacture,
      nbFactures: filtered.length,
      nbEnAttente: nonPayees.length,
      totalMO,
    };
  }, [filtered]);

  /* ── Stats période précédente ── */
  const prevStats = useMemo(() => {
    const payees = prevFiltered.filter((f) => f.statut === "payee");
    const nonPayees = prevFiltered.filter(
      (f) => f.statut !== "payee" && f.statut !== "annulee"
    );
    const revenus = payees.reduce((s, f) => s + (f.montant_total || 0), 0);
    const totalFacture = prevFiltered.reduce(
      (s, f) => s + (f.montant_total || 0),
      0
    );
    const totalMO = prevFiltered.reduce((s, f) => {
      const rows = f.labour_rows || [];
      return s + rows.reduce((ss, r) => ss + (r.qty || 0) * (r.rate || 0), 0);
    }, 0);

    return {
      revenus,
      totalFacture,
      nbFactures: prevFiltered.length,
      nbEnAttente: nonPayees.length,
      totalMO,
    };
  }, [prevFiltered]);

  /* ── Statut des factures ── */
  const statutStats = useMemo(() => {
    const result = {
      payee: { count: 0, total: 0 },
      envoyee: { count: 0, total: 0 },
      brouillon: { count: 0, total: 0 },
      annulee: { count: 0, total: 0 },
      en_retard: { count: 0, total: 0 },
    };
    filtered.forEach((f) => {
      const key = f.statut as keyof typeof result;
      if (result[key]) {
        result[key].count++;
        result[key].total += f.montant_total || 0;
      }
    });
    return result;
  }, [filtered]);

  /* ── Main d'oeuvre ── */
  const moStats = useMemo(() => {
    const allRows = filtered.flatMap((f) => f.labour_rows || []);
    const totalH = allRows.reduce((s, r) => s + (r.qty || 0), 0);
    const totalRev = allRows.reduce(
      (s, r) => s + (r.qty || 0) * (r.rate || 0),
      0
    );
    const tauxMoyen = totalH > 0 ? totalRev / totalH : 0;

    const map: Record<string, { h: number; rev: number }> = {};
    allRows.forEach((r) => {
      if (r.desc) {
        if (!map[r.desc]) map[r.desc] = { h: 0, rev: 0 };
        map[r.desc].h += r.qty || 0;
        map[r.desc].rev += (r.qty || 0) * (r.rate || 0);
      }
    });
    const top = Object.entries(map)
      .sort((a, b) => b[1].h - a[1].h)
      .slice(0, 5);

    return { totalH, totalRev, tauxMoyen, top };
  }, [filtered]);

  /* ── Rentabilité pièces (avec rabais sur prix détail) ── */
  const piecesStats = useMemo(() => {
    let totalCout = 0;
    let totalVente = 0;
    let totalRabais = 0;
    const map: Record<string, { qty: number; cout: number; vente: number }> = {};

    filtered.forEach((f) => {
      const parts = (f.parts_rows || []).filter((r) => r.desc?.trim());
      const fCout = parts.reduce((s, r) => s + (r.cost || 0) * (r.qty || 0), 0);
      const fVente = parts.reduce((s, r) => s + (r.price || 0) * (r.qty || 0), 0);
      const discPct = f.discount_pct || 0;
      const rabais = fVente * (discPct / 100);

      totalCout += fCout;
      totalVente += fVente;
      totalRabais += rabais;

      // Pour le détail par pièce, on répartit le rabais proportionnellement
      parts.forEach((r) => {
        if (!map[r.desc]) map[r.desc] = { qty: 0, cout: 0, vente: 0 };
        const rVente = (r.price || 0) * (r.qty || 0);
        const rCout = (r.cost || 0) * (r.qty || 0);
        const rRabais = fVente > 0 ? rVente * (discPct / 100) : 0;
        map[r.desc].qty += r.qty || 0;
        map[r.desc].cout += rCout;
        map[r.desc].vente += rVente - rRabais;
      });
    });

    const venteNette = totalVente - totalRabais;
    const profit = venteNette - totalCout;
    const marge =
      venteNette > 0 && totalCout > 0
        ? ((venteNette - totalCout) / totalCout) * 100
        : null;

    const top = Object.entries(map)
      .sort((a, b) => (b[1].vente - b[1].cout) - (a[1].vente - a[1].cout))
      .slice(0, 5);

    return { totalCout, totalVente: venteNette, profit, marge, top };
  }, [filtered]);

  /* ── Clients actifs ── */
  const topClients = useMemo(() => {
    const map: Record<string, { name: string; nb: number; total: number }> = {};
    filtered.forEach((f) => {
      const c = clients.find((cl) => cl.id === f.client_id);
      if (c) {
        const key = c.id;
        if (!map[key])
          map[key] = { name: `${c.prenom} ${c.nom}`, nb: 0, total: 0 };
        map[key].nb++;
        map[key].total += f.montant_total || 0;
      }
    });
    return Object.values(map)
      .sort((a, b) => b.nb - a.nb)
      .slice(0, 5);
  }, [filtered, clients]);

  /* ── Pièces les plus vendues ── */
  const topPieces = useMemo(() => {
    const map: Record<string, { qty: number; total: number }> = {};
    filtered.forEach((f) => {
      (f.parts_rows || []).forEach((p) => {
        if (p.desc) {
          if (!map[p.desc]) map[p.desc] = { qty: 0, total: 0 };
          map[p.desc].qty += p.qty || 1;
          map[p.desc].total += (p.price || 0) * (p.qty || 1);
        }
      });
    });
    return Object.entries(map)
      .sort((a, b) => b[1].qty - a[1].qty)
      .slice(0, 5);
  }, [filtered]);

  /* ── Indicateur santé ── */
  const health = useMemo(() => {
    if (stats.nbFactures === 0) return null;
    const pctPaid =
      stats.nbFactures > 0
        ? (statutStats.payee.count / stats.nbFactures) * 100
        : 100;
    const hasOverdue = statutStats.en_retard.count > 0;
    const margin = piecesStats.marge;

    let level: "good" | "warning" | "bad" = "good";
    let message = "Bonne periode";

    if (hasOverdue) {
      level = "bad";
      message = `${statutStats.en_retard.count} facture${statutStats.en_retard.count > 1 ? "s" : ""} en retard`;
    } else if (pctPaid < 50 || (margin !== null && margin < 15)) {
      level = "bad";
      message = "Periode difficile";
    } else if (pctPaid < 70 || (margin !== null && margin < 30)) {
      level = "warning";
      message = "Periode correcte";
    }

    return { level, message, pctPaid, hasOverdue };
  }, [stats, statutStats, piecesStats]);

  /* ── KPI config ── */
  const kpis = [
    {
      icon: <IconDollar />,
      iconBg: "bg-green-100 dark:bg-green-900/30",
      iconColor: "text-green-600 dark:text-green-400",
      valueColor: "text-green-600 dark:text-green-400",
      label: "Revenus encaisses",
      value: fmt(stats.revenus),
      current: stats.revenus,
      prev: prevStats.revenus,
      invert: false,
    },
    {
      icon: <IconReceipt />,
      iconBg: "bg-gray-100 dark:bg-gray-700",
      iconColor: "text-gray-500 dark:text-gray-400",
      valueColor: "text-gray-900 dark:text-gray-100",
      label: "Total facture",
      value: fmt(stats.totalFacture),
      current: stats.totalFacture,
      prev: prevStats.totalFacture,
      invert: false,
    },
    {
      icon: <IconDocuments />,
      iconBg: "bg-blue-100 dark:bg-blue-900/30",
      iconColor: "text-blue-600 dark:text-blue-400",
      valueColor: "text-blue-600 dark:text-blue-400",
      label: "Factures",
      value: stats.nbFactures.toString(),
      current: stats.nbFactures,
      prev: prevStats.nbFactures,
      invert: false,
    },
    {
      icon: <IconClock />,
      iconBg: "bg-amber-100 dark:bg-amber-900/30",
      iconColor: "text-amber-600 dark:text-amber-400",
      valueColor: "text-amber-600 dark:text-amber-400",
      label: "En attente",
      value: stats.nbEnAttente.toString(),
      current: stats.nbEnAttente,
      prev: prevStats.nbEnAttente,
      invert: true,
    },
    {
      icon: <IconWrench />,
      iconBg: "bg-purple-100 dark:bg-purple-900/30",
      iconColor: "text-purple-600 dark:text-purple-400",
      valueColor: "text-purple-600 dark:text-purple-400",
      label: "Main d'oeuvre",
      value: fmt(stats.totalMO),
      current: stats.totalMO,
      prev: prevStats.totalMO,
      invert: false,
    },
  ];

  /* ── Période labels ── */
  const periodLabel =
    period === "semaine"
      ? "Cette semaine"
      : period === "mois"
        ? "Ce mois"
        : period === "annee"
          ? "Cette annee"
          : `${customFrom} au ${customTo}`;

  /* ═══════════════════════ RENDER ═══════════════════════ */
  if (loading)
    return (
      <div className="min-h-screen bg-background p-8">
        <p className="text-center text-gray-500 dark:text-gray-400 py-12">Chargement...</p>
      </div>
    );

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-7xl">
        {/* ── Header ── */}
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <h1 className="text-2xl font-bold text-foreground">Rapports</h1>
          <span className="text-sm text-gray-500 dark:text-gray-400">{periodLabel}</span>
        </div>

        {/* ── Period selector ── */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          {(
            [
              ["semaine", "Cette semaine"],
              ["mois", "Ce mois"],
              ["annee", "Cette annee"],
              ["custom", "Dates personnalisees"],
            ] as [Period, string][]
          ).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setPeriod(val)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                period === val
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              {label}
            </button>
          ))}

          {period === "custom" && (
            <div className="flex items-center gap-2 ml-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
              />
              <span className="text-gray-400 dark:text-gray-500">au</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
              />
            </div>
          )}
        </div>

        {/* ════════════ BANDEAU SANTÉ ════════════ */}
        {health && (
          <div
            className={`mb-6 rounded-xl border px-5 py-3.5 flex items-center gap-3 ${
              health.level === "good"
                ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                : health.level === "warning"
                  ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
                  : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
            }`}
          >
            <span className="text-xl">
              {health.level === "good" ? "✅" : health.level === "warning" ? "⚠️" : "🔴"}
            </span>
            <div>
              <span
                className={`font-semibold ${
                  health.level === "good"
                    ? "text-green-700 dark:text-green-400"
                    : health.level === "warning"
                      ? "text-amber-700 dark:text-amber-400"
                      : "text-red-700 dark:text-red-400"
                }`}
              >
                {health.message}
              </span>
              <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
                — {Math.round(health.pctPaid)}% payees
                {piecesStats.marge !== null && `, marge pieces ${piecesStats.marge.toFixed(0)}%`}
              </span>
            </div>
          </div>
        )}

        {/* ════════════ KPI CARDS ════════════ */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-5">
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${kpi.iconBg}`}
                >
                  <span className={kpi.iconColor}>{kpi.icon}</span>
                </div>
                <TrendBadge
                  current={kpi.current}
                  previous={kpi.prev}
                  invert={kpi.invert}
                />
              </div>
              <p className={`text-xl font-bold ${kpi.valueColor}`}>{kpi.value}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 uppercase">
                {kpi.label}
              </p>
            </div>
          ))}
        </div>

        {/* ════════════ STATUT DES FACTURES ════════════ */}
        <div className="mb-8 rounded-xl border-2 border-blue-200 dark:border-blue-700/50 bg-gradient-to-br from-blue-50/80 to-indigo-50/40 dark:from-blue-950/20 dark:to-gray-800 p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm">📋</span>
            <h2 className="text-lg font-semibold text-blue-700 dark:text-blue-400">
              Statut des factures
            </h2>
          </div>

          {/* ── Cartes résumé ── */}
          <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border border-blue-200/50 dark:border-blue-700/30 bg-white/80 dark:bg-gray-800/80 p-3 text-center">
              <p className="text-lg font-bold text-green-600 dark:text-green-400">{statutStats.payee.count}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mt-1">Payees</p>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-1">{fmt(statutStats.payee.total)}</p>
            </div>
            <div className="rounded-lg border border-blue-200/50 dark:border-blue-700/30 bg-white/80 dark:bg-gray-800/80 p-3 text-center">
              <p className="text-lg font-bold text-yellow-600 dark:text-yellow-400">{statutStats.envoyee.count}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mt-1">Envoyees</p>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-1">{fmt(statutStats.envoyee.total)}</p>
            </div>
            <div className="rounded-lg border border-blue-200/50 dark:border-blue-700/30 bg-white/80 dark:bg-gray-800/80 p-3 text-center">
              <p className="text-lg font-bold text-gray-600 dark:text-gray-400">{statutStats.brouillon.count}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mt-1">Brouillons</p>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-1">{fmt(statutStats.brouillon.total)}</p>
            </div>
            <div className="rounded-lg border border-blue-200/50 dark:border-blue-700/30 bg-white/80 dark:bg-gray-800/80 p-3 text-center">
              <p className="text-lg font-bold text-red-600 dark:text-red-400">{statutStats.en_retard.count}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mt-1">En retard</p>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-1">{fmt(statutStats.en_retard.total)}</p>
            </div>
          </div>

          {/* ── Tableau détaillé ── */}
          <div className="overflow-hidden rounded-lg border border-blue-200/50 dark:border-blue-700/30">
            <table className="w-full text-xs">
              <thead className="bg-blue-100/50 dark:bg-blue-900/20 text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2 text-left">Statut</th>
                  <th className="px-3 py-2 text-right">Nombre</th>
                  <th className="px-3 py-2 text-right">Montant</th>
                  <th className="px-3 py-2 text-right">% du total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-100 dark:divide-blue-800/50">
                {[
                  { label: "Payees", data: statutStats.payee, color: "text-green-600 dark:text-green-400" },
                  { label: "Envoyees", data: statutStats.envoyee, color: "text-yellow-600 dark:text-yellow-400" },
                  { label: "Brouillons", data: statutStats.brouillon, color: "text-gray-600 dark:text-gray-400" },
                  { label: "En retard", data: statutStats.en_retard, color: "text-red-600 dark:text-red-400" },
                ].map((row) => {
                  const pct = stats.nbFactures > 0 ? (row.data.count / stats.nbFactures) * 100 : 0;
                  const totalMontant = statutStats.payee.total + statutStats.envoyee.total + statutStats.brouillon.total + statutStats.en_retard.total;
                  const pctMontant = totalMontant > 0 ? (row.data.total / totalMontant) * 100 : 0;
                  return (
                    <tr key={row.label} className="bg-white/60 dark:bg-gray-800/60">
                      <td className={`px-3 py-2 font-medium ${row.color}`}>
                        {row.label}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">
                        {row.data.count}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">
                        {fmt(row.data.total)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700">
                            <div
                              className={`h-1.5 rounded-full transition-all duration-500 ${
                                row.label === "Payees" ? "bg-green-500" :
                                row.label === "Envoyees" ? "bg-yellow-500" :
                                row.label === "En retard" ? "bg-red-500" : "bg-gray-400"
                              }`}
                              style={{ width: `${Math.min(pctMontant, 100)}%` }}
                            />
                          </div>
                          <span className="text-gray-700 dark:text-gray-300 w-10 text-right">{pctMontant.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-blue-50/80 dark:bg-blue-900/10 border-t border-blue-200/50 dark:border-blue-700/30">
                <tr>
                  <td className="px-3 py-2 font-semibold text-blue-700 dark:text-blue-400">Total</td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-gray-100">{stats.nbFactures}</td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-gray-100">{fmt(stats.totalFacture)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-gray-100">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ════════════ 2-COL: MAIN D'OEUVRE + RENTABILITÉ ════════════ */}
        <div className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── Left: Main d'oeuvre ── */}
          <div>
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
              Main d&apos;oeuvre facturee
            </h2>
            <div className="mb-4 grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 text-center">
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {moStats.totalH.toFixed(1)}h
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mt-1">
                  Heures totales
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 text-center">
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {fmt(moStats.totalRev)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mt-1">Revenu M.O.</p>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 text-center">
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {fmt(moStats.tauxMoyen)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mt-1">
                  Taux moyen /h
                </p>
              </div>
            </div>

            {moStats.top.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900 text-xs uppercase text-gray-500 dark:text-gray-400">
                    <tr>
                      <th className="px-4 py-2 text-left">Type de travail</th>
                      <th className="px-4 py-2 text-right">Heures</th>
                      <th className="px-4 py-2 text-right">Revenu</th>
                      <th className="px-4 py-2 text-right">Taux moy.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {moStats.top.map(([desc, data]) => (
                      <tr key={desc} className="bg-white dark:bg-gray-800">
                        <td className="px-4 py-2.5 text-gray-900 dark:text-gray-100">{desc}</td>
                        <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300">
                          {data.h.toFixed(1)}h
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-gray-900 dark:text-gray-100">
                          {fmt(data.rev)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300">
                          {fmt(data.h > 0 ? data.rev / data.h : 0)}/h
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Right: Rentabilité pièces ── */}
          <div className="rounded-xl border-2 border-amber-200 dark:border-amber-700/50 bg-gradient-to-br from-amber-50/80 to-orange-50/40 dark:from-amber-950/20 dark:to-gray-800 p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm">🔒</span>
              <h2 className="text-lg font-semibold text-amber-700 dark:text-amber-400">
                Rentabilite pieces (interne)
              </h2>
            </div>
            <div className="mb-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-amber-200/50 dark:border-amber-700/30 bg-white/80 dark:bg-gray-800/80 p-3 text-center">
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {fmt(piecesStats.totalCout)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mt-1">Cout total</p>
              </div>
              <div className="rounded-lg border border-amber-200/50 dark:border-amber-700/30 bg-white/80 dark:bg-gray-800/80 p-3 text-center">
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {fmt(piecesStats.totalVente)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mt-1">
                  Vente nette
                </p>
              </div>
              <div className="rounded-lg border border-amber-200/50 dark:border-amber-700/30 bg-white/80 dark:bg-gray-800/80 p-3 text-center">
                <p className="text-lg font-bold text-green-600 dark:text-green-400">
                  {fmt(piecesStats.profit)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mt-1">
                  Profit brut
                </p>
              </div>
              <div className="rounded-lg border border-amber-200/50 dark:border-amber-700/30 bg-white/80 dark:bg-gray-800/80 p-3 text-center">
                <p
                  className={`text-lg font-bold ${
                    piecesStats.marge !== null
                      ? piecesStats.marge >= 30
                        ? "text-green-600 dark:text-green-400"
                        : piecesStats.marge >= 15
                          ? "text-yellow-600 dark:text-yellow-400"
                          : "text-red-600 dark:text-red-400"
                      : "text-gray-400"
                  }`}
                >
                  {piecesStats.marge !== null
                    ? `${piecesStats.marge.toFixed(1)}%`
                    : "\u2014"}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mt-1">Marge moy.</p>
              </div>
            </div>

            {piecesStats.top.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-amber-200/50 dark:border-amber-700/30">
                <table className="w-full text-xs">
                  <thead className="bg-amber-100/50 dark:bg-amber-900/20 text-xs uppercase text-gray-500 dark:text-gray-400">
                    <tr>
                      <th className="px-3 py-2 text-left">Piece</th>
                      <th className="px-3 py-2 text-right">Qte</th>
                      <th className="px-3 py-2 text-right">Cout</th>
                      <th className="px-3 py-2 text-right">Vente</th>
                      <th className="px-3 py-2 text-right">Profit</th>
                      <th className="px-3 py-2 text-right">Marge</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100 dark:divide-amber-800/50">
                    {piecesStats.top.map(([desc, data]) => {
                      const profit = data.vente - data.cout;
                      const marge =
                        data.cout > 0
                          ? ((data.vente - data.cout) / data.cout) * 100
                          : null;
                      return (
                        <tr key={desc} className="bg-white/60 dark:bg-gray-800/60">
                          <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{desc}</td>
                          <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">
                            {data.qty}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">
                            {fmt(data.cout)}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">
                            {fmt(data.vente)}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-green-600 dark:text-green-400">
                            {fmt(profit)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right font-medium ${
                              marge !== null
                                ? marge >= 30
                                  ? "text-green-600 dark:text-green-400"
                                  : marge >= 15
                                    ? "text-yellow-600 dark:text-yellow-400"
                                    : "text-red-600 dark:text-red-400"
                                : "text-gray-400"
                            }`}
                          >
                            {marge !== null ? `${marge.toFixed(1)}%` : "\u2014"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ════════════ TOP CLIENTS + TOP PIÈCES ════════════ */}
        <div className="mb-8 grid grid-cols-1 gap-8 md:grid-cols-2">
          {/* ── Clients les plus actifs ── */}
          <div>
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
              Clients les plus actifs
            </h2>
            {topClients.length > 0 ? (
              <div className="space-y-3">
                {topClients.map((c, i) => {
                  const maxTotal = topClients[0]?.total || 1;
                  const barPct = (c.total / maxTotal) * 100;
                  return (
                    <div
                      key={c.name}
                      className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span
                            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white ${
                              i === 0
                                ? "bg-yellow-500"
                                : i === 1
                                  ? "bg-gray-400"
                                  : i === 2
                                    ? "bg-amber-600"
                                    : "bg-gray-300"
                            }`}
                          >
                            {i + 1}
                          </span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {c.name}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {fmt(c.total)}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {c.nb} facture{c.nb > 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                      {/* Mini bar */}
                      <div className="mt-2.5 h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-700">
                        <div
                          className="h-1.5 rounded-full bg-yellow-400 dark:bg-yellow-500 transition-all duration-500"
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                Aucune donnee pour cette periode
              </p>
            )}
          </div>

          {/* ── Pièces les plus vendues ── */}
          <div>
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
              Pieces les plus vendues
            </h2>
            {topPieces.length > 0 ? (
              <div className="space-y-3">
                {topPieces.map(([desc, data], i) => {
                  const maxQty = topPieces[0]?.[1]?.qty || 1;
                  const barPct = (data.qty / maxQty) * 100;
                  return (
                    <div
                      key={desc}
                      className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span
                            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white ${
                              i === 0
                                ? "bg-blue-500"
                                : i === 1
                                  ? "bg-blue-400"
                                  : i === 2
                                    ? "bg-blue-300"
                                    : "bg-gray-300"
                            }`}
                          >
                            {i + 1}
                          </span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">{desc}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {fmt(data.total)}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {data.qty} unite{data.qty > 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                      {/* Mini bar */}
                      <div className="mt-2.5 h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-700">
                        <div
                          className="h-1.5 rounded-full bg-blue-400 dark:bg-blue-500 transition-all duration-500"
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                Aucune donnee pour cette periode
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════ Sub-components ═══════════════════════ */

function TrendBadge({
  current,
  previous,
  invert,
}: {
  current: number;
  previous: number;
  invert?: boolean;
}) {
  if (previous === 0 && current === 0) return null;
  if (previous === 0 && current > 0)
    return (
      <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
        nouveau
      </span>
    );
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(pct) < 1) return null;
  const isUp = pct > 0;
  const isGood = invert ? !isUp : isUp;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${
        isGood
          ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
          : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
      }`}
    >
      {isUp ? "↑" : "↓"} {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

function StatusCard({
  label,
  count,
  total,
  pct,
  bgColor,
  borderColor,
  textColor,
  barColor,
}: {
  label: string;
  count: number;
  total: number;
  pct: number;
  bgColor: string;
  borderColor: string;
  textColor: string;
  barColor: string;
}) {
  return (
    <div className={`rounded-xl border ${borderColor} ${bgColor} p-4`}>
      <p className={`text-2xl font-bold ${textColor}`}>{count}</p>
      <p className={`text-xs font-medium ${textColor} mt-1`}>{label}</p>
      <p className="mt-2 text-sm font-medium text-gray-700 dark:text-gray-300">{fmt(total)}</p>
      {/* Barre de progression */}
      <div className="mt-3 h-1.5 w-full rounded-full bg-white/60 dark:bg-gray-700">
        <div
          className={`h-1.5 rounded-full ${barColor} transition-all duration-500`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{pct.toFixed(0)}% du total</p>
    </div>
  );
}
