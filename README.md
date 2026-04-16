# CLAWS Formal Event App

Real-time event companion app for the CLAWS 2025 Formal. Three views: guest phones, admin dashboard, and projector display — all synchronized via Socket.io.

---

## Setup

```bash
cd claws-formal
npm install
npm start
```

On startup the server prints all URLs and the admin password to the console.

For development with auto-reload:
```bash
npm run dev
```

The server binds to `0.0.0.0:3000` so it is reachable on your local network.

---

## URLs

| View    | URL                              | Notes                        |
|---------|----------------------------------|------------------------------|
| Guest   | `http://YOUR_IP:3000/`           | Open on guest phones         |
| Admin   | `http://YOUR_IP:3000/admin.html` | Password: `claws2025`        |
| Display | `http://YOUR_IP:3000/display.html` | Open on projector laptop   |

Replace `YOUR_IP` with your machine's local IP address (printed at startup).

To override the admin password set the environment variable before starting:
```bash
ADMIN_PASSWORD=mysecret npm start
```

---

## QR Code Setup

Each guest's QR code should encode a URL in the following format:

```
http://YOUR_IP:3000/?card=CARD_ID&name=GuestName
```

**Parameters:**
- `card` — A unique identifier for the guest's physical card/tag (used to link votes and winner reveals back to specific guests).
- `name` — The guest's display name (pre-fills the join form; the guest can still edit it).

**Example:**
```
http://192.168.1.42:3000/?card=alice-001&name=Alice%20Smith
```

Generate one QR code per guest before the event and print/attach them to place cards, lanyards, or invitations. Any QR code generator works (e.g. qr-code-generator.com, or the `qrcode` npm package).

---

## NFC Setup

Android Chrome supports the Web NFC API. To use NFC tags:

1. Write the guest URL (`http://YOUR_IP:3000/?card=CARD_ID&name=GuestName`) to an NFC NDEF tag using any NFC writing app (e.g. NFC Tools on Android).
2. When a guest taps their phone to the tag, Chrome opens the URL automatically, pre-fills their name, and shows the "Card Detected" indicator on the join screen.
3. iOS does not support Web NFC — use QR codes for iPhone guests.

---

## Event Flow (Admin Actions)

### Before guests arrive
1. Open `/admin.html` on the host laptop, enter password `claws2025`.
2. Open `/display.html` on the projector laptop (no password needed).
3. Phase is `LOBBY` by default — the display shows the CLAWS logo.

### Guests arriving
- Guests scan their QR code or tap their NFC tag to open the guest view on their phones.
- They enter (or confirm) their name and tap **Enter**.
- The admin Guest panel shows connected guests in real time.

### Dinner
1. In Admin, click **DINNER** under Phase Control.
2. All guest phones and the display switch to the dinner phase.

### Speeches
1. Click **SPEECHES** in Phase Control.
2. Use the **◀ ▶** arrows in the Speech Order panel to advance through the 14 speeches.
3. Each advance instantly updates all guest phones and the projector with the current speaker's team and role.

Speech order:
1. Presidents — Opening Address
2. Product Management — Current → Next Framing
3. Hardware
4. Technical PM
5. Artificial Intelligence
6. Augmented Reality
7. Infrastructure
8. UX Design
9. Research
10. Outreach
11. Finance
12. Content
13. Social
14. Product Management — Closing Reflection

### Voting Rounds
1. In the **Create Vote** panel, fill in the award title, team name, optional description, time limit (seconds), and at least 2 candidates (name + optional Card ID).
2. Click **▶ Start Vote**.
3. The voting overlay appears on all guest phones simultaneously. Guests tap their choice.
4. The admin **Active Vote** panel shows live vote counts as they come in.
5. Voting closes automatically when the timer runs out, or click **■ Close Voting** to close early.
6. Once closed, click **★ Reveal Winner** to push the winner reveal to all screens.
7. If a guest's Card ID matches the winner's Card ID, their phone shows a special "YOU WON" screen.
8. The result is archived in Vote History. The Create Vote form resets for the next award.

### Broadcast Messages
- Type a message in the Broadcast panel and click **Send** to push a notification banner to all guest phones and a full-screen overlay on the projector.
- Choose type: **Info** (blue), **Alert** (red), or **Success** (green).
- Click **Clear** to dismiss the banner on all devices.

### End of night
1. Click **MINGLING** or **AFTERPARTY** in Phase Control as appropriate.
2. All devices update automatically.

---

## Architecture Notes

- **No database** — all state is in-memory on the server process. Restarting the server resets all state.
- **Single event** — designed for one evening; no multi-event support.
- **Reconnection** — guests who lose connection automatically rejoin and restore their voting state when the connection resumes.
- **Idempotent votes** — a guest can only vote once per round; duplicate submissions are ignored server-side.
