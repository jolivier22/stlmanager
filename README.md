# 🧩 STLManager — Cahier technique de développement complet

## 📘 Objectif

Créer une **application web complète** permettant de **gérer une collection de projets d'impression 3D**, inspirée visuellement de **Plex / Jellyfin**.

L’application gère :
- des **projets** contenant des fichiers (STL, images, GIF, vidéos, etc.)
- un **fichier JSON** par projet (métadonnées : tags, miniature, note…)
- une **base de données SQLite** servant de cache
- un **frontend React** moderne et responsive
- un **backend FastAPI** pour la gestion des fichiers, de l’indexation et des métadonnées

---

## 🧱 Architecture générale

### Composants principaux

| Élément | Technologie | Rôle |
|----------|--------------|------|
| **Backend API** | FastAPI (Python) | Lecture/écriture des fichiers, scan, gestion du cache |
| **Frontend Web** | React + Vite + TailwindCSS + Three.js | Interface utilisateur moderne |
| **Base locale** | SQLite | Cache et index de la collection |
| **Stockage principal** | Dossier partagé NAS (SMB) | Contient les dossiers/projets |
| **Déploiement** | Docker / Docker Compose sous OMV | Exécution sur Raspberry Pi |
| **Tests locaux** | MacOS ou PC | Environnement de dev + debug |

---

## 🗂️ Structure des répertoires

stlmanager/
│
├── backend/
│ ├── app/
│ │ ├── main.py
│ │ ├── models.py
│ │ ├── routes/
│ │ │ ├── projects.py
│ │ │ ├── files.py
│ │ │ └── settings.py
│ │ ├── utils/
│ │ │ ├── scanner.py
│ │ │ ├── json_manager.py
│ │ │ ├── thumbnailer.py
│ │ │ └── tags.py
│ │ └── database.py
│ ├── requirements.txt
│ └── Dockerfile
│
├── frontend/
│ ├── src/
│ │ ├── App.jsx
│ │ ├── components/
│ │ ├── pages/
│ │ ├── hooks/
│ │ ├── assets/
│ │ └── utils/
│ ├── vite.config.js
│ ├── package.json
│ └── Dockerfile
│
├── docker-compose.yml
├── .env
└── README.md



Crée ensuite le fichier app/main.py :

Point d’entrée de FastAPI
Montre un exemple de route /api/projects

1.2 Structure des modules
/app/routes/projects.py
GET /projects : liste les projets (depuis le cache ou le dossier)
POST /scan : lance un scan des nouveaux projets
GET /project/{id} : retourne les infos d’un projet
/app/utils/scanner.py
Fonction scan_collection() :
lit le dossier parent défini dans .env
crée un JSON vierge pour chaque nouveau projet
met à jour le cache SQLite
/app/utils/json_manager.py
Lecture et écriture du JSON dans chaque projet :



/app/utils/thumbnailer.py
Génère une miniature pour le frontend (image, vidéo ou 3D placeholder)
/app/database.py
Gère la base SQLite : tables projects, tags, files
1.3 Configuration de l’environnement
Fichier .env :




💻 Étape 2 — Création du frontend (React + Vite + TailwindCSS + Three.js)
Objectif
Créer une interface moderne, fluide, responsive, inspirée de Plex/Jellyfin.


🧠 Étape 3 — Gestion du JSON par projet
Objectif

Chaque dossier projet possède son propre JSON :
généré automatiquement s’il n’existe pas
mis à jour lors des éditions
Format minimal :





Processus :

Lors du scan, FastAPI vérifie la présence du JSON.
S’il n’existe pas → il le crée.
Les infos sont ajoutées au cache SQLite pour accélérer les accès.

🧩 Étape 4 — Base SQLite (cache)
Objectif

Stocker les infos essentielles pour un affichage instantané.

Table projects
id	name	path	thumbnail	rating	last_modified
Table tags

| id | project_id | tag |

Mise à jour :
Au premier scan complet
À chaque ajout ou suppression de projet
Lors de la modification d’un tag depuis le frontend

🖼️ Étape 5 — Gestion des miniatures
Objectif

Pour les images, GIF, vidéos → extraire une miniature.
Pour les STL → générer un rendu 3D simplifié (Three.js côté frontend).
Backend
thumbnailer.py génère des fichiers PNG (cachés localement dans /app/data/thumbnails/).

Frontend
Chargement progressif + lazy loading via React.

⚙️ Étape 6 — Interface et ergonomie
Objectif

Offrir une expérience type Plex / Jellyfin :

fond sombre
grille fluide
tuiles dynamiques
transitions douces (Framer Motion)
vue détail immersive

Outils
TailwindCSS pour la mise en page
Framer Motion pour les transitions
React Router DOM pour la navigation fluide
Three.js pour la prévisualisation STL

🧩 Étape 7 — Configuration dynamique (page “Paramètres”)
Objectif

Permettre à l’utilisateur de :

définir le dossier source (STL_FOLDER)
définir la fréquence de scan
changer le thème
vider le cache SQLite

Mécanisme
Enregistrement dans un fichier config.json (backend)
Sauvegarde persistante
Lecture à chaque démarrage du backend

🔄 Étape 8 — Scan automatique

Le scan :
se déclenche au démarrage
peut être relancé manuellement depuis le frontend

détecte :

nouveaux dossiers
suppressions
modifications de fichiers
Les nouveaux projets sont ajoutés avec un JSON vierge.

🧪 Étape 9 — Tests et debug local
Sur Mac :



Dans un autre terminal :




Accède à :
Backend : http://localhost:8090/api
Frontend : http://localhost:5173
Sur Raspberry (Docker)
Compile l’image sur ton Mac
Pousse sur le Raspberry via SSH
OMV → Docker → Compose → “Up”

🐳 Étape 10 — Conteneurisation Docker
Objectif

Faciliter le déploiement sur Raspberry / OMV.

Backend Dockerfile
Basé sur python:3.11-slim
Copie du code + requirements
Exposition du port 8090
Frontend Dockerfile
Basé sur node:20-alpine
Build de la version de production
Copie dans nginx:alpine
docker-compose.yml

Monte les volumes :

cache SQLite : /home/pi/docker/stlmanager/cache
dossier collection : configuré via .env

🧠 Étape 11 — Optimisations de performance

Cache SQLite pour limiter l’accès au disque
Lazy loading des miniatures
Pagination virtuelle
Détection de modification par timestamp
Compression des images miniatures
Caching HTTP pour le frontend

🌟 Étape 12 — Améliorations futures
Fonction	Description
🔍 Recherche avancée	multi-tags + note + texte libre
🧠 IA de suggestion de tags	basée sur le nom du projet
🧩 Exports JSON/CSV	pour sauvegarde externe
📊 Statistiques visuelles	nombre de projets, fichiers, taille totale
🔔 Notifications	ajout/suppression de projet
🧾 Historique	des modifications par date
🧭 Résumé rapide
Élément	Détails
Backend	FastAPI + SQLite
Frontend	React + Tailwind + Three.js
Déploiement	Docker / OMV
Cache	/home/pi/docker/stlmanager/cache/cache.db
Port	8090
Langue	Français
Style	Type Plex / Jellyfin


