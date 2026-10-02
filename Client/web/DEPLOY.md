# Putting the browser client online

The browser client and the wiki are published at **https://play.tijolada.com/**. The game
connection is encrypted (`wss://play.tijolada.com/ws`). The game server and its protocol do not
change: browsers end up on the same WebSocket listener as on your PC, just through a proxy.

The domain is on Cloudflare, so the recommended setup is a **Cloudflare Tunnel**
(`cloudflared`). It needs no open ports on your router. Caddy is the alternative for a domain
that is not on Cloudflare (see the end of this file).

```
Player's browser ── https://play.tijolada.com/     ──┐  Cloudflare (TLS)
                 └─ wss://play.tijolada.com/ws     ──┤
                                                      │  cloudflared on this PC
                                                      └─ http://localhost:8080  (run-web.bat)
                                                           ├─ /    → files in Client\web\www
                                                           └─ /ws  → ws://127.0.0.1:2007 (game server)
Desktop client ── TCP 2006 (only if you choose to open it)
```

Port **2007** (the game's WebSocket port) keeps listening on 127.0.0.1 only, so the internet
can only reach it through the tunnel. Port **2006** (desktop clients) is not needed for
browser players.

## Game server settings (already set)

`Goose\bin\Debug\GooseSettings.json` (and the source copy `Goose\GooseSettings.json`):

```json
"WebSocketIP": "127.0.0.1",
"WebSocketPort": 2007,
"WebSocketAllowedOrigins": [ "https://play.tijolada.com", "http://localhost:8080" ],
"WebSocketTrustedProxies": [ "127.0.0.1", "::1" ],
```

- `WebSocketAllowedOrigins`: only pages from your site (and local testing on
  http://localhost:8080) may open a game connection; any other website gets `403`.
- `WebSocketTrustedProxies`: cloudflared runs on this PC, so it connects from 127.0.0.1. For
  those connections the server takes the player's address from `X-Forwarded-For` (Cloudflare
  sets it), so the per-IP connection limit, login throttling, bans and logs see players, not
  the tunnel. Headers from any other address are ignored.
- Restart the game server after changing these.

## Cloudflare Tunnel

The local web server (`run-web.bat`) serves the page and also passes game connections on `/ws`
through to the game server, so the tunnel needs only **one** route.

In the Cloudflare dashboard: **Networking → Tunnels → tijolada → Routes** (published
application):

| Hostname | Path | Service | HTTP Host Header |
|----------|------|---------|------------------|
| `play.tijolada.com` | *(empty)* | `http://localhost:8080` | `localhost:8080` |

The **HTTP Host Header** (Additional application settings → HTTP) is required: the local web
server only answers requests addressed to `localhost`; without it, the page fails with
"Bad Request - Invalid Hostname".

A second route `play.tijolada.com` + path `^/ws$` → `http://127.0.0.1:2007` (straight to the
game server) also works, but only when it is **above** the route without a path, because
Cloudflare uses the first match. It is not needed.

WebSockets must be on for the zone (**Network → WebSockets**, on by default).

The same route with a locally managed tunnel (`config.yml` next to `cloudflared.exe`; use your
tunnel's id and credentials file):

```yaml
tunnel: <tunnel-id>
credentials-file: C:\Users\diego\.cloudflared\<tunnel-id>.json
ingress:
  - hostname: play.tijolada.com
    service: http://localhost:8080
    originRequest:
      httpHostHeader: localhost:8080
  - service: http_status:404
```

## Starting it

1. Once: `convert-assets.bat` and `build-wiki.bat` (as for the local setup).
2. Start the game server (`Start Aspereta Server.bat`).
3. Start the web server: `Client\web\run-web.bat` (leave it open).
4. Start the tunnel (cloudflared service, or `cloudflared tunnel run <name>`).
5. Open https://play.tijolada.com/ (the wiki is at `/wiki/`). On an https page the login form
   uses `wss://play.tijolada.com/ws` automatically.

## Checking it

- `https://play.tijolada.com/` loads, and logging in works.
- The game server log shows `Browser connection from <player IP> via proxy 127.0.0.1.`
  (the player's own internet address, not 127.0.0.1).
- A page from another site cannot connect (the server answers `403`).
- **502 Bad Gateway** from Cloudflare: the tunnel is up but the PC side is not answering.
  Check that `run-web.bat` is running and the route points to `http://localhost:8080`.
- The page loads but logging in fails: check that the game server is running (its window
  shows `WebSocket listener for browser clients on ws://127.0.0.1:2007/`).
- **Bad Request - Invalid Hostname**: the HTTP Host Header setting of entry 2 is missing.

## Alternative: Caddy (domain not on Cloudflare)

`deploy\Caddyfile` serves `www` and forwards `/ws` with its own HTTPS certificate. It needs
ports 80 and 443 forwarded to this PC and `caddy.exe` (https://caddyserver.com/download) in
`Client\web\deploy\` or on the PATH. Start it with `deploy\run-caddy.bat`; `run-web.bat` is
not needed then. Do not use it together with a Cloudflare-proxied (orange cloud) DNS record
pointing at your IP: the server would then see Cloudflare's addresses instead of players'.

## Notes

- Passwords travel inside the encrypted wss:// connection. How the server stores them is
  unchanged.
- Back to local only: empty both lists (`[]`) and stop the tunnel.
