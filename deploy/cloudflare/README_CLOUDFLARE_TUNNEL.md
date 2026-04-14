# Cloudflare Tunnel Setup Guide

This guide provides step-by-step instructions to expose your Raspberry Pi drone control system to the public Internet using Cloudflare Tunnel (cloudflared).

## Why Cloudflare Tunnel?

Cloudflare Tunnel works reliably over:
- 4G/LTE connections
- Shared networks (Airbox, hotspot)
- CG-NAT (Carrier-Grade NAT) - even when your ISP doesn't assign a public IP
- Restrictive firewalls
- Networks without port forwarding capabilities

## Prerequisites

1. A Cloudflare account (free tier is sufficient)
2. A domain registered with Cloudflare DNS
3. Raspberry Pi running the drone control system
4. Internet connection on the Raspberry Pi
5. SSH access to the Raspberry Pi (or physical access)

## Step-by-Step Setup

### Step 1: Install cloudflared on Raspberry Pi

Run the installation script on your Raspberry Pi:

```bash
bash deploy/cloudflare/install_cloudflared.sh
```

This script will:
- Download the appropriate cloudflared binary for your Raspberry Pi architecture
- Install it to `/usr/local/bin/`
- Make it executable
- Verify the installation

**Or manually install:**

```bash
# Determine architecture
arch=$(uname -m)

# Download appropriate binary
if [ "$arch" = "armv7l" ]; then
    BINARY_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm"
elif [ "$arch" = "aarch64" ]; then
    BINARY_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"
else
    echo "Unsupported architecture: $arch"
    exit 1
fi

wget -q "$BINARY_URL" -O cloudflared
chmod +x cloudflared
sudo mv cloudflared /usr/local/bin/
cloudflared --version
```

### Step 2: Authenticate with Cloudflare

Run the login command to authenticate:

```bash
cloudflared tunnel login
```

This will:
1. Open a browser link (print it to console)
2. Ask you to log in to your Cloudflare account
3. Allow the tunnel to use your domain
4. Save credentials to `~/.cloudflared/cert.pem`

**Note:** If you can't open a browser on the Raspberry Pi, copy the link and open it on another computer.

### Step 3: Create a Tunnel

Create a new tunnel with your chosen name:

```bash
cloudflared tunnel create drone-control
```

Replace `drone-control` with your preferred tunnel name. This creates:
- A tunnel with a unique ID
- Stored in `~/.cloudflared/<TUNNEL_ID>.json`

### Step 4: Route Your Domain

Route a subdomain to your tunnel:

```bash
cloudflared tunnel route dns drone-control drone.example.com
```

Replace:
- `drone-control` with your tunnel name
- `drone.example.com` with your desired subdomain
- `example.com` with your actual Cloudflare domain

### Step 5: Create Configuration File

Create the tunnel configuration file. Copy the example and customize it:

```bash
# Copy example to active config
cp deploy/cloudflare/cloudflared-config.yml.example ~/.cloudflared/config.yml

# Edit with your tunnel details
nano ~/.cloudflared/config.yml
```

**Configuration file structure:**

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /home/pi/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: drone.example.com
    service: http://localhost:8000
  - service: http_status:404
```

Make sure:
- `tunnel` value matches your tunnel ID (printed when you ran `tunnel create`)
- `credentials-file` path is correct (find with `ls ~/.cloudflared/*.json`)
- `hostname` matches the DNS route you created
- `service: http://localhost:8000` points to your backend server

### Step 6: Run the Tunnel

Start the tunnel to expose your application:

```bash
cloudflared tunnel --config ~/.cloudflared/config.yml run drone-control
```

The output will show:
```
INF |You can now access your app at https://drone.example.com
```

Access your dashboard: Open `https://drone.example.com` in a browser from anywhere!

### Step 7 (Optional): Install as a Systemd Service

For automatic startup on reboot, install as a systemd service:

```bash
# Copy service template
sudo cp deploy/cloudflare/cloudflared.service.example /etc/systemd/system/cloudflared.service

# Edit if needed (change username, paths)
sudo nano /etc/systemd/system/cloudflared.service

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable cloudflared
sudo systemctl start cloudflared

# Check status
sudo systemctl status cloudflared

# View logs
sudo journalctl -u cloudflared -f
```

## Testing the Tunnel

### From the Raspberry Pi

Test that the tunnel is working:

```bash
# Check tunnel status
cloudflared tunnel list

# Manually test API endpoint
curl https://drone.example.com/api/status
```

### From a Remote Device

1. Open browser and navigate to `https://drone.example.com`
2. Log in with credentials
3. View dashboard and send commands
4. Check that WebSocket connection works (real-time telemetry)

### Troubleshooting

**Tunnel won't start:**
- Check credentials file exists: `ls ~/.cloudflared/cert.pem`
- Check tunnel ID: `cloudflared tunnel list`
- Verify DNS route: `cloudflared tunnel route dns --overwrite-dns drone-control drone.example.com`

**Can't reach endpoint:**
- Verify backend is running: `curl http://localhost:8000` on Pi
- Check tunnel logs: `journalctl -u cloudflared -f`
- Verify hostname in config matches DNS route

**DNS not resolving:**
- Wait 5 minutes for DNS propagation
- Check Cloudflare DNS dashboard
- Manually verify: `nslookup drone.example.com`

**Connection drops:**
- Increase reconnection attempts in config
- Check Internet connection stability
- Monitor cloudflared logs for disconnects

## Security Notes

1. **HTTPS Only:** Cloudflare Tunnel automatically provides HTTPS/TLS encryption
2. **Authentication:** Implement real authentication (TODO in code)
3. **Rate Limiting:** Consider adding rate limits to API endpoints
4. **Access Logs:** Monitor `journalctl -u cloudflared` for unusual access patterns
5. **Tunnel Tokens:** Keep `cert.pem` and tunnel credentials file secure

## Advanced Configuration

### Multiple Services

Route different subdomains to different services:

```yaml
ingress:
  - hostname: drone.example.com
    service: http://localhost:8000
  - hostname: api.example.com
    service: http://localhost:8001
  - service: http_status:404
```

### Load Balancing

Run multiple tunnel clients on different machines:

```bash
# Same tunnel name, multiple machines
cloudflared tunnel --config config.yml run drone-control
```

### Custom Health Check

Cloudflare can monitor your backend:

```yaml
tunnel: drone-control
credentials-file: /home/pi/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: drone.example.com
    service: http://localhost:8000
  - service: http_status:404
```

## Stopping the Tunnel

### Stop the foreground process
Press `Ctrl+C`

### Stop the systemd service
```bash
sudo systemctl stop cloudflared
sudo systemctl disable cloudflared  # Disable auto-start
```

## References

- [Cloudflare Tunnel Documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [cloudflared GitHub](https://github.com/cloudflare/cloudflared)
- [Cloudflare DNS Setup](https://support.cloudflare.com/hc/en-us/articles/205359838)

## Next Steps

1. ✅ Tunnel is running and accessible
2. Implement real authentication (see backend/auth.py TODO)
3. Set up monitoring and alerting
4. Configure Cloudflare firewall rules for additional security
5. Set up automatic certificate renewal (handled by Cloudflare)
6. Plan for scalability if tunnel bandwidth exceeds free tier limits
