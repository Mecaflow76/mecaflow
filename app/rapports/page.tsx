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

type Period = "semaine" | "mois" | "annee" | "custom";

/* ───── Component ───── */
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

  /* ── Période ── */
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

  /* ── Stats ── */
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

  /* ── Rentabilité pièces (avec rabais sur marge) ── */
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
      const margeAmount = fVente - fCout;
      const rabais = margeAmount > 0 ? margeAmount * (discPct / 100) : 0;

      totalCout += fCout;
      totalVente += fVente;
      totalRabais += rabais;

      // Pour le détail par pièce, on répartit le rabais proportionnellement
      parts.forEach((r) => {
        if (!map[r.desc]) map[r.desc] = { qty: 0, cout: 0, vente: 0 };
        const rVente = (r.price || 0) * (r.qty || 0);
        const rCout = (r.cost || 0) * (r.qty || 0);
        const rMarge = rVente - rCout;
        const rRabais = fVente > 0 && rMarge > 0 ? rMarge * (discPct / 100) : 0;
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

  /* ── Période label ── */
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
      <div className="mx-auto max-w-6xl">
        {/* ── Header ── */}
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <h1 className="text-2xl font-bold text-foreground">Rapports</h1>
          <span className="text-sm text-gray-500 dark:text-gray-400">{periodLabel}</span>
        </div>

        {/* ── Period selector ── */}
        <div className="mb-8 flex flex-wrap items-center gap-3">
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

        {/* ════════════ 1. TUILES SOMMAIRES ════════════ */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-5">
          <StatCard
            label="Revenus encaisses"
            value={fmt(stats.revenus)}
            color="text-green-600"
          />
          <StatCard
            label="Total facture"
            value={fmt(stats.totalFacture)}
            color="text-gray-900"
          />
          <StatCard
            label="Factures"
            value={stats.nbFactures.toString()}
            color="text-blue-600"
          />
          <StatCard
            label="En attente"
            value={stats.nbEnAttente.toString()}
            color="text-amber-600"
          />
          <StatCard
            label="Main d'oeuvre"
            value={fmt(stats.totalMO)}
            color="text-purple-600"
          />
        </div>

        {/* ════════════ 2. STATUT DES FACTURES ════════════ */}
        <div className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
            Statut des factures
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatusCard
              label="Payees"
              count={statutStats.payee.count}
              total={statutStats.payee.total}
              bgColor="bg-green-50 dark:bg-green-900/20"
              borderColor="border-green-200 dark:border-green-800"
              textColor="text-green-700 dark:text-green-400"
            />
            <StatusCard
              label="Envoyees"
              count={statutStats.envoyee.count}
              total={statutStats.envoyee.total}
              bgColor="bg-yellow-50 dark:bg-yellow-900/20"
              borderColor="border-yellow-200 dark:border-yellow-800"
              textColor="text-yellow-700 dark:text-yellow-400"
            />
            <StatusCard
              label="Brouillons"
              count={statutStats.brouillon.count}
              total={statutStats.brouillon.total}
              bgColor="bg-gray-50 dark:bg-gray-800"
              borderColor="border-gray-200 dark:border-gray-700"
              textColor="text-gray-600 dark:text-gray-400"
            />
            <StatusCard
              label="En retard"
              count={statutStats.en_retard.count}
              total={statutStats.en_retard.total}
              bgColor="bg-red-50 dark:bg-red-900/20"
              borderColor="border-red-200 dark:border-red-800"
              textColor="text-red-700 dark:text-red-400"
            />
          </div>
        </div>

        {/* ════════════ 3. MAIN D'OEUVRE ════════════ */}
        <div className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
            Main d&apos;oeuvre facturee
          </h2>
          <div className="mb-4 grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {moStats.totalH.toFixed(1)}h
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mt-1">
                Heures totales
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 text-center">
              <p className="text-2xl font-bold text-purple-600">
                {fmt(moStats.totalRev)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mt-1">Revenu M.O.</p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">
                {fmt(moStats.tauxMoyen)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mt-1">
                Taux moyen /h
              </p>
            </div>
          </div>

          {moStats.top.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
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

        {/* ════════════ 4. RENTABILITE PIECES (INTERNE) ════════════ */}
        <div className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-amber-700 dark:text-amber-400">
            Rentabilite pieces (interne)
          </h2>
          <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-center">
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {fmt(piecesStats.totalCout)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mt-1">Cout total</p>
            </div>
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-center">
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {fmt(piecesStats.totalVente)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mt-1">
                Vente totale
              </p>
            </div>
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-center">
              <p className="text-xl font-bold text-green-600">
                {fmt(piecesStats.profit)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mt-1">
                Profit brut
              </p>
            </div>
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-center">
              <p
                className={`text-xl font-bold ${
                  piecesStats.marge !== null
                    ? piecesStats.marge >= 30
                      ? "text-green-600"
                      : piecesStats.marge >= 15
                        ? "text-yellow-600"
                        : "text-red-600"
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
            <div className="overflow-hidden rounded-lg border border-amber-200 dark:border-amber-800">
              <table className="w-full text-sm">
                <thead className="bg-amber-50 dark:bg-amber-900/20 text-xs uppercase text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-2 text-left">Piece</th>
                    <th className="px-4 py-2 text-right">Qte</th>
                    <th className="px-4 py-2 text-right">Cout</th>
                    <th className="px-4 py-2 text-right">Vente</th>
                    <th className="px-4 py-2 text-right">Profit</th>
                    <th className="px-4 py-2 text-right">Marge</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100 dark:divide-amber-800">
                  {piecesStats.top.map(([desc, data]) => {
                    const profit = data.vente - data.cout;
                    const marge =
                      data.cout > 0
                        ? ((data.vente - data.cout) / data.cout) * 100
                        : null;
                    return (
                      <tr key={desc} className="bg-white dark:bg-gray-800">
                        <td className="px-4 py-2.5 text-gray-900 dark:text-gray-100">{desc}</td>
                        <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300">
                          {data.qty}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300">
                          {fmt(data.cout)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300">
                          {fmt(data.vente)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-green-600">
                          {fmt(profit)}
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right font-medium ${
                            marge !== null
                              ? marge >= 30
                                ? "text-green-600"
                                : marge >= 15
                                  ? "text-yellow-600"
                                  : "text-red-600"
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

        {/* ════════════ 5. CLIENTS LES PLUS ACTIFS ════════════ */}
        <div className="mb-8 grid grid-cols-1 gap-8 md:grid-cols-2">
          <div>
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
              Clients les plus actifs
            </h2>
            {topClients.length > 0 ? (
              <div className="space-y-3">
                {topClients.map((c, i) => (
                  <div
                    key={c.name}
                    className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3"
                  >
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
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                Aucune donnee pour cette periode
              </p>
            )}
          </div>

          {/* ════════════ 6. PIECES LES PLUS VENDUES ════════════ */}
          <div>
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
              Pieces les plus vendues
            </h2>
            {topPieces.length > 0 ? (
              <div className="space-y-3">
                {topPieces.map(([desc, data], i) => (
                  <div
                    key={desc}
                    className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3"
                  >
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
                ))}
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

/* ═══ Sub-components ═══ */
function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 uppercase">{label}</p>
    </div>
  );
}

function StatusCard({
  label,
  count,
  total,
  bgColor,
  borderColor,
  textColor,
}: {
  label: string;
  count: number;
  total: number;
  bgColor: string;
  borderColor: string;
  textColor: string;
}) {
  return (
    <div className={`rounded-lg border ${borderColor} ${bgColor} p-4`}>
      <p className={`text-2xl font-bold ${textColor}`}>{count}</p>
      <p className={`text-xs font-medium ${textColor} mt-1`}>{label}</p>
      <p className="mt-2 text-sm font-medium text-gray-700 dark:text-gray-300">{fmt(total)}</p>
    </div>
  );
}
