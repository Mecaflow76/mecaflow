# CLAUDE.md — MecaFlow

## Apercu du projet

MecaFlow est un **logiciel de gestion de garage automobile** developpe pour le **Garage Lagarde**, un atelier de reparation automobile situe a St-Jacques, Quebec, Canada. L'application gere les clients, vehicules, bons de travail, factures, rendez-vous et rapports d'affaires.

L'interface et tous les textes visibles sont en **francais (Quebec)**. Les identifiants dans le code (variables, interfaces, commentaires) melangent francais et anglais — suivre la convention existante lors des modifications.

## Stack technique

- **Framework** : Next.js 16 (App Router) avec React 19
- **Langage** : TypeScript (mode strict)
- **Style** : Tailwind CSS v4 (via `@tailwindcss/postcss`) — pas de `tailwind.config.js`, la config est dans `globals.css`
- **Base de donnees** : Supabase (PostgreSQL) — SDK cote client (`@supabase/supabase-js`)
- **Courriel** : Resend (envoi de factures par courriel)
- **Theme** : Mode sombre/clair via `next-themes` (base sur les classes, defaut : clair)
- **Deploiement** : Vercel
- **Polices** : Geist Sans + Geist Mono (via `next/font/google`)

## Commandes

```bash
npm run dev      # Demarrer le serveur de developpement
npm run build    # Build de production
npm run start    # Demarrer le serveur de production
npm run lint     # Executer ESLint
```

Aucun test n'est configure dans ce projet.

## Structure du projet

```
app/
├── layout.tsx              # Layout racine (Sidebar + ThemeProvider)
├── page.tsx                # Tableau de bord — cartes de stats (clients, vehicules, RDV, factures)
├── globals.css             # Imports Tailwind v4, variables CSS, styles d'impression
├── components/
│   ├── Sidebar.tsx         # Barre de navigation laterale avec bascule mode sombre
│   └── ThemeProvider.tsx    # Wrapper next-themes
├── clients/page.tsx        # CRUD clients + modal de selection de vehicule
├── vehicules/page.tsx      # CRUD vehicules + decodeur VIN (API NHTSA) + historique bons
├── bons-travail/page.tsx   # Bons de travail avec chronometre (start/pause/stop)
├── factures/page.tsx       # Factures — lignes main d'oeuvre, pieces, taxes, rabais, impression, courriel
├── agenda/page.tsx         # Calendrier — vues 3 jours/semaine/mois, RDV + blocs bons de travail
├── rapports/page.tsx       # Rapports — KPIs, revenus, rentabilite pieces, top clients
└── api/
    └── factures/
        └── send-email/route.ts  # API POST — envoie la facture par courriel via Resend

lib/
├── supabaseClient.js       # Client Supabase singleton (env vars avec fallbacks pour le prerendering)
└── emailTemplates/
    └── invoiceEmail.ts      # Constructeur de template HTML pour les courriels de factures
```

## Patterns d'architecture

### Structure des pages
Chaque page est un **composant client** (`"use client"`) qui :
1. Definit des interfaces TypeScript pour ses modeles de donnees en haut du fichier
2. Recupere les donnees de Supabase dans `useEffect` au montage
3. Gere l'etat local avec `useState` (aucune gestion d'etat globale)
4. Utilise des modales (`fixed inset-0 z-50`) pour les formulaires de creation/edition
5. Inclut des fonctionnalites de recherche/filtrage

### Flux de donnees
- **Aucun composant serveur** — toutes les pages utilisent `"use client"` et fetchent les donnees cote client via Supabase
- **Aucune route API** sauf pour l'envoi de courriels (cle API Resend cote serveur)
- Les requetes Supabase utilisent `.select()` avec des jointures relationnelles (ex: `clients(id, nom, prenom)`)
- Les suppressions en cascade sont gerees manuellement dans le code client (pas via les FK de la BD)

### Tables Supabase
La base de donnees contient ces tables (deduites des requetes) :
- `clients` — nom, prenom, email, telephone, adresse, ville, code_postal
- `vehicules` — client_id, marque, modele, annee, plaque, vin, moteur, lieu_fabrication, kilometrage, couleur
- `factures` — client_id, vehicule_id, date_facture, montant_total, statut, labour_rows (JSONB), parts_rows (JSONB), discount_pct, deposit, notes, notes_internes, description, garantie, km
- `bons_travail` — client_id, vehicule_id, date_creation, heure_debut, heure_fin, statut, mecanicien, symptomes, diagnostic, travaux, notes, chrono_ms, chrono_segments (JSONB)
- `rendezvous` — client_id, vehicule_id, date_rdv, heure, heure_fin, titre, statut, notes

### Statuts des factures
`brouillon` → `envoyee` → `payee` | `en_retard` | `annulee`

### Statuts des bons de travail
`ouvert` → `en_cours` → `attente_pieces` | `complete` | `annule`

### Statuts des rendez-vous
`en_attente` → `confirme` → `termine` | `annule`

## Conventions de code

### Style
- Utiliser exclusivement les **classes utilitaires Tailwind CSS** — pas de classes CSS personnalisees (sauf les styles d'impression dans `globals.css`)
- Toujours supporter le **mode sombre** avec les variantes `dark:` (ex: `text-gray-900 dark:text-gray-100`)
- Les styles d'impression utilisent les classes `print:hidden` / `print:block` et des regles `@media print` dans `globals.css`
- Patterns de composants coherents : `rounded-lg`, `border border-gray-200 dark:border-gray-700`, `bg-white dark:bg-gray-800`
- Le bleu est la couleur d'accent principale (`bg-blue-600`, `text-blue-700`)

### Patterns de formulaires
- Les formulaires utilisent des inputs controles avec `useState` et des constantes `emptyForm`
- Les numeros de telephone sont auto-formates : `(450)750-6862`
- Les noms et adresses sont auto-capitalises (y compris apres les traits d'union : `St-Jacques`)
- Les codes postaux sont auto-formates : `J0K 2R0`
- Les champs VIN valident 17 caracteres et supportent le decodage via l'API NHTSA

### Patterns de composants
- Les badges de statut utilisent des pilules colorees : `rounded-full px-2.5 py-0.5 text-xs font-medium`
- Les tableaux utilisent : un wrapper `overflow-hidden rounded-lg border` avec des lignes `divide-y`
- Les modales utilisent : `fixed inset-0 z-50 flex items-center justify-center bg-black/40`
- Les etats de chargement affichent : `py-12 text-center text-gray-500`
- Les messages d'erreur dans : `rounded-lg bg-red-50 dark:bg-red-900/30 p-4 text-sm text-red-600`

### Devise / Locale
- Dollars canadiens (CAD), formates avec `Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" })`
- Taxes du Quebec : TPS 5% + TVQ 9,975%
- Les rabais s'appliquent sur le prix detail des pieces seulement (pas sur la main d'oeuvre)

### Securite
- Les courriels de factures n'incluent **jamais** le `cost` (prix d'achat), les `notes_internes` ou les calculs de marge
- Le champ `cost` des pieces est strictement interne — visible dans l'app mais exclu des sorties destinees aux clients
- La section "Rentabilite pieces" dans les rapports est marquee comme interne (`🔒`)
- Le client Supabase utilise des variables d'env `NEXT_PUBLIC_` avec des fallbacks pour le prerendering Vercel

## Variables d'environnement

Requises (a configurer dans Vercel / `.env.local`) :
- `NEXT_PUBLIC_SUPABASE_URL` — URL du projet Supabase
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Cle anonyme Supabase
- `RESEND_API_KEY` — Cle API Resend (cote serveur seulement, utilisee dans la route API)

## Notes importantes

- Le fichier `lib/supabaseClient.js` utilise l'extension `.js` (pas `.ts`) — c'est intentionnel pour la compatibilite
- Les parametres URL sont utilises pour ouvrir automatiquement les formulaires (ex: `/bons-travail?client_id=X&vehicule_id=Y` ou `/bons-travail?edit_id=X`)
- La page factures est le fichier le plus gros et complexe (~1600 lignes) — elle inclut l'edition inline, la mise en page impression et l'envoi par courriel
- La page agenda utilise une implementation de grille calendrier personnalisee (pas de librairie) avec le redimensionnement par glissement pour les RDV
- La Sidebar est cachee a l'impression via `print:hidden`
