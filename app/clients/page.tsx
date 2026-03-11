"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getClientDisplayName } from "@/lib/clientUtils";

interface Client {
  id: string;
  nom: string;
  prenom: string;
  entreprise: string;
  email: string;
  email2: string;
  telephone: string;
  telephone2: string;
  adresse: string;
  ville: string;
  code_postal: string;
}

interface Vehicule {
  id: string;
  client_id: string;
  marque: string;
  modele: string;
  annee: number | null;
  plaque: string;
  vin: string;
  kilometrage: number | null;
  couleur: string;
  numero_unite: string;
}

const emptyForm = {
  nom: "",
  prenom: "",
  entreprise: "",
  email: "",
  email2: "",
  telephone: "",
  telephone2: "",
  adresse: "",
  ville: "",
  code_postal: "",
};

function formatTelephone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)})${digits.slice(3)}`;
  return `(${digits.slice(0, 3)})${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** Capitalize first letter of each word, including after hyphens: "st-jacques" → "St-Jacques" */
function formatCapitalize(value: string): string {
  return value.replace(/(?:^|[\s-])([a-zA-ZÀ-ÿ])/g, (match) =>
    match.toUpperCase()
  );
}

/** Format Canadian postal code: "jok2r0" → "J0K 2R0" */
function formatCodePostal(value: string): string {
  const clean = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6);
  if (clean.length <= 3) return clean;
  return clean.slice(0, 3) + " " + clean.slice(3);
}

export default function ClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [vehicules, setVehicules] = useState<Vehicule[]>([]);
  // Modal vehicule picker
  const [pickedClient, setPickedClient] = useState<Client | null>(null);
  const [showClientInfo, setShowClientInfo] = useState(false);

  async function fetchVehicules() {
    const supabase = createClient();
    const { data } = await supabase
      .from("vehicules")
      .select("*")
      .order("marque", { ascending: true });
    setVehicules(data || []);
  }

  async function fetchClients() {
    const supabase = createClient();
    setLoading(true);
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("nom", { ascending: true });

    if (error) {
      setError(error.message);
    } else {
      setClients(data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchClients();
    fetchVehicules();
  }, []);

  function getClientVehicules(clientId: string) {
    return vehicules.filter((v) => v.client_id === clientId);
  }

  function openNew() {
    setEditingClient(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(client: Client) {
    setEditingClient(client);
    setForm({
      nom: client.nom,
      prenom: client.prenom,
      entreprise: client.entreprise || "",
      email: client.email,
      email2: client.email2 || "",
      telephone: client.telephone,
      telephone2: client.telephone2 || "",
      adresse: client.adresse || "",
      ville: client.ville || "",
      code_postal: client.code_postal || "",
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingClient(null);
    setForm(emptyForm);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    setSaving(true);

    if (editingClient) {
      const { error } = await supabase
        .from("clients")
        .update(form)
        .eq("id", editingClient.id);
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.from("clients").insert(form);
      if (error) setError(error.message);
    }

    setSaving(false);
    closeForm();
    fetchClients();
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    const nbVeh = getClientVehicules(id).length;
    const msg = nbVeh > 0
      ? `Supprimer ce client ET ses ${nbVeh} véhicule(s), factures, bons de travail et rendez-vous associés ?\n\nCette action est irréversible.`
      : "Supprimer ce client ?";
    if (!confirm(msg)) return;

    // Cascade : supprimer les enregistrements liés avant le client
    const vehIds = getClientVehicules(id).map((v) => v.id);
    if (vehIds.length > 0) {
      await supabase.from("factures").delete().in("vehicule_id", vehIds);
      await supabase.from("bons_travail").delete().in("vehicule_id", vehIds);
      await supabase.from("rendezvous").delete().in("vehicule_id", vehIds);
    }
    // Supprimer aussi ceux liés directement au client_id (sans véhicule)
    await supabase.from("factures").delete().eq("client_id", id);
    await supabase.from("bons_travail").delete().eq("client_id", id);
    await supabase.from("rendezvous").delete().eq("client_id", id);
    await supabase.from("vehicules").delete().eq("client_id", id);

    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) {
      setError(error.message);
    } else {
      fetchClients();
      fetchVehicules();
    }
  }

  // Ouvrir le modal de sélection véhicule (comme l'original HTML pickVehicle)
  function openVehiclePicker(client: Client) {
    setPickedClient(client);
    setShowClientInfo(false);
  }

  function closeVehiclePicker() {
    setPickedClient(null);
    setShowClientInfo(false);
  }

  const filteredClients = clients
    .filter((client) => {
      const term = search.toLowerCase();
      return (
        client.nom?.toLowerCase().includes(term) ||
        client.prenom?.toLowerCase().includes(term) ||
        client.entreprise?.toLowerCase().includes(term) ||
        client.email?.toLowerCase().includes(term) ||
        client.email2?.toLowerCase().includes(term) ||
        client.telephone?.includes(term) ||
        client.telephone2?.includes(term) ||
        client.ville?.toLowerCase().includes(term)
      );
    })
    .sort((a, b) => {
      const nameA = getClientDisplayName(a);
      const nameB = getClientDisplayName(b);
      return nameA.localeCompare(nameB, "fr-CA", { sensitivity: "base" });
    });

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-foreground">Clients</h1>
            <span className="rounded-full bg-blue-100 dark:bg-blue-900/30 px-3 py-1 text-sm font-medium text-blue-800 dark:text-blue-400">
              {filteredClients.length} client{filteredClients.length !== 1 && "s"}
            </span>
          </div>
          <button
            onClick={openNew}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            + Nouveau client
          </button>
        </div>

        <input
          type="text"
          placeholder="Rechercher par nom, email, telephone ou ville..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-6 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />

        {loading && (
          <p className="py-12 text-center text-gray-500 dark:text-gray-400">
            Chargement des clients...
          </p>
        )}

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/30 p-4 text-sm text-red-600 dark:text-red-400">
            Erreur : {error}
          </div>
        )}

        {!loading && !error && filteredClients.length === 0 && (
          <p className="py-12 text-center text-gray-500 dark:text-gray-400">Aucun client trouve.</p>
        )}

        {!loading && !error && filteredClients.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900 text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-6 py-3">Nom</th>
                  <th className="px-6 py-3">Telephone</th>
                  <th className="px-6 py-3">Vehicules</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredClients.map((client) => {
                  const nbVehicules = getClientVehicules(client.id).length;
                  return (
                    <tr
                      key={client.id}
                      className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                      onClick={() => openVehiclePicker(client)}
                      title="Cliquer pour choisir un vehicule"
                    >
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          {getClientDisplayName(client)}
                        </div>
                        {client.entreprise && (client.prenom || client.nom) && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Contact: {client.prenom} {client.nom}
                          </div>
                        )}
                        {(client.email || client.email2) && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {[client.email, client.email2].filter(Boolean).join(" | ")}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-700 dark:text-gray-300">
                        <div>{client.telephone || "—"}</div>
                        {client.telephone2 && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">{client.telephone2}</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-gray-700">{nbVehicules}</span>
                      </td>
                      <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => openEdit(client)}
                          className="mr-3 text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          Modifier
                        </button>
                        <button
                          onClick={() => handleDelete(client.id)}
                          className="text-red-600 hover:text-red-800 text-sm font-medium"
                        >
                          Supprimer
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal formulaire client */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-gray-800 p-6 shadow-xl">
            <h2 className="mb-6 text-lg font-semibold text-gray-900 dark:text-gray-100">
              {editingClient ? "Modifier le client" : "Nouveau client"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Entreprise <span className="text-gray-400 font-normal">(optionnel)</span>
                </label>
                <input
                  type="text"
                  placeholder="Nom de l'entreprise"
                  value={form.entreprise}
                  onChange={(e) =>
                    setForm({ ...form, entreprise: formatCapitalize(e.target.value) })
                  }
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Nom
                  </label>
                  <input
                    type="text"
                    required
                    value={form.nom}
                    onChange={(e) => setForm({ ...form, nom: formatCapitalize(e.target.value) })}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Prenom
                  </label>
                  <input
                    type="text"
                    required
                    value={form.prenom}
                    onChange={(e) =>
                      setForm({ ...form, prenom: formatCapitalize(e.target.value) })
                    }
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Email
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Email 2
                  </label>
                  <input
                    type="email"
                    placeholder="Optionnel"
                    value={form.email2}
                    onChange={(e) =>
                      setForm({ ...form, email2: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Telephone
                  </label>
                  <input
                    type="tel"
                    placeholder="(450)750-6862"
                    value={form.telephone}
                    onChange={(e) =>
                      setForm({ ...form, telephone: formatTelephone(e.target.value) })
                    }
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Telephone 2
                  </label>
                  <input
                    type="tel"
                    placeholder="Optionnel"
                    value={form.telephone2}
                    onChange={(e) =>
                      setForm({ ...form, telephone2: formatTelephone(e.target.value) })
                    }
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Adresse
                </label>
                <input
                  type="text"
                  value={form.adresse}
                  onChange={(e) =>
                    setForm({ ...form, adresse: formatCapitalize(e.target.value) })
                  }
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Ville
                  </label>
                  <input
                    type="text"
                    value={form.ville}
                    onChange={(e) =>
                      setForm({ ...form, ville: formatCapitalize(e.target.value) })
                    }
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Code postal
                  </label>
                  <input
                    type="text"
                    placeholder="J0K 2R0"
                    value={form.code_postal}
                    onChange={(e) =>
                      setForm({ ...form, code_postal: formatCodePostal(e.target.value) })
                    }
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
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
                    : editingClient
                      ? "Enregistrer"
                      : "Ajouter"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal sélection véhicule (comme pickVehicle dans l'original) */}
      {pickedClient && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={closeVehiclePicker}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white dark:bg-gray-800 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Vehicules de {getClientDisplayName(pickedClient)}
              </h2>
              <button
                onClick={closeVehiclePicker}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none"
              >
                ✕
              </button>
            </div>

            {/* Info client toggle */}
            <div className="border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setShowClientInfo(!showClientInfo)}
                className="w-full px-6 py-2.5 flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <span className="text-xs">{showClientInfo ? "▼" : "▶"}</span>
                👤 Info client
              </button>
              {showClientInfo && (
                <div className="px-6 pb-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  {(pickedClient.telephone || pickedClient.telephone2) && (
                    <div>
                      <span className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase">Telephone</span>
                      <div className="text-gray-900 dark:text-gray-100">{pickedClient.telephone || "—"}</div>
                      {pickedClient.telephone2 && (
                        <div className="text-gray-500 dark:text-gray-400 text-xs">{pickedClient.telephone2}</div>
                      )}
                    </div>
                  )}
                  {(pickedClient.email || pickedClient.email2) && (
                    <div>
                      <span className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase">Email</span>
                      <div className="text-gray-900 dark:text-gray-100 break-all text-xs">{pickedClient.email || "—"}</div>
                      {pickedClient.email2 && (
                        <div className="text-gray-500 dark:text-gray-400 break-all text-xs">{pickedClient.email2}</div>
                      )}
                    </div>
                  )}
                  {(pickedClient.adresse || pickedClient.ville) && (
                    <div className="col-span-2">
                      <span className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase">Adresse</span>
                      <div className="text-gray-900 dark:text-gray-100">
                        {[pickedClient.adresse, pickedClient.ville, pickedClient.code_postal].filter(Boolean).join(", ")}
                      </div>
                    </div>
                  )}
                  {pickedClient.entreprise && (pickedClient.prenom || pickedClient.nom) && (
                    <div className="col-span-2">
                      <span className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase">Contact</span>
                      <div className="text-gray-900 dark:text-gray-100">{pickedClient.prenom} {pickedClient.nom}</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Body */}
            <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">
              {getClientVehicules(pickedClient.id).length === 0 ? (
                <div className="py-8 text-center">
                  <div className="text-4xl mb-3">🚗</div>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">
                    Aucun vehicule pour ce client.
                  </p>
                  <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
                    Ajoutez un vehicule dans la section Vehicules.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {getClientVehicules(pickedClient.id).map((v) => (
                    <div
                      key={v.id}
                      className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 p-4 hover:border-blue-300 transition-colors"
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-2xl">🚗</span>
                        <div>
                          <div className="font-semibold text-gray-900 dark:text-gray-100">
                            {v.annee ? v.annee + " " : ""}
                            {v.marque} {v.modele}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2 flex-wrap">
                            {v.plaque && (
                              <span className="rounded bg-gray-200 dark:bg-gray-600 px-1.5 py-0.5 font-mono font-medium text-gray-700 dark:text-gray-300">
                                {v.plaque}
                              </span>
                            )}
                            {v.numero_unite && (
                              <span className="rounded bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 font-medium text-blue-700 dark:text-blue-400">
                                Unite: {v.numero_unite}
                              </span>
                            )}
                            {v.kilometrage && (
                              <span>{Number(v.kilometrage).toLocaleString("fr-CA")} km</span>
                            )}
                            {v.couleur && <span>— {v.couleur}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            closeVehiclePicker();
                            router.push(
                              `/bons-travail?client_id=${pickedClient.id}&vehicule_id=${v.id}`
                            );
                          }}
                          className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                        >
                          🔧 Nouveau bon de travail
                        </button>
                        <button
                          onClick={() => {
                            closeVehiclePicker();
                            router.push(
                              `/factures?client_id=${pickedClient.id}&vehicule_id=${v.id}`
                            );
                          }}
                          className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                        >
                          📄 Nouvelle facture
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-3 flex justify-end">
              <button
                onClick={closeVehiclePicker}
                className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
