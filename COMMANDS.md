# 🎯 COMMANDES EXACTES - Copy-Paste Ready

## Préambule

Remplacez `/home/ahmed/drone/rpi_high_level` par votre chemin réel si différent.

---

## 1️⃣ Installation initiale (première fois)

### A) SSH sur le Raspberry Pi

```bash
ssh pi@172.20.10.5
```

### B) Créer l'environnement virtuel

```bash
cd /home/ahmed/drone/rpi_high_level
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### C) Vérifier la configuration

```bash
python verify_setup.py
```

**Résultat attendu:**
```
✓ ALL CHECKS PASSED - System is ready!

Next steps:
  1. Activate venv: source .venv/bin/activate
  2. Run server: python -m uvicorn backend.server:app --host 0.0.0.0 --port 8000
  3. Visit: http://172.20.10.5:8000/login
  4. Login: admin / admin123
```

---

## 2️⃣ Démarrer le serveur (chaque jour)

### Approche A: Directement

```bash
cd /home/ahmed/drone/rpi_high_level
source .venv/bin/activate
python -m uvicorn backend.server:app --host 0.0.0.0 --port 8000
```

### Approche B: Avec le script LAUNCH.sh

```bash
cd /home/ahmed/drone/rpi_high_level
bash LAUNCH.sh
```

### Approche C: En arrière-plan (tmux)

```bash
# Créer une nouvelle session
tmux new-session -d -s drone

# Lancer le serveur
tmux send-keys -t drone "cd /home/ahmed/drone/rpi_high_level && source .venv/bin/activate && python -m uvicorn backend.server:app --host 0.0.0.0 --port 8000" Enter

# Voir les logs
tmux attach-session -t drone

# Quitter tmux: Ctrl+B puis D
# Tuer la session: tmux kill-session -t drone
```

---

## 3️⃣ Accéder à l'application

### Depuis votre PC (même réseau)

```bash
# Dans le navigateur
http://172.20.10.5:8000/login
```

### Identifiants de test

```
Username: admin
Password: admin123
```

### URLs disponibles

```
Login:     http://172.20.10.5:8000/login
Map:       http://172.20.10.5:8000/map
Logout:    http://172.20.10.5:8000/logout
Health:    http://172.20.10.5:8000/health
WebSocket: ws://172.20.10.5:8000/ws
```

---

## 4️⃣ Vérification du statut

### Vérifier que le serveur répond

```bash
curl http://172.20.10.5:8000/health
```

**Résultat attendu:**
```json
{
  "ok": true,
  "version": "0.2.0",
  "service": "RPi Drone Control API",
  "ws": "/ws",
  "map": "/map",
  "login": "/login"
}
```

### Vérifier le port

```bash
# Sur le Raspberry Pi
lsof -i :8000

# Devrait afficher:
# python    1234 pi  3u  IPv4 12345  0t0  TCP *:8000 (LISTEN)
```

### Voir les logs en temps réel

```bash
# SSH connecté, le terminal affiche les logs
# Cherchez des lignes comme:
# ✓ Session created for admin
# ✓ WebSocket: User authenticated: admin
# Broadcasting telemetry to 1 client
```

---

## 5️⃣ Dépannage

### Arrêter le serveur

```bash
# Dans le terminal où le serveur tourne:
Ctrl + C

# Ou si tmux:
tmux kill-session -t drone

# Ou tuer le processus:
pkill -f "uvicorn backend.server"
```

### Port déjà utilisé

```bash
# Voir quel processus utilise le port
lsof -i :8000

# Tuer le processus
kill -9 <PID>

# Ou utiliser un port différent:
python -m uvicorn backend.server:app --host 0.0.0.0 --port 8001
```

### Réinitialiser les sessions actives

```bash
# Les sessions sont stockées en mémoire
# Arrêtez et relancez le serveur pour les réinitialiser
```

### Activer virtual environment

```bash
cd /home/ahmed/drone/rpi_high_level
source .venv/bin/activate

# Indique que le venv est activé:
# (.venv) user@host:~$
```

### Désactiver virtual environment

```bash
deactivate

# Indique que le venv est désactivé:
# user@host:~$
```

---

## 6️⃣ Installation de dépendances additionnelles

### Ajouter une dépendance

```bash
source .venv/bin/activate
pip install <package-name>
pip freeze > requirements.txt  # Mettre à jour requirements.txt
```

### Exemple: ajouter bcrypt pour le hachage de mot de passe

```bash
source .venv/bin/activate
pip install bcrypt
pip freeze | grep bcrypt >> requirements.txt
```

---

## 7️⃣ Tests manuels du WebSocket

### Depuis le terminal (avec wscat)

```bash
# Installer wscat
npm install -g wscat

# Connecter au WebSocket
wscat -c ws://172.20.10.5:8000/ws

# Devrait afficher des messages JSON
{"lat": 36.8065, "lon": 10.1815, "alt": 15.3, ...}
```

### Avec curl (teste juste la connexion)

```bash
curl -i http://172.20.10.5:8000/ws
# Devrait retourner 403 ou erreur de WebSocket (normal)
```

### Avec Python

```python
import asyncio
import websockets
import json

async def test_ws():
    uri = "ws://172.20.10.5:8000/ws"
    async with websockets.connect(uri) as websocket:
        for i in range(5):
            message = await websocket.recv()
            data = json.loads(message)
            print(f"Lat: {data['lat']}, Lon: {data['lon']}")

asyncio.run(test_ws())
```

---

## 8️⃣ Mise à jour du code

### Après modification des fichiers Python

```bash
# Si le serveur tourne avec --reload, il se relance automatiquement

# Sinon, arrêter et relancer:
Ctrl + C
python -m uvicorn backend.server:app --host 0.0.0.0 --port 8000 --reload
```

### Après modification du frontend (JS/CSS)

```bash
# Recharger la page dans le navigateur (F5 ou Ctrl+Shift+R)
```

---

## 9️⃣ Accès HTTPS/WSS (pour plus tard)

### Avec Cloudflare Tunnel

```bash
# Installer cloudflared
wget https://github.com/cloudflare/cloudflared/releases/download/2024.1.0/cloudflared-linux-arm64
chmod +x cloudflared-linux-arm64
sudo mv cloudflared-linux-arm64 /usr/local/bin/cloudflared

# Initialiser le tunnel
cloudflared tunnel create drone

# Configurer la route
cloudflared tunnel route dns drone drone.example.com

# Lancer le tunnel
cloudflared tunnel run drone
```

### URL HTTPS

```
https://drone.example.com/login
wss://drone.example.com/ws
```

---

## 🔟 Maintenance

### Logs à surveiller

```bash
# Erreurs d'authentification
grep "❌" < logs/server.log

# Connexions WebSocket
grep "WebSocket" < logs/server.log

# Sessions
grep "Session" < logs/server.log
```

### Backup des données

```bash
# Aucun backup automatique (sessions en mémoire)
# Pour ajouter une base de données, voir README.md
```

### Mise à jour des dépendances

```bash
source .venv/bin/activate
pip install --upgrade -r requirements.txt
```

---

## 📊 Monitoring (optionnel)

### Script de monitoring simple

```bash
#!/bin/bash
while true; do
  curl -s http://172.20.10.5:8000/health | jq .
  sleep 5
done
```

### Sauvegarder comme monitoring.sh et lancer

```bash
chmod +x monitoring.sh
./monitoring.sh
```

---

## 🎓 Résumé des commandes principales

```bash
# 1. Première installation
cd /home/ahmed/drone/rpi_high_level
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 2. Vérifier la config
python verify_setup.py

# 3. Lancer le serveur
python -m uvicorn backend.server:app --host 0.0.0.0 --port 8000

# 4. Accéder depuis navigateur
# http://172.20.10.5:8000/login

# 5. Login
# Username: admin
# Password: admin123

# 6. Voir la map avec drone en temps réel ✅
```

---

**C'est prêt!** 🚀
