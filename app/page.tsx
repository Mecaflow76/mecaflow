"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

interface Stats {
  clients: number;
  vehicules: number;
  rdvAujourdhui: number;
  facturesImpayees: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    clients: 0,
    vehicules: 0,
    rdvAujourdhui: 0,
    facturesImpayees: 0,
  });
  const [loading, setLoading] = useState(true);

  async function fetchStats() {
    const today = new Date().toISOString().split("T")[0];

    const [clientsRes, vehiculesRes, rdvRes, facturesRes] = await Promise.all([
      supabase.from("clients").select("id", { count: "exact", head: true }),
      supabase.from("vehicules").select("id", { count: "exact", head: true }),
      supabase
        .from("rendezvous")
        .select("id", { count: "exact", head: true })
        .eq("date_rdv", today),
      supabase
        .from("factures")
        .select("id", { count: "exact", head: true })
        .in("statut", ["envoyee", "en_retard"]),
    ]);

    setStats({
      clients: clientsRes.count || 0,
      vehicules: vehiculesRes.count || 0,
      rdvAujourdhui: rdvRes.count || 0,
      facturesImpayees: facturesRes.count || 0,
    });
    setLoading(false);
  }

  useEffect(() => {
    fetchStats();
  }, []);

  const cards = [
    {
      label: "Clients",
      value: stats.clients,
      href: "/clients",
      color: "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
      icon: "👤",
    },
    {
      label: "Vehicules",
      value: stats.vehicules,
      href: "/vehicules",
      color: "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400",
      icon: "🚗",
    },
    {
      label: "RDV aujourd'hui",
      value: stats.rdvAujourdhui,
      href: "/rendez-vous",
      color: "bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400",
      icon: "📅",
    },
    {
      label: "Factures impayees",
      value: stats.facturesImpayees,
      href: "/factures",
      color: "bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400",
      icon: "📄",
    },
  ];

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-2 text-2xl font-bold text-foreground">
          Tableau de bord
        </h1>
        <p className="mb-8 text-gray-500 dark:text-gray-400">
          Bienvenue sur MecaFlow
        </p>

        {loading ? (
          <p className="py-12 text-center text-gray-500 dark:text-gray-400">Chargement...</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((card) => (
              <Link
                key={card.label}
                href={card.href}
                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 transition-shadow hover:shadow-md"
              >
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-2xl">{card.icon}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${card.color}`}
                  >
                    {card.label}
                  </span>
                </div>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{card.value}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
