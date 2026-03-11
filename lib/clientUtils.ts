/** Returns the display name for a client: entreprise if set, otherwise prenom + nom */
export function getClientDisplayName(client: {
  entreprise?: string | null;
  prenom?: string | null;
  nom?: string | null;
}): string {
  if (client.entreprise) return client.entreprise;
  return `${client.prenom || ""} ${client.nom || ""}`.trim() || "—";
}
