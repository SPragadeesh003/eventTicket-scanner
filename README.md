# Ticket Scanner 👋

An offline-first, mesh-networking ticket scanning application built with Expo and React Native.

## 🚀 Get Started

1. **Install Dependencies**
   ```bash
   yarn install
   ```

2. **Prebuild Native Modules**
   Since this project uses a custom local native module for Google Nearby Connections, you must prebuild the android/ios directories:
   ```bash
   npx expo prebuild
   ```

3. **Run the App**
   ```bash
   yarn android
   # or
   yarn ios
   ```

## 🏗️ Architecture & Approach

The application is designed for high-reliability scanning in environments with intermittent or zero internet connectivity (e.g., festivals, underground venues).

### 1. Offline-First Data (WatermelonDB)
We use **WatermelonDB** as the primary source of truth. Scans are committed locally in milliseconds, ensuring no "lag" at the gate even if the device is offline.

### 2. Mesh Networking (Google Nearby Connections)
A custom native module (`nearby-api`) facilitates peer-to-peer synchronization.
- **P2P Sync**: Devices automatically discover and connect to each other.
- **Mesh Protocol**: A proprietary acknowledgment-based protocol ensures that scan logs propagate across all devices in the cluster without a central server.
- **Deduping**: Scans are SHA-hashed and verified against the local mesh state to prevent double-entry scanning across different devices.

### 3. Cloud Integration (Supabase)
When internet is available, the primary device (or all devices) syncs the local WatermelonDB state with **Supabase**. This provides a global dashboard for event organizers while the ground operations remain autonomous.

### 4. Modular Implementation
- `src/services/NearbyService`: Manages the lifecycle of P2P advertising, discovery, and connection health.
- `src/services/MeshProtocols`: Handles the logic for sending, receiving, and acknowledging scan packets over the mesh.
- `src/db`: Defines the schema and models for persistence.

## 🛠️ Tech Stack
- **Framework**: Expo (SDK 54)
- **Database**: WatermelonDB (Local) + Supabase (Remote)
- **State**: Zustand
- **Networking**: Google Nearby Connections
- **Styling**: Vanilla StyleSheet with central `COLORS` constants.
