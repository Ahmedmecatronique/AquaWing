# 📍 Routes et Points d'Entrée Frontend

## Routes Disponibles

### 1. **Route Racine** `/`
- **Redirection automatique** :
  - Si **authentifié** → redirige vers `/map`
  - Si **non authentifié** → redirige vers `/login`

### 2. **Page de Connexion** `/login`
- **Fichier** : `frontend/static/login.html`
- **Description** : Page de connexion avec formulaire username/password
- **Accès** : Public (redirige vers `/map` si déjà connecté)

### 3. **Interface Principale** `/map`
- **Fichier** : `frontend/static/map.html`
- **Description** : Interface complète de contrôle du drone avec :
  - Sidebar avec navigation (Dashboard, Missions, Systems, Optical)
  - Carte interactive (Leaflet)
  - Télémétrie en temps réel
  - Contrôles de mission
  - Caméras RGB et Thermal
- **Accès** : **Protégé** (nécessite authentification)
- **Si non authentifié** → redirige vers `/login`

### 4. **Ancien Dashboard** `index.html` (non utilisé)
- **Fichier** : `frontend/static/index.html`
- **Description** : Ancien dashboard simple (non routé)
- **Accès** : Aucune route définie (fichier non utilisé actuellement)

## Structure des Fichiers Frontend

```
frontend/static/
├── index.html      → Ancien dashboard (non utilisé)
├── login.html      → Page de connexion
├── map.html        → Interface principale (ACTUELLE)
├── map.js          → Logique JavaScript principale
├── map.css         → Styles CSS
├── login.css       → Styles de la page de connexion
├── app.js          → JavaScript pour index.html (ancien)
└── style.css       → Styles pour index.html (ancien)
```

## Comment Accéder

### Depuis localhost :
```
http://localhost:8000/
http://localhost:8000/login
http://localhost:8000/map
```

### Depuis l'adresse IP :
```
http://172.20.10.9:8000/
http://172.20.10.9:8000/login
http://172.20.10.9:8000/map
```

## Flux d'Authentification

1. **Premier accès** → `/` → redirige vers `/login`
2. **Connexion** → POST `/login` → crée session → redirige vers `/map`
3. **Accès direct à `/map`** → vérifie session → si valide : affiche, sinon : redirige vers `/login`
4. **Déconnexion** → `/logout` → détruit session → redirige vers `/login`

## Note Importante

- **`index.html`** est un ancien dashboard qui n'est **pas utilisé** actuellement
- L'interface principale est **`map.html`** accessible via `/map`
- Tous les liens utilisent automatiquement l'adresse IP ou localhost selon l'URL d'accès

