# OpenClaw Mission Control – Global Search & Activity

## Vision

Construire un tableau de bord "Mission Control" pour OpenClaw qui offre :

1. **Global search** : recherche unique sur toutes les mémoires, documents, tâches et conversations.
2. **Activity feed** : historique chronologique de tout ce que font les agents OpenClaw.
3. **Vue calendrier** : visualisation des tâches planifiées (cron + jobs agents).

Première étape : **Global Search** branché sur `openclaw-memory-offline-sqlite`.

---

## 1) Périmètre v1 – Global Search uniquement

### 1.1 Objectif

Offrir une commande et/ou une API permettant de rechercher :
- les mémoires (offline-sqlite)
- (plus tard) les documents indexés
- (plus tard) les conversations / tâches capturées

avec un seul point d'entrée, et des résultats unifiés.

### 1.2 Modèle logique `search_items`

Chaque élément retourné par la recherche est représenté par :

- `id` : identifiant unique (ex: `mem_123`, `doc_42`)
- `kind` : type d'item (`memory | doc | convo | task | event`, v1 = `memory`)
- `source` : origine (whatsapp, github, moltbook, etc.) si disponible
- `title` : titre court (optionnel, dérivé du contenu)
- `snippet` : extrait ou résumé textuel
- `created_at` : timestamp ISO
- `score_fts` : score lexical (FTS)
- `score_embed` : score sémantique (embeddings)
- `score` : score global utilisé pour l’ordre des résultats
- `payload` : JSON brut pour la navigation/détail (ID mémoire, texte complet, métadonnées…)

Implémentation v1 :
- peut être une **vue SQL** ou juste une structure de retour au niveau du moteur de recherche, sans vue dédiée.
- ne couvre que les mémoires, mais la forme doit permettre d'ajouter docs/convos sans tout casser.

---

## 2) API / CLI

### 2.1 Commande CLI `openclaw memory search`

#### 2.1.1 Signature

```bash
openclaw memory search "<query>" [options]
```

- `query` : chaîne libre, en langage naturel ou mots-clés.

#### 2.1.2 Options

- `--mode <lexical|semantic|hybrid>`
  - Défaut : `hybrid`
  - `lexical` : uniquement FTS (rapide, pas d'embeddings)
  - `semantic` : uniquement embeddings
  - `hybrid` : combine FTS + embeddings (recommandé)

- `--limit <N>`
  - Défaut : `20`
  - Nombre maximal de résultats retournés après ranking.

- `--k <N>`
  - Défaut : `80`
  - Nombre de candidats récupérés avant ranking final (top-K lexical/embedding).

- `--kind <kinds>`
  - Ex : `--kind memory,doc,convo`
  - Filtre par type logique (`memory | doc | convo | task | event`).
  - v1 : accepte `memory` uniquement, mais l’API est future-proof.

- `--source <sources>`
  - Ex : `--source whatsapp,github,moltbook`
  - Filtre par origine si disponible dans les métadonnées.

- `--json-pretty`
  - Active un format JSON indenté, plus lisible en CLI.

- `--raw`
  - Retourne la réponse interne brute du moteur offline-sqlite (mode debug).

#### 2.1.3 Sortie JSON v1

Format standardisé `search_items[]` :

```json
[
  {
    "id": "mem_123",
    "kind": "memory",
    "source": "whatsapp",
    "title": "Offline memory plugin feedback",
    "snippet": "User reported that recall sometimes misses...",
    "score": 0.87,
    "score_fts": 12.3,
    "score_embed": 0.91,
    "created_at": "2026-02-05T21:34:10Z",
    "payload": {
      "memory_id": "mem_123",
      "text": "...texte complet..."
    }
  }
]
```

Contraintes :
- `id`, `kind`, `snippet`, `score` sont toujours présents.
- `source`, `title`, `score_fts`, `score_embed`, `created_at`, `payload` peuvent être optionnels selon le type.

#### 2.1.4 Exemples d’usage

```bash
# Recherche hybride simple
openclaw memory search "offline memory recall bug"

# Recherche stricte FTS, 50 résultats
openclaw memory search "payments schema" --mode lexical --limit 50

# Filtrer par type et source
openclaw memory search "OpenClaw dev" --kind memory,doc --source github

# Sortie JSON jolie pour inspection
openclaw memory search "cron jobs" --json-pretty > results.json
```

#### 2.1.5 Interface interne (plugin offline-sqlite)

La commande CLI sera un mince wrapper autour d’une API interne type :

```ts
type SearchMode = 'lexical' | 'semantic' | 'hybrid';

type SearchRequest = {
  query: string;
  mode?: SearchMode;
  limit?: number;   // défaut 20
  k?: number;       // défaut 80
  kinds?: string[]; // 'memory', 'doc', ...
  sources?: string[];
};

type SearchItem = {
  id: string;
  kind: string;
  source?: string;
  title?: string;
  snippet: string;
  score: number;
  score_fts?: number;
  score_embed?: number;
  created_at?: string; // ISO
  payload?: any;
};

function search(request: SearchRequest): Promise<SearchItem[]>;
```

Objectif : garder cette interface stable pour pouvoir la réutiliser depuis :
- l’API HTTP `/memory/search`
- d’autres plugins OpenClaw
- l’UI Mission Control (front-end).

### 2.2 API HTTP (optionnelle v1.1)

Endpoint proposé :

```http
GET /memory/search?q=...&mode=hybrid&limit=20
```

- Paramètres : `q`, `mode`, `limit`, `kind`, `source`.
- Retour : même structure JSON que la commande CLI.

Backend possible :
- petit serveur Node/Express ou FastAPI qui wrappe la lib offline-sqlite.

---

## 3) UI – Global Search (esquisse)

### 3.1 UX de base

- Barre de recherche en haut (champ texte + bouton)
- Liste de résultats :
  - badge `MEMORY / DOC / CONVO / TASK`
  - source (icône ou label: WhatsApp, GitHub, Moltbook…)
  - snippet
  - date
  - score (optionnel / debug)
- Filtres latéraux ou au-dessus :
  - par `kind`
  - par `source`
  - par plage de dates (plus tard)

### 3.2 Stack UI proposée

- V1 : simple front NextJS faisant des appels à l’API `/memory/search`.
- Pas besoin de Convex tout de suite, mais compatible avec le prompt du tweet si on veut aligner la story publique.

---

## 4) Roadmap (esquisse)

1. **Intégration Global Search dans offline-sqlite**
   - [ ] Définir l’interface de recherche interne qui renvoie des `search_items`.
   - [ ] Implémenter la commande CLI `openclaw memory search`.
   - [ ] Ajouter tests de base (résultat non vide, tri par score, etc.).

2. **API HTTP légère**
   - [ ] Exposer `/memory/search` en GET.
   - [ ] Ajouter une option de config pour activer/désactiver l’API.

3. **UI minimale Global Search**
   - [ ] Page unique de recherche.
   - [ ] Affichage des résultats + filtres simples.
   - [ ] Vue détail (facultatif v1).

4. **Extension à d’autres sources**
   - [ ] Ajout des docs indexés.
   - [ ] Ajout des conversations / tâches.

Ce fichier servira de référence et pourra être affiné au fur et à mesure (ajout de sections pour Activity Feed et Calendar ensuite).