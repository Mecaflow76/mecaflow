"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

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
  annee: number | null;
  plaque: string;
  vin: string;
  moteur: string;
  lieu_fabrication: string;
  kilometrage: number | null;
  couleur: string;
  clients?: Client;
}

interface BonTravail {
  id: string;
  vehicule_id: string;
  date_creation: string;
  statut: string;
  mecanicien: string;
  symptomes: string;
  diagnostic: string;
  travaux: string;
  chrono_ms: number | null;
}

const emptyForm = {
  client_id: "",
  marque: "",
  modele: "",
  annee: "",
  plaque: "",
  vin: "",
  moteur: "",
  lieu_fabrication: "",
  kilometrage: "",
  couleur: "",
};

export default function VehiculesPage() {
  const [vehicules, setVehicules] = useState<Vehicule[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingVehicule, setEditingVehicule] = useState<Vehicule | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [decoding, setDecoding] = useState(false);
  const [vinInfo, setVinInfo] = useState<{ moteur: string; usine: string } | null>(null);
  const [bons, setBons] = useState<BonTravail[]>([]);
  const [expandedVehiculeId, setExpandedVehiculeId] = useState<string | null>(null);

  async function decodeVin() {
    if (form.vin.length !== 17) {
      setError("Le VIN doit contenir 17 caracteres pour etre decode.");
      return;
    }
    setDecoding(true);
    setError(null);
    try {
      const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${form.vin}?format=json`);
      const data = await res.json();
      const results = data.Results || [];
      const get = (id: number) => {
        const r = results.find((r: { VariableId: number }) => r.VariableId === id);
        return r?.Value && r.Value.trim() ? r.Value.trim() : "";
      };
      const marque = get(26);  // Make
      const modele = get(28);  // Model
      const annee = get(29);   // Model Year
      const moteur = [get(13), get(71)].filter(Boolean).join(" ");  // Displacement + Engine Model
      const usine = get(75) || get(76);  // Plant City, Plant Country

      setForm((prev) => ({
        ...prev,
        marque: marque || prev.marque,
        modele: modele || prev.modele,
        annee: annee || prev.annee,
        moteur: moteur || prev.moteur,
        lieu_fabrication: usine || prev.lieu_fabrication,
      }));
      setVinInfo({
        moteur: moteur || "Non disponible",
        usine: usine || "Non disponible",
      });
    } catch {
      setError("Erreur lors du decodage du VIN. Verifiez votre connexion internet.");
    }
    setDecoding(false);
  }

  useEffect(() => {
    fetchVehicules();
    fetchClients();
    fetchBons();
  }, []);

  async function fetchBons() {
    const { data } = await supabase
      .from("bons_travail")
      .select("id, vehicule_id, date_creation, statut, mecanicien, symptomes, diagnostic, travaux, chrono_ms")
      .order("date_creation", { ascending: false });
    setBons(data || []);
  }

  function getVehiculeBons(vehiculeId: string) {
    return bons.filter((b) => b.vehicule_id === vehiculeId);
  }

  function toggleExpand(vehiculeId: string) {
    setExpandedVehiculeId((prev) => (prev === vehiculeId ? null : vehiculeId));
  }

  function formatChrono(ms: number | null): string {
    if (!ms) return "";
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    return `${h}h${String(m).padStart(2, "0")}`;
  }

  const statutLabels: Record<string, { label: string; color: string }> = {
    en_cours: { label: "En cours", color: "bg-blue-100 text-blue-700" },
    termine: { label: "Termine", color: "bg-green-100 text-green-700" },
    en_attente: { label: "En attente", color: "bg-yellow-100 text-yellow-700" },
    annule: { label: "Annule", color: "bg-red-100 text-red-700" },
  };

  async function fetchVehicules() {
    setLoading(true);
    const { data, error } = await supabase
      .from("vehicules")
      .select("*, clients(id, nom, prenom)")
      .order("marque", { ascending: true });

    if (error) {
      setError(error.message);
    } else {
      setVehicules(data || []);
    }
    setLoading(false);
  }

  async function fetchClients() {
    const { data } = await supabase
      .from("clients")
      .select("id, nom, prenom")
      .order("nom", { ascending: true });
    setClients(data || []);
  }

  function openNew() {
    setEditingVehicule(null);
    setForm(emptyForm);
    setVinInfo(null);
    setShowForm(true);
  }

  function openEdit(v: Vehicule) {
    setEditingVehicule(v);
    setForm({
      client_id: v.client_id || "",
      marque: v.marque || "",
      modele: v.modele || "",
      annee: v.annee?.toString() || "",
      plaque: v.plaque || "",
      vin: v.vin || "",
      moteur: v.moteur || "",
      lieu_fabrication: v.lieu_fabrication || "",
      kilometrage: v.kilometrage?.toString() || "",
      couleur: v.couleur || "",
    });
    setVinInfo(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingVehicule(null);
    setForm(emptyForm);
    setVinInfo(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.vin && form.vin.length !== 17) {
      setError("Le VIN doit contenir exactement 17 caracteres.");
      return;
    }
    setSaving(true);

    const payload = {
      client_id: form.client_id || null,
      marque: form.marque,
      modele: form.modele,
      annee: form.annee ? parseInt(form.annee) : null,
      plaque: form.plaque,
      vin: form.vin,
      moteur: form.moteur,
      lieu_fabrication: form.lieu_fabrication,
      kilometrage: form.kilometrage ? parseInt(form.kilometrage) : null,
      couleur: form.couleur,
    };

    if (editingVehicule) {
      const { error } = await supabase
        .from("vehicules")
        .update(payload)
        .eq("id", editingVehicule.id);
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.from("vehicules").insert(payload);
      if (error) setError(error.message);
    }

    setSaving(false);
    closeForm();
    fetchVehicules();
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer ce vehicule ?")) return;

    const { error } = await supabase.from("vehicules").delete().eq("id", id);
    if (error) {
      setError(error.message);
    } else {
      fetchVehicules();
    }
  }

  const filteredVehicules = vehicules.filter((v) => {
    const term = search.toLowerCase();
    const clientName = v.clients
      ? `${v.clients.nom} ${v.clients.prenom}`.toLowerCase()
      : "";
    return (
      v.marque?.toLowerCase().includes(term) ||
      v.modele?.toLowerCase().includes(term) ||
      v.plaque?.toLowerCase().includes(term) ||
      v.couleur?.toLowerCase().includes(term) ||
      clientName.includes(term)
    );
  });

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-foreground">Vehicules</h1>
            <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800">
              {filteredVehicules.length} vehicule
              {filteredVehicules.length !== 1 && "s"}
            </span>
          </div>
          <button
            onClick={openNew}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            + Nouveau vehicule
          </button>
        </div>

        <input
          type="text"
          placeholder="Rechercher par marque, modele, plaque ou client..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-6 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />

        {loading && (
          <p className="py-12 text-center text-gray-500">
            Chargement des vehicules...
          </p>
        )}

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-600">
            Erreur : {error}
          </div>
        )}

        {!loading && !error && filteredVehicules.length === 0 && (
          <p className="py-12 text-center text-gray-500">
            Aucun vehicule trouve.
          </p>
        )}

        {!loading && !error && filteredVehicules.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-6 py-3">Marque / Modele</th>
                  <th className="px-6 py-3">No plaque</th>
                  <th className="px-6 py-3">Annee</th>
                  <th className="px-6 py-3">Km</th>
                  <th className="px-6 py-3">Client</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredVehicules.map((v) => {
                  const isExpanded = expandedVehiculeId === v.id;
                  const vehiculeBons = getVehiculeBons(v.id);
                  return (
                    <React.Fragment key={v.id}>
                      <tr
                        className="bg-white hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => toggleExpand(v.id)}
                      >
                        <td className="px-6 py-4 font-medium text-gray-900">
                          <span className="mr-2 text-gray-400 text-xs">{isExpanded ? "▼" : "▶"}</span>
                          {v.marque} {v.modele}
                          {v.couleur && (
                            <span className="ml-2 text-xs text-gray-400">
                              — {v.couleur}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-gray-700">
                          {v.plaque || "—"}
                        </td>
                        <td className="px-6 py-4 text-gray-700">{v.annee}</td>
                        <td className="px-6 py-4 text-gray-700">
                          {v.kilometrage
                            ? `${v.kilometrage.toLocaleString("fr-FR")} km`
                            : "—"}
                        </td>
                        <td className="px-6 py-4 text-gray-700">
                          {v.clients
                            ? `${v.clients.nom} ${v.clients.prenom}`
                            : "—"}
                        </td>
                        <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => openEdit(v)}
                            className="mr-3 text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            Modifier
                          </button>
                          <button
                            onClick={() => handleDelete(v.id)}
                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                          >
                            Supprimer
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="bg-gray-50 px-6 py-4">
                            {vehiculeBons.length === 0 ? (
                              <p className="text-sm text-gray-500 italic">Aucun bon de travail pour ce vehicule.</p>
                            ) : (
                              <div>
                                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                                  Bons de travail ({vehiculeBons.length})
                                </h3>
                                <div className="grid gap-2">
                                  {vehiculeBons.map((b) => {
                                    const st = statutLabels[b.statut] || { label: b.statut, color: "bg-gray-100 text-gray-700" };
                                    return (
                                      <div
                                        key={b.id}
                                        className="flex items-center justify-between rounded-lg bg-white border border-gray-200 px-4 py-2.5"
                                      >
                                        <div className="flex items-center gap-4">
                                          <span className="text-base">🔧</span>
                                          <div>
                                            <div className="flex items-center gap-2">
                                              <span className="font-medium text-gray-900 text-sm">
                                                {(b.date_creation || "").slice(0, 10)}
                                              </span>
                                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${st.color}`}>
                                                {st.label}
                                              </span>
                                              {b.mecanicien && (
                                                <span className="text-xs text-gray-500">— {b.mecanicien}</span>
                                              )}
                                              {b.chrono_ms ? (
                                                <span className="text-xs text-blue-600 font-mono">{formatChrono(b.chrono_ms)}</span>
                                              ) : null}
                                            </div>
                                            {b.symptomes && (
                                              <p className="text-xs text-gray-500 mt-0.5 truncate max-w-md">{b.symptomes}</p>
                                            )}
                                          </div>
                                        </div>
                                        {b.travaux && (
                                          <p className="text-xs text-gray-400 truncate max-w-[200px]">{b.travaux}</p>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal formulaire */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-6 text-lg font-semibold text-gray-900">
              {editingVehicule ? "Modifier le vehicule" : "Nouveau vehicule"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Client
                </label>
                <select
                  required
                  value={form.client_id}
                  onChange={(e) =>
                    setForm({ ...form, client_id: e.target.value })
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">-- Selectionner un client --</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom} {c.prenom}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Marque
                  </label>
                  <input
                    type="text"
                    required
                    value={form.marque}
                    onChange={(e) =>
                      setForm({ ...form, marque: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Modele
                  </label>
                  <input
                    type="text"
                    required
                    value={form.modele}
                    onChange={(e) =>
                      setForm({ ...form, modele: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Annee
                  </label>
                  <input
                    type="number"
                    value={form.annee}
                    onChange={(e) =>
                      setForm({ ...form, annee: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Moteur
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 5.3L V8, 2.0L Turbo..."
                    value={form.moteur}
                    onChange={(e) => setForm({ ...form, moteur: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    No plaque
                  </label>
                  <input
                    type="text"
                    placeholder="ABC 123"
                    value={form.plaque}
                    onChange={(e) =>
                      setForm({ ...form, plaque: e.target.value.toUpperCase() })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Kilometrage
                  </label>
                  <input
                    type="number"
                    value={form.kilometrage}
                    onChange={(e) =>
                      setForm({ ...form, kilometrage: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Lieu de fabrication
                </label>
                <input
                  type="text"
                  placeholder="Ex: Oshawa, Ontario..."
                  value={form.lieu_fabrication}
                  onChange={(e) => setForm({ ...form, lieu_fabrication: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  VIN (NIV)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={17}
                    placeholder="17 caracteres"
                    value={form.vin}
                    onChange={(e) => {
                      setForm({ ...form, vin: e.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "").slice(0, 17) });
                      setVinInfo(null);
                    }}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 font-mono tracking-wider focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={decodeVin}
                    disabled={form.vin.length !== 17 || decoding}
                    className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {decoding ? "..." : "Decoder"}
                  </button>
                </div>
                {form.vin.length > 0 && form.vin.length < 17 && (
                  <p className="mt-1 text-xs text-red-500">
                    Le VIN doit contenir exactement 17 caracteres ({form.vin.length}/17)
                  </p>
                )}
                {vinInfo && (
                  <p className="mt-1 text-xs font-semibold text-green-600">VIN decode avec succes !</p>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
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
                    : editingVehicule
                      ? "Enregistrer"
                      : "Ajouter"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
