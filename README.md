# Ticket Scanner 👋

An offline-first, mesh-networking ticket scanning application built with Expo and React Native. This app is designed for high-performance scanning in environments with unreliable or zero internet connectivity.

## ✨ Key Features

- **Offline-First Scanning**: Instant validation using a local WatermelonDB database.
- **P2P Mesh Synchronization**: Automatic peer-to-peer data sync using Google Nearby Connections. No server required for ground operations.
- **Conflict Resolution**: SHA-hashed scan logs with acknowledgment-based delivery to ensure data integrity across the mesh.
- **Hybrid Cloud Sync**: Background synchronization with Supabase when internet connectivity is detected.
- **Event Management**: View current and past events with real-time local statistics.
- **Smart Search**: Rapidly find tickets by name or ID with an alphabet sidebar for large lists.
- **Security**: Device-locked scanning and gate-specific logging.

## 🏗️ Architecture & Approach

### 1. Data Layer (WatermelonDB)
We use **WatermelonDB** as the primary source of truth for the UI. It provides high-performance reactive updates and handles large datasets (thousands of tickets) with ease on mobile devices.

### 2. Networking Layer (Google Nearby Connections)
A custom native module (`nearby-api`) facilitates peer-to-peer communication.
- **Advertising/Discovery**: Devices automatically find peers with the same service ID.
- **Mesh Protocol**: A proprietary protocol handles handshakes, heartbeats, and reliable message delivery (ACKs).
- **Outbox Pattern**: Failed messages are queued in a local outbox and retried with exponential backoff and jitter to prevent collisions.

### 3. Backend (Supabase)
Supabase acts as the central coordinator for event data and long-term storage of scan logs, providing a global dashboard for event organizers.

## 📂 Project Structure

```text
├── app/                  # Expo Router directory (file-based routing)
├── assets/               # Static assets (images, fonts)
├── constants/            # App-wide constants (colors, routes, config)
├── nearby-api/           # Custom Native Android Module for Nearby Connections
├── src/
│   ├── components/       # Reusable UI components
│   ├── db/               # WatermelonDB schema, models, and database config
│   ├── hooks/            # Custom React hooks (Nearby logic, auth)
│   ├── lib/              # Third-party initializations (Supabase)
│   ├── screens/          # Main application screens (Home, Scanner, Profile)
│   ├── services/         # Core business logic
│   │   ├── MeshProtocols/# P2P Messaging logic (Sender, Handlers, State)
│   │   ├── NearbyService/# Discovery & Connection lifecycle
│   │   └── ProfileService/# User & Device persistence
│   ├── styles/           # Screen-specific and global styles
│   ├── types/            # TypeScript interfaces and definitions
│   └── utils/            # Helper functions (Date, DeviceID, Ticket)
├── plugin/               # Expo Config Plugins (for native permissions/gradle)
└── README.md
```

## 🛠️ Tech Stack

- **Frontend**: Expo (SDK 54), React Native
- **Database**: WatermelonDB (Offline), Supabase (Cloud)
- **Networking**: Google Nearby Connections (P2P)
- **State Management**: Zustand
- **Icons**: Ionicons (@expo/vector-icons)

## 🚀 Getting Started

### Prerequisites
- Node.js & Yarn
- Android Studio (for Android builds)
- Expo EAS CLI (`npm install -g eas-cli`)

### Setup
1. **Install Dependencies**
   ```bash
   yarn install
   ```
2. **Environment Variables**
   Create a `.env` file in the root with:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   ```
3. **Prebuild Native Modules**
   ```bash
   npx expo prebuild
   ```
4. **Run the App**
   ```bash
   yarn android
   ```

## 📝 Developer Notes

- **Logs**: In non-development builds, use `adb logcat *:S ReactNative:V ReactNativeJS:V` to view logs.
- **Permissions**: The app requires Bluetooth, Location (for discovery), and Camera permissions. These are managed via the custom Expo plugin in `/plugin`.
- **Mesh Debugging**: Check the `OnlineStatusRow` on the Home screen to see real-time peer connectivity status.
