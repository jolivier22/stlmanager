# STLManager — Architecture et Fonctionnement

## 1. Ce que fait l’application
- **But**: Parcourir, rechercher et gérer une collection de projets 3D (dossiers) contenant images, GIFs, vidéos, archives (.zip/.7z/.rar) et fichiers STL.
- **Fonctions clés**:
  - Liste paginée/triable des projets avec aperçu (thumbnail), tags et note.
  - Vue détaillée d’un projet (héros, médias classés par type, tailles d’archives).
  - Renommage de projet, suppression d’images, suppression d’un projet (dossier complet).
  - Indexation complète et incrémentale (projets + tags).
  - Recherche texte (nom/chemin), toasts et dialogues de confirmation.

## 2. Périmètre technique (stack)
- **Frontend**: React + Vite, TypeScript, lucide-react (icônes), Nginx (serve statique dans Docker).
- **Backend**: Python 3, FastAPI, Uvicorn, SQLite (cache d’index), OS filesystem access.
- **Conteneurisation**: Docker + Docker Compose (services `web` + `api`).
- **Déploiement**: 
  - Dev Windows: montage du SSD local H: en bind-mount.
  - NAS (Linux/ARM): bind-mount du dossier de collection, `VITE_API_URL` pointant vers l’API.

## 3. Vue d’ensemble — squelette de l’appli
```
stlmanager/
├─ frontend/
│  ├─ Dockerfile (build Vite → Nginx)
│  └─ src/
│     └─ App.tsx (application SPA: navigation, recherche, grille, détail, paramètres)
├─ backend/
│  ├─ app/
│  │  ├─ main.py (création FastAPI, CORS, routes)
│  │  └─ routers/
│  │     └─ folders.py (endpoints de listing, détail, indexation, suppression, tags)
│  └─ data/ (sqlite cache en runtime dans le conteneur)
├─ docker-compose.yml (dev par défaut)
├─ ARCHITECTURE.md (ce document)
└─ README.md (installation, déploiement)
```

## 4. Données et index
- **COLLECTION_ROOT**: répertoire racine de la collection (chaque sous-dossier = 1 projet).
- **SQLite** (fichier `CACHE_DB_PATH`, ex: `/app/data/cache.db`):
  - `folder_index`: index des projets (path, name, rel, mtime, images/gifs/videos/archives/stls, tags, rating, thumbnail_path).
  - `preview_overrides`: miniature personnalisée par chemin (optionnel).
- **Indexation**:
  - Complète (`POST /folders/reindex`): parcourt les dossiers au 1er niveau de `COLLECTION_ROOT`, reconstruit `folder_index`.
  - Incrémentale (`POST /folders/reindex-incremental`): met à jour les entrées modifiées.
  - Résilience: l’index complet ignore les dossiers en erreur et renvoie `{ indexed, failed }`.

## 5. API (principaux endpoints)
- **Santé**
  - `GET /health` → `{ ok: true }` ou texte simple.
- **Liste des projets**
  - `GET /folders/` avec `page`, `limit`, `sort` (`name|date|rating`), `order` (`asc|desc`), `q`.
  - Réponse: `{ items: [...], total: N }`.
- **Détail d’un projet**
  - `GET /folders/detail?path=<abs>`
  - Réponse: métadonnées + médias groupés + `media_sizes.archives` (taille en octets par archive).
- **Suppression de fichier image**
  - `POST /folders/delete-image?path=<abs>` (nom exact côté backend à confirmer selon votre version). Supprime le fichier et met l’index à jour.
- **Suppression d’un projet (dossier)**
  - `POST /folders/delete-project?path=<abs>`
  - Sécurisé: interdit la racine, limite à `COLLECTION_ROOT`.
- **Indexation**
  - `POST /folders/reindex` → `{ indexed, failed }`
  - `POST /folders/reindex-incremental` → état synthétique
- **Tags**
  - `GET /folders/tags?limit=...&q=...` (catalogue de tags)
  - `POST /folders/tags/reindex` (complet) / `POST /folders/tags/reindex-incremental`

Notes:
- Les noms exacts d’endpoint peuvent évoluer légèrement; voir `backend/app/routers/folders.py` pour la vérité de référence.

## 6. Frontend (App.tsx) — logique principale
- **États principaux**:
  - `folders`, `total`, `page`, `limit`, `sort`, `order`, `q` (liste/pagination/tri/recherche)
  - `view` (`home|detail|settings`), `detail` (projet courant)
  - `toasts` (messages), `confirmMsg/confirmAct` (boîte de confirmation)
  - `health` (statut backend)
- **Grille + pagination**:
  - Pagination haut et bas, boutons page précédente/suivante, pages cliquables avec ellipses.
  - Bouton flottant “Haut de page”.
- **Vue détail**:
  - Hero + miniature + actions (renommer, supprimer projet)
  - Listes d’images/GIFs/vidéos/archives/STL/others
  - Taille des archives en lecture humaine
- **Paramètres**:
  - Boutons de scan (index complet, incrémental)
  - Index tags (complet, incrémental)
  - Options d’auto-réindexation
- **Composants utilitaires**:
  - `fileUrl` (construit les URLs vers l’API), `formatBytes`, système de toasts, confirm panel.

## 7. Backend — points notables
- **Sécurité suppression**:
  - `delete-project`: vérifie que `path` ∈ `COLLECTION_ROOT`, refuse la racine.
- **Requêtes listing** (`GET /folders/`):
  - Correction d’ambiguïtés SQL avec alias (`fi`) après JOIN.
  - Deux WHERE distincts (total vs page) pour compter correctement.
- **Mémoire & perfs**:
  - Parcours uniquement du 1er niveau pour l’index complet (évite récursif lourd).
  - Incrémental pour ajustements légers.

## 8. Configuration & déploiement
- **Variables**:
  - API: `COLLECTION_ROOT`, `CACHE_DB_PATH`, `TZ`
  - Web (build Vite): `VITE_API_URL`
- **Docker**:
  - `frontend/Dockerfile`: build Vite, copie `/app/dist` dans Nginx. Supporte `ARG VITE_API_URL`.
  - `docker-compose.yml` (dev Windows):
    - `api` monte `./data:/app/data` + "H:/Fichiers3D:/mnt/CollectionSTL:rw"
    - `web` sert sur 8090, `api` expose 8091:8000
- **NAS**:
  - `COLLECTION_ROOT` pointe sur le dossier qui contient directement les projets.
  - `VITE_API_URL` = `http://<IP_DU_NAS>:8091`
  - Rebuild du `web` quand `VITE_API_URL` change.

## 9. Flux utilisateur (end-to-end)
1) L’utilisateur ouvre le front (Nginx → fichiers Vite). Le frontend connaît l’API via `VITE_API_URL`.
2) Le frontend appelle `GET /folders/` (pagination/sort) et affiche la grille.
3) Clic sur un projet → `GET /folders/detail?path=...` → vue détaillée.
4) Actions (renommer/supprimer image/supprimer projet) → appels `POST` côté API, mises à jour optimistes + toasts.
5) Indexation: via l’onglet Paramètres (complet ou incrémental), rafraîchit les données listées.

## 10. Développement local
- Prérequis: Docker Desktop (Windows) avec partage du disque H:.
- Lancer:
  - `docker compose up -d --build api web`
  - Ouvrir http://localhost:8090
  - API: http://localhost:8091/health

## 11. Dépannage rapide
- La liste est vide sur NAS: vérifier `COLLECTION_ROOT` et le montage, relancer `/folders/reindex`.
- CORS/localhost en prod: `VITE_API_URL` doit viser l’IP du NAS, rebuild web + Ctrl+F5.
- Reindex 500: backend à jour (retourne `{ indexed, failed }`), consulter logs.

---
Pour les détails d’installation et de mise à jour NAS, voir `README.md` (section Conseils déploiement).
