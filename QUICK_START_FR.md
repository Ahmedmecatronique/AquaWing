# ⚡ QUICK START - Exactement ce qu'il faut faire

## 🎯 En 3 étapes

### Étape 1: Ouvrir un terminal SSH sur le Raspberry Pi

```bash
ssh pi@172.20.10.5
# ou ssh pi@192.168.1.X (selon votre réseau)
```

### Étape 2: Naviguer et lancer le serveur

```bash
cd /home/ahmed/drone/rpi_high_level
source .venv/bin/activate
python -m uvicorn backend.server:app --host 0.0.0.0 --port 8000
```

**Output attendu:**

```
INFO:     Started server process [1234]
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete
✓ Session created for admin
✓ WebSocket: User authenticated: admin
🚁 Demo telemetry loop started (Tunis data)
```

### Étape 3: Ouvrir depuis votre PC

Dans votre navigateur, visitez:

```
http://172.20.10.5:8000/login
```

## 📋 Login

**Identifiants:**
- Username: `admin`
- Password: `admin123`

## 🗺️ Après Login

Vous verrez:
- ✅ Carte Leaflet avec le drone (🚁)
- ✅ HUD avec données en temps réel
- ✅ Statut WebSocket: "Live" (vert qui pulse)
- ✅ Bouton "Follow: OFF" 
- ✅ Bouton "Logout"

---

## 🔧 Si ça ne marche pas

### Erreur: "Connection refused"

```bash
# Vérifier que le port 8000 n'est pas utilisé
lsof -i :8000

# Tuer le processus si occupé
kill -9 <PID>
```

### Erreur: ".venv not found"

```bash
# Créer l'environnement virtuel
python3 -m venv /home/ahmed/drone/rpi_high_level/.venv
source /home/ahmed/drone/rpi_high_level/.venv/bin/activate

# Installer les dépendances
pip install fastapi uvicorn python-multipart pydantic
```

### Le WebSocket dit "Disconnected"

```bash
# Vérifier dans la console du navigateur (F12)
# Devrait voir: "WebSocket connected"

# Si non:
# 1. Recharger la page (F5)
# 2. Vérifier que le serveur backend tourne
# 3. Vérifier le cookie de session (F12 → Application → Cookies)
```

---

## 📱 Accès depuis autre PC sur le réseau

```
http://192.168.1.X:8000/login
```

Remplacer `192.168.1.X` par l'IP réelle de votre Raspberry Pi.

---

## 🛑 Arrêter le serveur

Dans le terminal:
```
Ctrl + C
```

## ✅ Checklist de démarrage

- [ ] SSH connecté au Raspberry Pi
- [ ] Terminal dans `/home/ahmed/drone/rpi_high_level`
- [ ] `.venv` activé (prompt montre `(.venv)`)
- [ ] Serveur lancé (log: "Application startup complete")
- [ ] Browser: http://172.20.10.5:8000/login
- [ ] Login réussi (redirection vers /map)
- [ ] Carte visible avec drone
- [ ] HUD affiche données: Lat, Lon, Alt, Heading, Speed, Battery
- [ ] WebSocket status: "Live" (vert)

---

## 🚀 Automatiser le démarrage

Créer un script `start.sh`:

```bash
#!/bin/bash
cd /home/ahmed/drone/rpi_high_level
source .venv/bin/activate
python -m uvicorn backend.server:app --host 0.0.0.0 --port 8000 --reload
```

Puis:
```bash
chmod +x start.sh
./start.sh
```

---

**C'est tout! Profitez!** 🚁
