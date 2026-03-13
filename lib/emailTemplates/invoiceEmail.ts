/* ═══════════════════════════════════════════════════════════
   Template HTML de facture pour envoi par courriel
   ═══════════════════════════════════════════════════════════
   SÉCURITÉ : Ce template n'inclut JAMAIS :
   - notes_internes
   - cost (coût d'achat des pièces)
   - calculs de marge
   ═══════════════════════════════════════════════════════════ */

export interface InvoiceEmailData {
  id: string;
  date_facture: string;
  description: string;
  garantie: string;
  km: string;
  discount_pct: number;
  deposit: number;
  notes: string;
  labour_rows: Array<{ desc: string; qty: number; rate: number }>;
  parts_rows: Array<{ desc: string; num: string; qty: number; price: number }>;
  client: { nom: string; prenom: string; email: string };
  vehicule: { marque: string; modele: string; plaque: string; vin: string } | null;
}

const fmtCAD = (n: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(n);

export function buildInvoiceEmailHtml(data: InvoiceEmailData): string {
  /* ── Calculs ── */
  const labourTotal = data.labour_rows.reduce((s, r) => s + r.qty * r.rate, 0);
  const partsTotal = data.parts_rows.reduce((s, r) => s + r.qty * r.price, 0);
  const sub = labourTotal + partsTotal;
  const discPct = data.discount_pct || 0;
  const disc = partsTotal * (discPct / 100);
  const dep = data.deposit || 0;
  const taxable = Math.max(0, sub - disc);
  const tps = taxable * 0.05;
  const tvq = taxable * 0.09975;
  const total = taxable + tps + tvq;
  const due = Math.max(0, total - dep);

  /* ── Lignes main d'oeuvre ── */
  const labourRowsHtml = data.labour_rows
    .filter((r) => r.desc?.trim())
    .map(
      (r) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${esc(r.desc)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${r.qty}h</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${fmtCAD(r.rate)}/h</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${fmtCAD(r.qty * r.rate)}</td>
      </tr>`
    )
    .join("");

  /* ── Lignes pièces ── */
  const partsRowsHtml = data.parts_rows
    .filter((r) => r.desc?.trim())
    .map(
      (r) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${esc(r.desc)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;">${esc(r.num || "")}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${r.qty}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${fmtCAD(r.price)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${fmtCAD(r.qty * r.price)}</td>
      </tr>`
    )
    .join("");

  /* ── Véhicule ── */
  const veh = data.vehicule;
  const vehiculeInfo = veh
    ? `${esc(veh.marque)} ${esc(veh.modele)}${veh.plaque ? ` — ${esc(veh.plaque)}` : ""}${veh.vin ? ` (VIN: ${esc(veh.vin)})` : ""}`
    : "";

  /* ── Lignes totaux ── */
  let totalsHtml = "";

  totalsHtml += totalRow("Sous-total", fmtCAD(sub));
  if (disc > 0) {
    totalsHtml += totalRow(`Rabais pieces (${discPct}%)`, `-${fmtCAD(disc)}`, "#dc2626");
  }
  totalsHtml += totalRow("TPS (5%)", fmtCAD(tps));
  totalsHtml += totalRow("TVQ (9,975%)", fmtCAD(tvq));
  totalsHtml += `
    <tr>
      <td style="padding:10px 12px;border-top:2px solid #1f2937;font-weight:700;font-size:16px;">TOTAL</td>
      <td style="padding:10px 12px;border-top:2px solid #1f2937;text-align:right;font-weight:700;font-size:16px;">${fmtCAD(total)}</td>
    </tr>`;
  if (dep > 0) {
    totalsHtml += totalRow("Acompte", `-${fmtCAD(dep)}`);
    totalsHtml += `
      <tr>
        <td style="padding:10px 12px;font-weight:700;font-size:16px;color:#2563eb;">SOLDE DU</td>
        <td style="padding:10px 12px;text-align:right;font-weight:700;font-size:16px;color:#2563eb;">${fmtCAD(due)}</td>
      </tr>`;
  }

  /* ── Sections optionnelles ── */
  const descSection = data.description?.trim()
    ? `<tr><td style="padding:16px 0;">
        <p style="margin:0 0 4px;font-weight:600;color:#374151;">Description des travaux</p>
        <p style="margin:0;color:#4b5563;">${esc(data.description)}</p>
      </td></tr>`
    : "";

  const kmLine = data.km?.trim()
    ? `<span style="margin-right:24px;"><strong>Kilometrage :</strong> ${esc(data.km)} km</span>`
    : "";

  const garantieLine = data.garantie?.trim()
    ? `<span><strong>Garantie :</strong> ${esc(data.garantie)}</span>`
    : "";

  const metaLine =
    kmLine || garantieLine
      ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">${kmLine}${garantieLine}</td></tr>`
      : "";

  const notesSection = data.notes?.trim()
    ? `<tr><td style="padding:16px 0;">
        <p style="margin:0 0 4px;font-weight:600;color:#374151;">Notes</p>
        <p style="margin:0;color:#4b5563;">${esc(data.notes)}</p>
      </td></tr>`
    : "";

  /* ═══ HTML complet ═══ */
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Facture — Garage Lagarde</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

          <!-- ═══ EN-TÊTE GARAGE ═══ -->
          <tr>
            <td style="background:#1e3a5f;padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:1px;">GARAGE LAGARDE</h1>
              <p style="margin:8px 0 0;color:#93c5fd;font-size:13px;">
                2232 Rang Des Continuations, St-Jacques, QC J0K 2R0<br>
                (450) 750-6862 — facturation@garagelagarde.ca
              </p>
            </td>
          </tr>

          <!-- ═══ BANDE FACTURE ═══ -->
          <tr>
            <td style="background:#2563eb;padding:12px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="color:#ffffff;font-weight:700;font-size:16px;">FACTURE</td>
                  <td style="color:#bfdbfe;text-align:right;font-size:14px;">${esc(data.date_facture)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ═══ CONTENU ═══ -->
          <tr>
            <td style="padding:28px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">

                <!-- Client + Véhicule -->
                <tr>
                  <td style="padding-bottom:20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width:50%;vertical-align:top;">
                          <p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;color:#6b7280;font-weight:600;">Client</p>
                          <p style="margin:0;font-size:16px;font-weight:600;">${esc(data.client.prenom)} ${esc(data.client.nom)}</p>
                        </td>
                        ${
                          vehiculeInfo
                            ? `<td style="width:50%;vertical-align:top;">
                                <p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;color:#6b7280;font-weight:600;">Vehicule</p>
                                <p style="margin:0;font-size:14px;">${vehiculeInfo}</p>
                              </td>`
                            : ""
                        }
                      </tr>
                    </table>
                  </td>
                </tr>

                ${metaLine}
                ${descSection}

                <!-- ═══ MAIN D'OEUVRE ═══ -->
                ${
                  labourRowsHtml
                    ? `<tr>
                        <td style="padding:16px 0 8px;">
                          <h3 style="margin:0;font-size:14px;text-transform:uppercase;color:#6b7280;letter-spacing:0.5px;">Main d'oeuvre</h3>
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
                            <thead>
                              <tr style="background:#f9fafb;">
                                <th style="padding:8px 12px;text-align:left;font-weight:600;color:#6b7280;font-size:12px;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">Description</th>
                                <th style="padding:8px 12px;text-align:right;font-weight:600;color:#6b7280;font-size:12px;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">Heures</th>
                                <th style="padding:8px 12px;text-align:right;font-weight:600;color:#6b7280;font-size:12px;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">Taux</th>
                                <th style="padding:8px 12px;text-align:right;font-weight:600;color:#6b7280;font-size:12px;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">Total</th>
                              </tr>
                            </thead>
                            <tbody>${labourRowsHtml}</tbody>
                          </table>
                        </td>
                      </tr>`
                    : ""
                }

                <!-- ═══ PIÈCES ═══ -->
                ${
                  partsRowsHtml
                    ? `<tr>
                        <td style="padding:16px 0 8px;">
                          <h3 style="margin:0;font-size:14px;text-transform:uppercase;color:#6b7280;letter-spacing:0.5px;">Pieces</h3>
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
                            <thead>
                              <tr style="background:#f9fafb;">
                                <th style="padding:8px 12px;text-align:left;font-weight:600;color:#6b7280;font-size:12px;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">Description</th>
                                <th style="padding:8px 12px;text-align:left;font-weight:600;color:#6b7280;font-size:12px;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">No piece</th>
                                <th style="padding:8px 12px;text-align:right;font-weight:600;color:#6b7280;font-size:12px;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">Qte</th>
                                <th style="padding:8px 12px;text-align:right;font-weight:600;color:#6b7280;font-size:12px;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">Prix</th>
                                <th style="padding:8px 12px;text-align:right;font-weight:600;color:#6b7280;font-size:12px;text-transform:uppercase;border-bottom:2px solid #e5e7eb;">Total</th>
                              </tr>
                            </thead>
                            <tbody>${partsRowsHtml}</tbody>
                          </table>
                        </td>
                      </tr>`
                    : ""
                }

                <!-- ═══ TOTAUX ═══ -->
                <tr>
                  <td style="padding:24px 0 0;">
                    <table cellpadding="0" cellspacing="0" style="margin-left:auto;width:280px;font-size:14px;">
                      <tbody>${totalsHtml}</tbody>
                    </table>
                  </td>
                </tr>

                ${notesSection}

              </table>
            </td>
          </tr>

          <!-- ═══ PIED DE PAGE ═══ -->
          <tr>
            <td style="background:#f9fafb;padding:20px 32px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0 0 4px;font-weight:600;color:#374151;">Merci de votre confiance!</p>
              <p style="margin:0;font-size:13px;color:#6b7280;">
                Garage Lagarde — (450) 750-6862 — facturation@garagelagarde.ca
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* ── Helpers ── */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function totalRow(label: string, value: string, color?: string): string {
  return `
    <tr>
      <td style="padding:6px 12px;color:#4b5563;">${label}</td>
      <td style="padding:6px 12px;text-align:right;${color ? `color:${color};` : ""}">${value}</td>
    </tr>`;
}
