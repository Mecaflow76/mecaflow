import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { supabase } from "@/lib/supabaseClient";
import { buildInvoiceEmailHtml, InvoiceEmailData } from "@/lib/emailTemplates/invoiceEmail";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { factureId } = body;

    if (!factureId) {
      return NextResponse.json(
        { error: "ID de facture manquant." },
        { status: 400 }
      );
    }

    /* ── 1. Fetch la facture avec client + véhicule ── */
    const { data: facture, error: fetchError } = await supabase
      .from("factures")
      .select(
        "id, date_facture, description, garantie, km, discount_pct, deposit, notes, statut, montant_total, labour_rows, parts_rows, clients(id, nom, prenom, email), vehicules(id, marque, modele, plaque, vin)"
      )
      .eq("id", factureId)
      .single();

    if (fetchError || !facture) {
      return NextResponse.json(
        { error: "Facture introuvable." },
        { status: 404 }
      );
    }

    /* ── 2. Validations ── */
    const client = facture.clients as unknown as { id: string; nom: string; prenom: string; email: string } | null;
    const vehicule = facture.vehicules as unknown as { id: string; marque: string; modele: string; plaque: string; vin: string } | null;

    if (!client?.email) {
      return NextResponse.json(
        { error: "Ce client n'a pas d'adresse courriel." },
        { status: 400 }
      );
    }

    if (facture.statut === "annulee") {
      return NextResponse.json(
        { error: "Impossible d'envoyer une facture annulee." },
        { status: 400 }
      );
    }

    /* ── 3. Construire les données du template ── */
    const labourRows = (facture.labour_rows as Array<{ desc: string; qty: number; rate: number }>) || [];
    const partsRows = (facture.parts_rows as Array<{ desc: string; num: string; qty: number; cost: number; price: number }>) || [];

    const emailData: InvoiceEmailData = {
      id: facture.id,
      date_facture: facture.date_facture || "",
      description: facture.description || "",
      garantie: facture.garantie || "",
      km: facture.km || "",
      discount_pct: facture.discount_pct || 0,
      deposit: facture.deposit || 0,
      notes: facture.notes || "",
      labour_rows: labourRows.map((r) => ({
        desc: r.desc || "",
        qty: r.qty || 0,
        rate: r.rate || 0,
      })),
      // Sécurité : on ne transmet PAS le champ cost
      parts_rows: partsRows.map((r) => ({
        desc: r.desc || "",
        num: r.num || "",
        qty: r.qty || 0,
        price: parseFloat(String(r.price)) || 0,
      })),
      client: {
        nom: client.nom,
        prenom: client.prenom,
        email: client.email,
      },
      vehicule: vehicule
        ? {
            marque: vehicule.marque || "",
            modele: vehicule.modele || "",
            plaque: vehicule.plaque || "",
            vin: vehicule.vin || "",
          }
        : null,
    };

    /* ── 4. Générer le HTML ── */
    const html = buildInvoiceEmailHtml(emailData);

    /* ── 5. Envoyer via Resend ── */
    const { error: sendError } = await resend.emails.send({
      from: "Garage Lagarde <factures@garagelagarde.ca>",
      to: client.email,
      subject: `Facture — Garage Lagarde — ${facture.date_facture}`,
      html,
    });

    if (sendError) {
      console.error("Resend error:", sendError);
      return NextResponse.json(
        { error: `Erreur d'envoi: ${sendError.message}` },
        { status: 500 }
      );
    }

    /* ── 6. Mettre à jour le statut si brouillon ── */
    let statusUpdated = false;
    if (facture.statut === "brouillon") {
      const { error: updateError } = await supabase
        .from("factures")
        .update({ statut: "envoyee" })
        .eq("id", factureId);

      if (!updateError) statusUpdated = true;
    }

    return NextResponse.json({ success: true, statusUpdated });
  } catch (err) {
    console.error("Send invoice email error:", err);
    return NextResponse.json(
      { error: "Erreur serveur inattendue." },
      { status: 500 }
    );
  }
}
