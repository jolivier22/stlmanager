🧩 STLManager — Gestionnaire de fichiers 3D (STL)
🎯 Objectif

STLManager est une application web locale (hébergée sur ton NAS via Docker) qui permet de gérer facilement une collection de fichiers STL (modèles 3D).
Elle fonctionne un peu comme Plex ou Jellyfin, mais pour les fichiers 3D : elle scanne ton dossier de modèles, crée une base de données interne, et te permet de parcourir, visualiser et organiser tes fichiers depuis une interface web moderne.

⚙️ Fonctionnement général
🧠 1. Scan automatique de la collection

Lors du premier lancement, STLManager te demande le dossier racine où sont stockés tes fichiers STL (ex : un dossier partagé SMB du NAS).

L’application analyse le dossier et crée un fichier JSON par projet (si non existant).

Chaque JSON contient les métadonnées du projet :

Nom du fichier

Emplacement

Date du premier scan

Liste de tags (si ajoutés plus tard)

Miniature (si définie ultérieurement)

👉 Si un JSON existe déjà, il est simplement chargé et mis à jour si besoin.
👉 Le JSON par projet constitue la source utilisateur pour la miniature, la note (rating) et les tags; ces informations sont également répercutées dans l’index SQLite pour accélérer l’affichage.

🗃️ 2. Base de données interne (cache SQLite)

Tous les projets (dossiers) sont indexés dans une base SQLite locale (/home/pi/docker/stlmanager/cache/cache.db) dans une table de cache `folder_index`.

Ce cache alimente la grille de listing (pagination/tri/recherche) sans rescanner les dossiers à chaque fois. La réindexation des dossiers se fait via des actions explicites:

- `POST /folders/reindex` (index complet) — parcourt uniquement le 1er niveau de `COLLECTION_ROOT`.
- `POST /folders/reindex-incremental` (index incrémental) — met à jour les entrées modifiées.

À part, un scan récursif des fichiers `.stl` existe via `POST /scan` pour alimenter la table `projects` (routeur `/projects`). Il est distinct du cache `folder_index` utilisé par la grille des dossiers.

💻 3. Interface web moderne

Accessible depuis ton navigateur via http://ton-nas:8090.

Interface inspirée de Plex / Jellyfin, avec des vignettes visuelles pour chaque modèle STL.

Chaque projet est représenté par une carte avec :

Une miniature du modèle 3D (générée automatiquement ou ajoutée manuellement)

Le nom du fichier

Des tags personnalisables (ex : “Pièce imprimante”, “Drone”, “Support”)

Un bouton pour ouvrir, prévisualiser ou télécharger le fichier STL

🧰 4. Page de configuration

Accessible via un menu “Paramètres” dans l’interface.

Permet de :

Sélectionner ou modifier le dossier racine de la collection (même sur un NAS distant)

Lancer manuellement un rescan complet

Gérer le chemin du cache SQLite

Basculer entre thème clair / sombre

🔍 5. Recherche et filtres

Barre de recherche instantanée par :

Nom de fichier

Tag

Dossier

Filtres dynamiques pour naviguer rapidement dans de grandes collections.

🧩 6. Visualisation 3D

Intégration d’un visualiseur STL interactif (via Three.js).

L’utilisateur peut :

Faire pivoter, zoomer et déplacer le modèle.

Activer/désactiver l’affichage filaire ou solide.

Basculer entre plusieurs miniatures ou vues.

🧠 7. Organisation & métadonnées

Possibilité d’ajouter des tags personnalisés.

Les modifications sont sauvegardées dans le JSON local du projet et dans la base SQLite.

Possibilité future : création automatique de collections thématiques (par tag, dossier, date...).

🔒 8. Architecture et déploiement

Backend : FastAPI (Python)

Gère le scan des dossiers, la lecture/écriture JSON et la base SQLite.

Frontend : React + TailwindCSS

Fournit une interface fluide, moderne et responsive.

Base locale : SQLite (cache et indexation rapide)

Déploiement : Docker Compose sous OpenMediaVault

L’application tourne localement sur ton NAS (port 8090)

Données persistantes via volumes Docker :

volumes:
  - /home/pi/docker/stlmanager/cache:/app/data
  - /chemin/vers/CollectionSTL:/mnt/CollectionSTL


🔁 Cycle de vie typique

Tu choisis ton dossier STL (via la page de configuration).

L’appli scanne le contenu → crée les fichiers JSON manquants.

Tous les fichiers sont indexés dans le cache SQLite.

Tu explores ta collection dans le navigateur.

Tu ajoutes des tags, génères des miniatures, etc.

Les prochaines ouvertures sont quasi instantanées, sans rescanner.

ℹ️ Notes importantes

- Miniature effective (priorité): override utilisateur `preview_overrides` (si défini via l’action “Définir comme miniature”) > miniature de `folder_index` (issue du JSON ou de la première image trouvée) > première image du dossier.
- Profondeur de scan: la réindexation de dossiers (`/folders/reindex*`) parcourt uniquement le 1er niveau sous `COLLECTION_ROOT`. Le scan `/scan` pour la table `projects` est récursif et séparé.

## Déploiement NAS (ex. OpenMediaVault / Raspberry Pi)

Collez ce docker-compose dans l'UI Docker du NAS (ou en fichier), en adaptant les chemins absolus:

```yaml
services:
  api:
    build:
      context: /home/pi/docker/stlmanager/backend
      dockerfile: Dockerfile
    container_name: stlmanager-api
    user: "1000:1000"
    environment:
      - CACHE_DB_PATH=/app/data/cache.db
      - COLLECTION_ROOT=/mnt/CollectionSTL
      - TZ=Europe/Paris
    volumes:
      - /home/pi/docker/stlmanager/data:/app/data
      - /srv/dev-disk-by-uuid-b31fd667-2222-40ee-9777-6780017602eb/Fichiers3D:/mnt/CollectionSTL:rw
    ports:
      - "8091:8000"
    restart: unless-stopped

  web:
    build:
      context: /home/pi/docker/stlmanager/frontend
      dockerfile: Dockerfile
    container_name: stlmanager-web
    environment:
      - VITE_API_URL=http://<IP_DU_NAS>:8091
      - TZ=Europe/Paris
    ports:
      - "8090:80"
    restart: unless-stopped
```

Notes:
- Remplacez `<IP_DU_NAS>` par l'adresse IP du NAS.
- Créez le dossier persistant: `mkdir -p /home/pi/docker/stlmanager/data` et assurez les droits UID/GID 1000.
- Accès: Web `http://<IP_DU_NAS>:8090`, API `http://<IP_DU_NAS>:8091`.
- Dans l'UI: Configuration → Scanner (index complet).

Pour le développement Windows, utilisez le `docker-compose.yml` du dépôt (montage CIFS vers le partage réseau, variables `SMB_USER`/`SMB_PASS`).

## Conseils déploiement

Pour les prochaines mises à jour sur le NAS:

```bash
docker compose down
git pull --rebase
docker compose build --no-cache api
docker compose build --no-cache --build-arg VITE_API_URL=http://192.168.1.13:8091 web
docker compose up -d api web
# Navigateur: Ctrl+F5

# Pour relancer apres modif
docker compose up -d --build api web
