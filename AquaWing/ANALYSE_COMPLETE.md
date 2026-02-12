# 🔍 Analyse Complète du Projet AquaWing

**Date d'analyse :** 2024  
**Version du système :** 0.2.0  
**Langage principal :** Python 3  
**Framework :** FastAPI + Uvicorn  
**Plateforme cible :** Raspberry Pi 5

---

## 📋 Table des Matières

1. [Vue d'ensemble](#vue-densemble)
2. [Architecture du Système](#architecture-du-système)
3. [Analyse Détaillée des Modules](#analyse-détaillée-des-modules)
4. [Points Forts](#points-forts)
5. [Points Faibles et Améliorations](#points-faibles-et-améliorations)
6. [Sécurité](#sécurité)
7. [Performance et Scalabilité](#performance-et-scalabilité)
8. [Recommandations Prioritaires](#recommandations-prioritaires)
9. [Métriques de Code](#métriques-de-code)

---

## 1. Vue d'ensemble

### 1.1 Description du Projet

**AquaWing** est un système de contrôle de drone en temps réel fonctionnant sur Raspberry Pi 5. Le système permet :
- Le suivi en temps réel de la position du drone
- La télémétrie (position, altitude, vitesse, batterie)
- La planification de missions avec waypoints
- Le streaming vidéo thermique (8×8 → 320×320 heatmap)
- L'authentification utilisateur avec sessions
- La communication WebSocket pour les données temps réel

### 1.2 Stack Technologique

- **Backend :** FastAPI (Python 3)
- **Serveur ASGI :** Uvicorn
- **Communication série :** pyserial (UART) - *non implémenté*
- **Caméra thermique :** AMG8833 via I2C (adafruit-circuitpython-amg88xx)
- **GPS :** NEO-M8N via UART - *non implémenté*
- **Frontend :** HTML5, JavaScript, Leaflet.js (cartes)
- **Authentification :** Sessions basées sur cookies (HttpOnly)

### 1.3 État Actuel du Projet

**Niveau de maturité :** 🟡 **Prototype / Développement**

Le système est fonctionnel pour :
- ✅ Démonstration avec données simulées
- ✅ Interface utilisateur complète (dashboard Leaflet)
- ✅ Authentification de base avec sessions
- ✅ Streaming thermique (simulation + hardware)
- ✅ WebSocket pour télémétrie temps réel

Le système n'est **PAS** prêt pour :
- ❌ Contrôle de drone réel (UART non implémenté)
- ❌ Production (sécurité insuffisante)
- ❌ Déploiement critique (pas de tests suffisants)

---

## 2. Architecture du Système

### 2.1 Structure Modulaire

Le projet suit une architecture modulaire bien organisée :

```
AquaWing/
├── main.py                  # Point d'entrée (appelle backend.server)
├── backend/
│   ├── server.py            # Factory FastAPI (version modulaire) ✅ UTILISÉ
│   ├── main.py              # Version monolithique (non utilisée) ⚠️ DUPLICATION
│   ├── api.py               # Endpoints REST API
│   ├── auth.py              # Gestion des sessions
│   ├── websocket.py         # Gestion WebSocket
│   └── src/
│       ├── control/         # Contrôleur de vol (PID) - STUB
│       ├── navigation/      # Guidage et trajectoires - STUB
│       ├── mission/         # Gestion des missions
│       ├── safety/          # Superviseur de sécurité - STUB
│       ├── perception/      # Vision par ordinateur
│       │   └── cameras/
│       │       ├── rgb_camera.py      # STUB
│       │       └── thermal_camera.py  # ✅ EXCELLENTE IMPLÉMENTATION
│       ├── streaming/       # Streaming vidéo
│       │   ├── video_stream.py        # STUB
│       │   └── vedio_heatmap_stream.py # ✅ EXCELLENTE IMPLÉMENTATION
│       ├── uart/            # Communication série - STUB
│       └── utils/           # Utilitaires (logging)
├── frontend/
│   └── static/              # Interface utilisateur
├── config/
│   ├── system.yaml          # Configuration système
│   └── cablage.py           # Configuration matériel (GPIO)
└── tests/                   # Tests unitaires (minimal)
```

### 2.2 Flux de Données

```
Browser ←→ FastAPI Server ←→ UART/I2C ←→ Hardware
         ↑
         └── WebSocket (télémétrie temps réel)
```

**État actuel :**
- Browser ↔ FastAPI : ✅ Fonctionnel
- FastAPI ↔ UART : ❌ Non implémenté (simulation uniquement)
- FastAPI ↔ I2C : ✅ Fonctionnel (caméra thermique AMG8833)

### 2.3 Points d'Entrée

1. **`main.py`** : Point d'entrée principal → appelle `backend.server.create_app()`
2. **`backend/server.py`** : Factory FastAPI avec authentification ✅
3. **`backend/main.py`** : Version monolithique alternative ⚠️ **NON UTILISÉE** (duplication)

---

## 3. Analyse Détaillée des Modules

### 3.1 Authentification (`backend/auth.py`)

#### ✅ Points Positifs
- Utilisation de `secrets.token_urlsafe()` pour générer des tokens sécurisés
- Sessions avec timeout (24 heures)
- Cookies HttpOnly pour prévenir les attaques XSS
- SameSite=Lax pour protection CSRF
- Gestion propre des sessions (création, validation, destruction)

#### ⚠️ Points d'Amélioration CRITIQUES

1. **🔴 CRITIQUE : Mots de passe stockés en clair**
   ```python
   # ❌ Actuel : stockage en clair
   DEMO_USERS = {"admin": "admin123"}
   
   # ✅ Recommandé : hashage avec bcrypt/argon2
   import bcrypt
   password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt())
   ```

2. **🔴 CRITIQUE : Pas de rate limiting**
   - Vulnérable aux attaques brute force
   - Solution : Limiter les tentatives de connexion (5/minute)

3. **🟡 IMPORTANT : Sessions en mémoire**
   - Perdues au redémarrage
   - Solution : Redis ou base de données persistante

4. **🟡 IMPORTANT : Pas de rotation de sessions**
   - Sessions valides pendant 24h sans renouvellement

#### 🔒 Recommandations Sécurité
1. Implémenter le hashage des mots de passe (bcrypt ou argon2) - **URGENT**
2. Ajouter un système de rate limiting pour les tentatives de connexion
3. Migrer les sessions vers Redis ou base de données persistante
4. Ajouter des logs d'audit pour les connexions

### 3.2 Serveur Principal (`backend/server.py`)

#### ✅ Points Positifs
- Architecture modulaire avec factory pattern (`create_app()`)
- Séparation claire des responsabilités
- Gestion propre des routes statiques
- Redirection automatique selon l'état d'authentification
- Intégration propre des routers (api, websocket)

#### ⚠️ Points d'Amélioration

1. **🟡 IMPORTANT : Duplication de code**
   - `backend/server.py` : Version modulaire (utilisée) ✅
   - `backend/main.py` : Version monolithique (non utilisée) ⚠️
   - La boucle de télémétrie demo est définie dans `server.py` mais aussi dans `main.py`

2. **🟢 MINEUR : Pas de gestion d'erreurs centralisée**
   - Pas de middleware de logging des requêtes
   - Pas de gestion d'exceptions globales

#### 📊 Code Redondant Identifié

```python
# backend/server.py ligne 45-84
async def demo_telemetry_loop(manager):
    # ... génération de télémétrie demo

# backend/main.py ligne 409-433
async def demo_telemetry_loop():
    # ... même logique mais légèrement différente
```

**Recommandation :** Consolider dans un module dédié `backend/src/telemetry/demo.py`

### 3.3 WebSocket (`backend/websocket.py`)

#### ✅ Points Positifs
- Gestion propre des connexions avec `ConnectionManager`
- Nettoyage automatique des connexions fermées
- Authentification requise pour les connexions WebSocket
- Broadcast efficace vers tous les clients

#### ⚠️ Points d'Amélioration

1. **🟡 IMPORTANT : Pas de heartbeat/ping-pong**
   - Pas de détection des connexions mortes
   - Solution : Ajouter un mécanisme de ping/pong

2. **🟡 IMPORTANT : Pas de limitation du nombre de connexions**
   - Risque de DoS si trop de clients se connectent
   - Solution : Limiter à N connexions simultanées

3. **🟢 MINEUR : Pas de gestion de la reconnexion côté serveur**
   - Les clients doivent gérer la reconnexion

#### 🔧 Améliorations Suggérées

```python
# Ajouter heartbeat
async def websocket_telemetry(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Heartbeat pour détecter connexions mortes
            await asyncio.wait_for(
                websocket.receive_text(),
                timeout=30.0  # Timeout de 30 secondes
            )
    except asyncio.TimeoutError:
        # Envoyer ping
        await websocket.send_json({"type": "ping"})
```

### 3.4 API REST (`backend/api.py`)

#### ✅ Points Positifs
- Utilisation de Pydantic pour la validation des données
- Modèles de données bien structurés
- Endpoints RESTful clairs
- Support des missions avec waypoints

#### ⚠️ Points d'Amélioration CRITIQUES

1. **🔴 CRITIQUE : Aucune authentification sur les endpoints API**
   ```python
   @router.get("/status")
   async def get_status():
       # ❌ Pas de vérification d'authentification
       return _drone_status
   ```
   **Impact :** N'importe qui peut accéder aux données du drone

2. **🟡 IMPORTANT : Données stockées en mémoire**
   - Missions et données perdues au redémarrage
   - Solution : Base de données (SQLite pour début, PostgreSQL pour production)

3. **🟡 IMPORTANT : Endpoints de test exposés**
   - `/api/status/update` et `/api/telemetry/update` devraient être supprimés en production

4. **🟢 MINEUR : Pas de versioning d'API**
   - Pas de `/api/v1/...` pour faciliter les migrations futures

#### 🔒 Sécurité API

**Recommandation :** Ajouter un middleware d'authentification

```python
from fastapi import Depends, HTTPException
from backend import auth

async def require_auth(session_id: str = Cookie(None)):
    username = auth.validate_session(session_id)
    if not username:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return username

@router.get("/status")
async def get_status(username: str = Depends(require_auth)):
    return _drone_status
```

### 3.5 Contrôleur de Vol (`backend/src/control/flight_controller.py`)

#### ⚠️ État Actuel : **STUB IMPLÉMENTATION**

Le module est essentiellement un squelette avec des TODOs :

```python
def compute_motor_outputs(self, imu_data: dict) -> dict:
    print("TODO: Implement PID + motor mixing")
    return {"motor1": 0.0, "motor2": 0.0, "motor3": 0.0}
```

#### 📝 Recommandations
1. Implémenter les contrôleurs PID pour pitch, roll, yaw, altitude
2. Ajouter une table de mélange moteur (motor mixing)
3. Implémenter les vérifications de sécurité pré-armement
4. Ajouter des limites de sécurité (max angle, max throttle)

### 3.6 Navigation (`backend/src/navigation/guidance.py`)

#### ⚠️ État Actuel : **STUB IMPLÉMENTATION**

```python
def compute_control(self) -> dict:
    print("TODO: Implement guidance control computation")
    return {"pitch": 0.0, "roll": 0.0, "yaw": 0.0, "throttle": 0.0}
```

#### 📝 Recommandations
1. Implémenter un algorithme de guidage (PID ou LQR)
2. Ajouter la planification de trajectoire
3. Implémenter la fusion de capteurs (GPS + IMU + baromètre)
4. Ajouter la gestion des waypoints avec tolérance d'arrivée

### 3.7 Sécurité (`backend/src/safety/supervisor.py`)

#### ✅ Points Positifs
- Structure de contraintes de sécurité définie
- Vérification des limites (altitude, vitesse, batterie)

#### ⚠️ Points d'Amélioration

1. **🟡 IMPORTANT : Les violations sont seulement loggées**
   - Pas d'action automatique en cas de violation
   - Solution : Déclencher un failsafe automatique

2. **🟡 IMPORTANT : Pas de watchdog timer**
   - Pas de détection si le système se bloque

3. **🟡 IMPORTANT : Pas de procédure d'atterrissage d'urgence automatique**
   - Le `trigger_failsafe()` est un stub

#### 🔧 Amélioration Suggérée

```python
def check_constraints(self, drone_state: dict) -> bool:
    if not super().check_constraints(drone_state):
        # ❌ Actuel : seulement print
        print(f"Safety violations: {self.violations}")
        
        # ✅ Recommandé : action automatique
        if "Low battery" in self.violations:
            self.trigger_failsafe()  # Atterrissage d'urgence
        return False
    return True
```

### 3.8 Communication UART (`backend/src/uart/`)

#### ⚠️ État Actuel : **STUB IMPLÉMENTATION**

Les modules `uart_link.py` et `protocol.py` contiennent uniquement des TODOs :

```python
def open(self) -> bool:
    print(f"TODO: Implement opening serial port {self.port}")
    return True
```

#### 📝 Recommandations
1. Implémenter l'ouverture réelle du port série
2. Définir un protocole de communication (framing, CRC, ACK/NACK)
3. Ajouter la gestion des erreurs de transmission
4. Implémenter un système de retry avec backoff exponentiel
5. Ajouter un timeout de réception

### 3.9 Caméra Thermique (`backend/src/perception/cameras/thermal_camera.py`)

#### ✅ Points Positifs - **EXCELLENTE IMPLÉMENTATION**
- **Gestion hardware/simulation** : Fallback automatique vers simulation si hardware indisponible
- Simulation réaliste avec hotspots animés
- Configuration centralisée dans `config/cablage.py`
- Code de production-ready pour ce module

#### 📊 Code de Qualité

```python
# Détection automatique du hardware
try:
    import board
    import busio
    import adafruit_amg88xx
    _HW_AVAILABLE = True
except ImportError:
    _HW_AVAILABLE = False

# Fallback gracieux
if _HW_AVAILABLE:
    # Utiliser hardware réel
else:
    # Mode simulation
```

#### ⚠️ Points Mineurs
- Pas de gestion d'erreurs I2C (timeout, bus occupé)
- Pas de calibration de température
- Pas de filtrage des valeurs aberrantes

### 3.10 Streaming Heatmap (`backend/src/streaming/vedio_heatmap_stream.py`)

#### ✅ Points Positifs - **EXCELLENTE IMPLÉMENTATION**
- **Conversion 8×8 → 320×320** avec interpolation bilinéaire
- Colormap "jet" maison (pas de dépendance matplotlib)
- Génération JPEG optimisée
- Intégration propre avec l'endpoint `/thermal`

#### 📊 Architecture Propre

```python
# Séparation des responsabilités
get_frame()           # Lecture brute 8×8
get_heatmap_image()   # Transformation + colormap
get_jpeg()            # Encodage final
```

### 3.11 Gestion des Missions (`backend/src/mission/mission_manager.py`)

#### ✅ Points Positifs
- Structure de données claire (WayPoint, Mission)
- Gestion de l'état de mission (active/inactive)

#### ⚠️ Points d'Amélioration
- Missions stockées en mémoire uniquement
- Pas de validation des waypoints (coordonnées valides, altitude raisonnable)
- Pas de sauvegarde/chargement depuis fichier
- Pas de suivi de progression (waypoint actuel, distance restante)

---

## 4. Points Forts

### 4.1 Architecture Modulaire
- Séparation claire des responsabilités
- Modules indépendants et testables
- Configuration centralisée (`config/cablage.py`, `config/system.yaml`)

### 4.2 Gestion de l'Authentification
- Sessions sécurisées avec cookies HttpOnly
- Protection WebSocket avec validation de session
- Redirection automatique selon l'état d'authentification

### 4.3 Caméra Thermique
- Implémentation robuste avec fallback simulation
- Code de production-ready pour ce module
- Streaming heatmap bien implémenté

### 4.4 Documentation
- README détaillé
- Architecture documentée
- Commentaires dans le code
- Fichier `ANALYSE_PROFONDE.md` existant

### 4.5 Configuration Matériel
- Configuration centralisée dans `config/cablage.py`
- Documentation du câblage GPIO
- Support matériel clairement défini (AMG8833, NEO-M8N)

---

## 5. Points Faibles et Améliorations

### 5.1 🔴 CRITIQUE : Sécurité

#### Problèmes Majeurs
1. **Mots de passe en clair**
   - Impact : Accès non autorisé si `users.json` est compromis
   - Solution : Hashage bcrypt/argon2

2. **API non protégée**
   - Impact : Accès aux données sans authentification
   - Solution : Middleware d'authentification sur tous les endpoints

3. **Pas de rate limiting**
   - Impact : Vulnérable aux attaques brute force
   - Solution : Limiter les tentatives de connexion

4. **Sessions en mémoire**
   - Impact : Perte de sessions au redémarrage
   - Solution : Redis ou base de données

### 5.2 🟡 IMPORTANT : Code Incomplet

#### Modules Stubs
- `flight_controller.py` : Pas d'implémentation PID
- `guidance.py` : Pas d'algorithme de guidage
- `uart_link.py` : Pas de communication série réelle
- `protocol.py` : Pas de protocole défini
- `detector.py` : Pas de détection d'objets
- `video_stream.py` : Pas de streaming vidéo RGB

**Impact :** Le système ne peut pas contrôler un drone réel actuellement.

### 5.3 🟡 IMPORTANT : Duplication de Code

- `backend/server.py` et `backend/main.py` contiennent du code similaire
- Boucle de télémétrie définie deux fois
- Gestion d'authentification partiellement dupliquée

**Solution :** Consolider dans `server.py` et supprimer `main.py` ou le marquer comme deprecated.

### 5.4 🟢 MINEUR : Gestion d'Erreurs

- Pas de gestion centralisée des exceptions
- Erreurs silencieuses dans plusieurs endroits
- Pas de logging structuré

**Exemple :**
```python
# backend/websocket.py ligne 62-63
except Exception as e:
    print(f"Error broadcasting: {e}")  # ❌ Seulement print
    # ✅ Devrait logger avec niveau ERROR
```

### 5.5 🟢 MINEUR : Tests

- Un seul fichier de test (`tests/test_basic.py`)
- Pas de tests unitaires pour les modules critiques
- Pas de tests d'intégration

---

## 6. Sécurité

### 6.1 Évaluation Actuelle

| Aspect | État | Priorité |
|--------|------|----------|
| Authentification | ⚠️ Partielle | 🔴 Haute |
| Hashage mots de passe | ❌ Absent | 🔴 Critique |
| Protection API | ❌ Absent | 🔴 Haute |
| Rate limiting | ❌ Absent | 🟡 Moyenne |
| HTTPS | ❌ Non configuré | 🟡 Moyenne |
| CORS | ⚠️ Trop permissif (`*`) | 🟡 Moyenne |
| Sessions | ⚠️ Mémoire uniquement | 🟡 Moyenne |
| Validation input | ✅ Pydantic | ✅ OK |

### 6.2 Recommandations Prioritaires

1. **Hashage des mots de passe** (URGENT)
   ```python
   import bcrypt
   
   def hash_password(password: str) -> str:
       return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
   
   def verify_password(password: str, hash: str) -> bool:
       return bcrypt.checkpw(password.encode(), hash.encode())
   ```

2. **Protection des endpoints API**
   ```python
   from fastapi import Depends
   
   async def require_auth(session_id: str = Cookie(None)):
       if not auth.validate_session(session_id):
           raise HTTPException(401)
       return True
   ```

3. **Rate Limiting**
   ```python
   from slowapi import Limiter
   limiter = Limiter(key_func=get_remote_address)
   
   @app.post("/login")
   @limiter.limit("5/minute")
   async def login_post(...):
       ...
   ```

---

## 7. Performance et Scalabilité

### 7.1 Points Positifs
- WebSocket efficace pour la télémétrie temps réel
- Broadcast optimisé (nettoyage automatique des connexions fermées)
- Simulation réaliste pour développement sans hardware

### 7.2 Points d'Amélioration

1. **Télémétrie Demo**
   - Actuellement : Boucle infinie même sans clients
   - Solution : Démarrer seulement quand des clients sont connectés

2. **Stockage en Mémoire**
   - Missions et données perdues au redémarrage
   - Solution : Base de données (SQLite pour début, PostgreSQL pour production)

3. **Pas de Cache**
   - Requêtes répétées pour les mêmes données
   - Solution : Cache Redis pour données fréquemment accédées

4. **Pas de Pool de Connexions**
   - UART ouvert/fermé à chaque requête (quand implémenté)
   - Solution : Pool de connexions ou singleton

---

## 8. Recommandations Prioritaires

### 🔴 PRIORITÉ CRITIQUE (À faire immédiatement)

1. **Sécurité**
   - [ ] Hashage des mots de passe (bcrypt)
   - [ ] Protection des endpoints API avec authentification
   - [ ] Rate limiting sur `/login`
   - [ ] Restreindre CORS (pas de `*`)

2. **Code Incomplet**
   - [ ] Implémenter la communication UART réelle
   - [ ] Définir le protocole de communication
   - [ ] Implémenter les contrôleurs PID de base

### 🟡 PRIORITÉ HAUTE (À faire bientôt)

3. **Refactoring**
   - [ ] Consolider `server.py` et `main.py`
   - [ ] Extraire la boucle de télémétrie dans un module dédié
   - [ ] Centraliser la gestion d'erreurs

4. **Fonctionnalités**
   - [ ] Persistance des missions (fichier/DB)
   - [ ] Validation des waypoints
   - [ ] Implémenter le streaming vidéo RGB

### 🟢 PRIORITÉ MOYENNE (Améliorations)

5. **Tests**
   - [ ] Tests unitaires pour les modules critiques
   - [ ] Tests d'intégration pour l'authentification
   - [ ] Tests de charge pour WebSocket

6. **Documentation**
   - [ ] Documentation API (Swagger/OpenAPI)
   - [ ] Guide de déploiement
   - [ ] Guide de développement

7. **Monitoring**
   - [ ] Logging structuré (JSON)
   - [ ] Métriques de performance
   - [ ] Health checks avancés

---

## 9. Métriques de Code

### 9.1 Complexité

- **Lignes de code :** ~2500+ lignes Python
- **Modules :** 25+ fichiers Python
- **Couverture de tests :** Faible (< 10% estimé)
- **Documentation :** Bonne (README, ANALYSE_PROFONDE.md, commentaires)

### 9.2 Dépendances

**Dépendances principales :**
- `fastapi` : Framework web
- `uvicorn` : Serveur ASGI
- `pyserial` : Communication série
- `numpy` : Calculs numériques
- `Pillow` : Traitement d'images
- `adafruit-circuitpython-amg88xx` : Caméra thermique

**Taille :** Légère (~10-15 MB avec dépendances)

### 9.3 TODOs Identifiés

**Total de TODOs trouvés :** ~50+ dans le code

**Répartition par module :**
- `uart/` : 10+ TODOs (communication série)
- `control/` : 8+ TODOs (PID, motor mixing)
- `navigation/` : 5+ TODOs (guidage)
- `safety/` : 5+ TODOs (failsafe)
- `api.py` : 8+ TODOs (authentification, hardware)
- `perception/` : 5+ TODOs (détection, caméra RGB)
- Autres : 10+ TODOs

---

## 10. Conclusion

### 10.1 Résumé

**AquaWing** est un projet bien structuré avec une architecture modulaire solide. Le code montre une bonne séparation des responsabilités et une organisation claire. Cependant, plusieurs modules critiques sont encore des stubs et nécessitent une implémentation complète pour être fonctionnels avec du hardware réel.

### 10.2 Points Clés

✅ **Forces :**
- Architecture modulaire et extensible
- Implémentation excellente de la caméra thermique
- Authentification WebSocket bien implémentée
- Configuration matériel centralisée
- Documentation présente

⚠️ **Faiblesses :**
- Sécurité : mots de passe en clair, API non protégée
- Code incomplet : plusieurs modules sont des stubs
- Duplication de code entre `server.py` et `main.py`
- Pas de tests suffisants
- Communication UART non implémentée

### 10.3 État de Maturité

**Niveau actuel :** 🟡 **Prototype / Développement**

Le système est fonctionnel pour :
- ✅ Démonstration avec données simulées
- ✅ Interface utilisateur complète
- ✅ Authentification de base
- ✅ Streaming thermique

Le système n'est **PAS** prêt pour :
- ❌ Contrôle de drone réel (UART non implémenté)
- ❌ Production (sécurité insuffisante)
- ❌ Déploiement critique (pas de tests)

### 10.4 Prochaines Étapes Recommandées

1. **Phase 1 (Sécurité)** : Implémenter le hashage des mots de passe et protéger les APIs
2. **Phase 2 (Hardware)** : Implémenter la communication UART et le protocole
3. **Phase 3 (Contrôle)** : Implémenter les contrôleurs PID de base
4. **Phase 4 (Tests)** : Ajouter des tests unitaires et d'intégration
5. **Phase 5 (Production)** : Optimisations, monitoring, documentation

---

**Fin de l'analyse complète**

