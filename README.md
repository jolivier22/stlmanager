🧩 STLManager — Gestionnaire de fichiers 3D (STL)
🎯 Objectif

STLManager est une application web locale (hébergée sur ton NAS via Docker) qui permet de gérer facilement une collection de fichiers STL (modèles 3D).
Elle fonctionne un peu comme Plex ou Jellyfin, mais pour les fichiers 3D : elle scanne ton dossier de modèles, crée une base de données interne, et te permet de parcourir, visualiser et organiser tes fichiers depuis une interface web moderne.

⚙️ Fonctionnement général
🧠 1. Scan automatique de la collection

Lors du premier lancement, STLManager te demande le dossier racine où sont stockés tes fichiers STL (ex : un dossier partagé SMB du NAS).

L’application analyse récursivement ce dossier et crée un fichier JSON pour chaque projet (si non existant).

Chaque JSON contient les métadonnées du projet :

Nom du fichier

Emplacement

Date du premier scan

Liste de tags (si ajoutés plus tard)

Miniature (si définie ultérieurement)

👉 Si un JSON existe déjà, il est simplement chargé et mis à jour si besoin.

🗃️ 2. Base de données interne (cache SQLite)

Tous les projets scannés sont indexés dans une base SQLite locale (/home/pi/docker/stlmanager/cache/cache.db).

Ce cache permet un affichage instantané sans rescanner le dossier à chaque fois.

Le scan ne se relance que sur demande ou si l’utilisateur ajoute un nouveau projet.

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
