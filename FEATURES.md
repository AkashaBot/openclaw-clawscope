# ClawScope Features Roadmap

## Status actuel (2026-02-10)

### ✅ Déjà implémenté
- Global Search (hybrid/lexical/semantic)
- Timeline view
- Sessions sidebar
- Activity feed
- Scheduled tasks
- Health bar + stats

### 🚧 À ajouter

#### 1. Knowledge Graph Visualization (`/graph`)
**Page HTML avec D3.js**:
```html
- Force-directed graph
- Nodes = entities (subjects/objects)
- Edges = facts (predicates)
- Click to expand entity
- Filter by confidence
```

**Backend endpoint `/graph-data`**:
```typescript
// Utilise getEntityGraph, getAllFacts du core
{
  nodes: [{ id, label, type, count }],
  edges: [{ source, target, predicate, confidence }]
}
```

#### 2. Cross-Client MCP Support
**Modifier le backend**:
- Ajouter champ `mcp_client` dans les résultats
- Filtrer par client (Claude, Cursor, Windsurf, etc.)

**UI**:
- Dropdown "Client" dans la barre de recherche
- Badge client sur chaque résultat

#### 3. Memory Categories/Tags
**Déjà partiellement là**:
- Le champ `tags` existe dans le payload
- Manque filtre UI

**À ajouter**:
- Sidebar "Categories" avec facettes
- Filtre par tag cliquable

## Fichiers à modifier

1. **src/frontend.ts**:
   - Ajouter `graphHtml` template
   - Ajouter endpoint `/graph`
   - Ajouter endpoint `/graph-data`
   - MAJ navigation

2. **src/offline-sqlite-backend.ts**:
   - Exposer `getGraphStats`, `getEntityGraph`, `getAllFacts`
   - Ajouter méthode `getGraphData()`

3. **package.json**:
   - MAJ dependency `@akashabot/openclaw-memory-offline-core` vers ^0.5.0

## Prochaines étapes

1. Vérifier que le core ^0.5.0 est bien installé
2. Implémenter `/graph-data`
3. Créer la page `/graph`
4. Builder et redémarrer le serveur
