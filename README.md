# Ticket Scanner 🎟️

An **offline-first, mesh-networked** ticket scanning application built with Expo and React Native - engineered for limited or zero internet connectivity.

---

## ✨ Key Features

- **Offline-First Scanning** — instant validation against a local WatermelonDB database with zero network dependency
- **P2P Mesh Sync** — automatic peer-to-peer data synchronisation using Google Nearby Connections over WiFi Direct and BLE; no router or internet required
- **Reliable Delivery** — ACK-based outbox pattern with exponential backoff ensures every scan reaches all peers even across reconnects
- **Auto-Recovery** — jittered reconnection, stale endpoint eviction, and a discovery watchdog keep the mesh healthy across 5–6 devices without manual intervention
- **Duplicate Detection** — cross-device scan deduplication prevents double-entry across different gate devices
- **Cloud Sync** — background upload to Supabase when internet is available, powering an organiser dashboard without blocking ground operations
- **Event Management** — view current and past events with real-time local statistics
- **Smart Search** — find tickets by name or ID with an alphabet sidebar for large lists

---

## 🏗️ Architecture

The application is built around three independent layers. A failure in any one layer does not affect the others.

### 1. Offline-First Persistence (WatermelonDB)

All scan events are committed to a local **WatermelonDB** (SQLite-backed) database in milliseconds — before any network activity. The local database is the single source of truth; network layers are strictly secondary.

### 2. Peer-to-Peer Mesh (Google Nearby Connections)

A custom native module (`nearby-api`) wraps the Google Nearby Connections API for automatic device discovery and low-latency P2P communication over WiFi Direct and Bluetooth LE.

On top of the raw transport, the **MeshProtocol** layer handles:

- **Reliable delivery** — every scan uses an ACK/retry loop with configurable backoff. Failed sends queue in a local outbox and are flushed on reconnect
- **Heartbeat** — periodic PING/PONG exchanges detect silent link failures in under 10 seconds, faster than waiting for ACK retries to exhaust
- **Role negotiation** — devices self-assign SENDER/RESPONDER heartbeat roles based on device ID comparison, preventing duplicate traffic
- **Reconnection resilience** — jittered backoff, parallel watchdog connection attempts, and stale endpoint eviction (30s TTL) restore full mesh topology after any disruption
- **Group Owner stagger** — advertising start is randomised by 0–1500ms so 3–6 devices don't simultaneously contend for WiFi Direct Group Owner, eliminating the negotiation deadlock that causes multi-minute connection stalls
- **Deduplication** — message-level dedup (msgId cache) and raw payload dedup (500ms window) prevent double-processing from Nearby's native duplicate delivery behaviour

### 3. Cloud Sync (Supabase)

When internet connectivity is available, devices sync their local scan logs to **Supabase** (PostgreSQL). Sync is append-only and idempotent — devices can upload in any order without conflicts.

---

## 📂 Project Structure

```
├── app/                        # Expo Router — file-based routing
├── assets/                     # Images, fonts, icons
├── constants/                  # App-wide constants (colors, config)
├── nearby-api/                 # Custom native Android module (Google Nearby Connections)
│   └── android/src/main/java/com/nearbyapi/
│       ├── NearbyConnectionsModule.java   # Core P2P transport
│       ├── ReconnectionManager.java       # Exponential backoff reconnect
│       ├── HeartbeatManager.java          # Native liveness monitoring
│       └── ConnectionTimeoutManager.java
├── src/
│   ├── components/             # Reusable UI components
│   ├── db/                     # WatermelonDB schema, models, database config
│   ├── hooks/                  # Custom React hooks
│   ├── lib/                    # Supabase client initialisation
│   ├── screens/                # App screens (Home, Scanner, Profile)
│   ├── services/
│   │   ├── MeshProtocols/      # Application-layer mesh protocol
│   │   │   ├── handlers.ts     # Inbound message routing (SCAN, ACK, PING, PONG)
│   │   │   ├── heartbeat.ts    # Role negotiation and liveness monitoring
│   │   │   ├── outbox.ts       # Retry queue with ACK tracking
│   │   │   ├── sender.ts       # Outbound message construction and dispatch
│   │   │   └── state.ts        # Shared protocol state
│   │   ├── NearbyService/      # P2P transport lifecycle
│   │   │   ├── actions.ts      # Start/stop/reconnect logic
│   │   │   ├── listeners.ts    # Native event bridge
│   │   │   ├── watchdog.ts     # Discovery stall detection and recovery
│   │   │   └── state.ts        # Peer registry and connection state
│   │   └── ProfileService/     # User and device persistence
│   ├── styles/                 # Screen-specific and global styles
│   ├── types/                  # TypeScript interfaces and definitions
│   └── utils/                  # Helper functions (date, deviceId, ticket)
├── plugin/                     # Expo Config Plugin (native permissions, gradle)
└── README.md
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | Expo SDK 54, React Native |
| Language | TypeScript, JavaScript, JAVA |
| Local Database | WatermelonDB (SQLite) |
| Remote Database | Supabase (PostgreSQL) |
| P2P Transport | Google Nearby Connections (custom native module) |
| State Management | React hooks |

---

## 🚀 Getting Started

### Prerequisites

- Node.js ≥ 18 and Yarn
- Android Studio (for Android builds)
- Expo EAS CLI — `npm install -g eas-cli`
- **Physical Android devices only** — Nearby Connections does not work on emulators

### Setup

1. **Install dependencies**
   ```bash
   yarn install
   ```

2. **Configure environment variables**
   Create a `.env` file in the project root:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

3. **Prebuild native directories**
   ```bash
   npx expo prebuild
   ```

4. **Run on device**
   ```bash
   yarn android
   ```

---

## 🔒 Permissions

The following Android permissions are required at runtime:

`BLUETOOTH_SCAN`, `BLUETOOTH_ADVERTISE`, `BLUETOOTH_CONNECT`, `ACCESS_FINE_LOCATION`, `NEARBY_WIFI_DEVICES`, `CAMERA`

These are declared via the custom Expo Config Plugin in `/plugin` and provisioned automatically during `prebuild`.

---

## 📝 Developer Notes

- **Minimum 2 physical devices** to test mesh behaviour; 3+ to validate multi-device Group Owner negotiation and reconnection recovery
- **WiFi must be ON** (internet not required) — WiFi Direct uses the radio even without a network connection. The app will warn if WiFi is off
- **Android SDK**: minSdk 24, targetSdk 34
- **Viewing logs on preview builds**: `adb logcat -s ReactNativeJS` or `adb logcat *:S ReactNative:V ReactNativeJS:V`
- **Mesh status**: the `OnlineStatusRow` on the Home screen shows real-time peer connectivity and active transport (WiFi Direct vs BLE)
- **EAS secrets**: Supabase credentials are stored as EAS environment variables — run `eas env:create` to add them before building