# Mission Control - Test

## Lancer le serveur

```bash
cd C:\Users\algon\clawd\projects\openclaw-mission-control
npm run build
node dist/server.js
```

Le serveur doit afficher:
```
Mission Control search API listening on http://localhost:3099
```

## Tester l'API

Dans un autre terminal:
```bash
curl "http://localhost:3099/memory/search?q=test&limit=5"
```

Résultat attendu: JSON avec les mémoires correspondantes.
