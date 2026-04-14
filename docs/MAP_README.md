# Drone Tracking Map - Instructions

## Fichiers créés

- `frontend/map.html` - Page HTML avec Leaflet
- `frontend/map.js` - Script JavaScript pour la carte
- `frontend/map.css` - Styles CSS
- `backend/websocket.py` - Endpoint WebSocket `/ws` ajouté

## Configuration

### 1. Modifier l'URL WebSocket

Ouvrez `frontend/map.js` et modifiez la ligne 12:

```javascript
const WS_URL = "ws://192.168.1.100:8001/ws";  // Remplacez par l'IP de votre Pi
```

Ou si vous utilisez le serveur FastAPI sur le port 8000:

```javascript
const WS_URL = "ws://192.168.1.100:8000/ws";  // Port 8000 avec endpoint /ws
```

## Exécution

### Option 1: Avec FastAPI (recommandé)

1. Démarrer le serveur FastAPI:
```bash
cd ~/drone/rpi_high_level
source .venv/bin/activate
tools/run_dev.sh
```

2. Ouvrir dans le navigateur:
```
http://localhost:8000/map
```
ou depuis un autre appareil:
```
http://<PI_IP>:8000/map
```

### Option 2: Test local (standalone)

Pour tester la page HTML localement sans FastAPI:

1. **Windows:**
```bash
cd frontend
python -m http.server 5500
```
Puis ouvrir: `http://127.0.0.1:5500/map.html`

2. **Linux/Mac:**
```bash
cd frontend
python3 -m http.server 5500
```
Puis ouvrir: `http://127.0.0.1:5500/map.html`

**Note:** En mode standalone, vous devrez modifier les chemins dans `map.html`:
- Ligne 15: `<link rel="stylesheet" href="map.css">`
- Ligne 30: `<script src="map.js"></script>`

## Fonctionnalités

✅ Carte OpenStreetMap centrée sur Tunis (36.8065, 10.1815)  
✅ Marker du drone mis à jour en temps réel  
✅ Trajectoire (polyline) avec maximum 2000 points  
✅ Mode Follow ON/OFF (bouton en haut à droite)  
✅ HUD avec statut WebSocket, lat, lon, alt, heading  
✅ Reconnexion automatique si WebSocket se ferme  
✅ Gestion d'erreurs: ignore les messages invalides  

## Format WebSocket

Le backend envoie des messages au format:

```json
{
  "lat": 36.8065,
  "lon": 10.1815,
  "alt": 10.5,
  "heading": 45.0,
  "ts": 1234567890
}
```

## Dépannage

**WebSocket ne se connecte pas:**
- Vérifiez que l'IP dans `WS_URL` est correcte
- Vérifiez que le serveur WebSocket est démarré
- Ouvrez la console du navigateur (F12) pour voir les erreurs

**La carte ne s'affiche pas:**
- Vérifiez votre connexion Internet (Leaflet charge depuis CDN)
- Vérifiez la console du navigateur pour les erreurs

**Le marker ne bouge pas:**
- Vérifiez que le WebSocket reçoit des messages valides
- Vérifiez que les messages contiennent `lat` et `lon` valides

## Notes

- Le mode Follow suit automatiquement le drone quand activé
- La trajectoire est limitée à 2000 points pour les performances
- La reconnexion automatique se fait toutes les 1 seconde
- Les messages avec lat/lon invalides sont ignorés sans crasher

