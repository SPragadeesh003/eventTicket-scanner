const {
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
} = require('@expo/config-plugins');
const path = require('path');
const fs   = require('fs');

// ─── Permissions with exact SDK version gates ─────────────────────────────────
//
// Source: https://developers.google.com/nearby/connections/android/get-started
//
// Each entry mirrors the exact <uses-permission> attributes from the official docs.
// Permissions that don't apply to a given SDK version get maxSdkVersion / minSdkVersion
// so Android's package manager ignores them on devices where they're invalid.
//
// Why this matters:
//  - BLUETOOTH / BLUETOOTH_ADMIN don't exist on API 31+ (requesting them causes a warning)
//  - BLUETOOTH_SCAN/ADVERTISE/CONNECT don't exist before API 31 (always "denied")
//  - NEARBY_WIFI_DEVICES doesn't exist before API 32 (WiFi Direct falls back to BLE-only)
//  - ACCESS_FINE_LOCATION is the location grant for discovery on API 29-31 only
//
const NEARBY_PERMISSIONS = [
  // Legacy Bluetooth — API <= 30 only
  { name: 'android.permission.BLUETOOTH',       maxSdkVersion: 30 },
  { name: 'android.permission.BLUETOOTH_ADMIN', maxSdkVersion: 30 },

  // Legacy location — API <= 28 (coarse), API 29-31 (fine)
  { name: 'android.permission.ACCESS_COARSE_LOCATION', maxSdkVersion: 28 },
  { name: 'android.permission.ACCESS_FINE_LOCATION',   minSdkVersion: 29, maxSdkVersion: 31 },

  // Modern Bluetooth — API >= 31 (neverForLocation: these are NOT used to infer location)
  { name: 'android.permission.BLUETOOTH_SCAN',      minSdkVersion: 31, neverForLocation: true },
  { name: 'android.permission.BLUETOOTH_ADVERTISE', minSdkVersion: 31, neverForLocation: true },
  { name: 'android.permission.BLUETOOTH_CONNECT',   minSdkVersion: 31 },

  // WiFi state — API <= 31 (Nearby handles WiFi internally at API 32+ via NEARBY_WIFI_DEVICES)
  { name: 'android.permission.ACCESS_WIFI_STATE',  maxSdkVersion: 31 },
  { name: 'android.permission.CHANGE_WIFI_STATE',  maxSdkVersion: 31, neverForLocation: true },
  { name: 'android.permission.ACCESS_NETWORK_STATE' },
  { name: 'android.permission.CHANGE_NETWORK_STATE' },

  // NEARBY_WIFI_DEVICES — API >= 32
  // Replaces ACCESS_FINE_LOCATION for WiFi Direct at API 32+.
  // Without it, Nearby silently falls back to BLE-only (~10x slower throughput).
  // neverForLocation: tells Android this permission is NOT used to infer location.
  { name: 'android.permission.NEARBY_WIFI_DEVICES', minSdkVersion: 32, neverForLocation: true },
];

// ─── Step 1: Add permissions to AndroidManifest.xml ──────────────────────────
function withNearbyPermissions(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;

    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }

    for (const perm of NEARBY_PERMISSIONS) {
      // Avoid duplicates by name
      const exists = manifest['uses-permission'].some(
        (p) => p.$?.['android:name'] === perm.name
      );
      if (exists) continue;

      const entry = { $: { 'android:name': perm.name } };

      // Apply SDK version constraints exactly as the official docs specify
      if (perm.maxSdkVersion != null) {
        entry.$['android:maxSdkVersion'] = String(perm.maxSdkVersion);
      }
      if (perm.minSdkVersion != null) {
        entry.$['android:minSdkVersion'] = String(perm.minSdkVersion);
      }

      // neverForLocation prevents Android from using these permissions to infer location.
      // Required for BLUETOOTH_SCAN, BLUETOOTH_ADVERTISE, NEARBY_WIFI_DEVICES, CHANGE_WIFI_STATE
      // on Android 12+ — without this flag, the device may deny WiFi Direct operations.
      if (perm.neverForLocation) {
        entry.$['android:usesPermissionFlags'] = 'neverForLocation';
      }

      manifest['uses-permission'].push(entry);
    }

    return mod;
  });
}

// ─── Step 2: Add Nearby dependency to app/build.gradle ───────────────────────
function withNearbyGradle(config) {
  return withAppBuildGradle(config, (mod) => {
    const gradle = mod.modResults.contents;

    // 19.3.0: latest stable as of 2026.
    // 19.1.0 had known WiFi Direct bugs on Android 13/14 (STATUS_ENDPOINT_UNKNOWN,
    // ghost connections). 19.3.0 fixes those and adds improved BT stability.
    const dep = "implementation 'com.google.android.gms:play-services-nearby:19.3.0'";

    if (!gradle.includes('play-services-nearby')) {
      // Not yet present — inject after "dependencies {"
      mod.modResults.contents = gradle.replace(
        /dependencies\s*\{/,
        `dependencies {\n    ${dep}`
      );
    } else {
      // Already present — update version to 19.3.0 in case it's outdated
      mod.modResults.contents = gradle.replace(
        /implementation\s+'com\.google\.android\.gms:play-services-nearby:[^']+'/,
        dep
      );
    }

    return mod;
  });
}

// ─── Step 3: Copy Java files into the generated android project ───────────────
function withNearbyJavaFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const projectRoot = mod.modRequest.projectRoot;

      const srcDir = path.join(
        projectRoot, 'nearby-api', 'android', 'src', 'main', 'java', 'com', 'nearbyapi'
      );

      const appPackage = (
        mod.android?.package ||
        config.android?.package ||
        'com.eventhorizon.scanner'
      );
      const packagePath = appPackage.replace(/\./g, '/');
      const destDir = path.join(
        projectRoot,
        'android', 'app', 'src', 'main', 'java',
        packagePath, 'nearby'
      );

      fs.mkdirSync(destDir, { recursive: true });

      if (fs.existsSync(srcDir)) {
        const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.java'));
        for (const file of files) {
          const src = path.join(srcDir, file);
          let content = fs.readFileSync(src, 'utf8');

          // Rewrite package declaration to match the actual app package
          content = content.replace(
            /^package com\.nearbyapi;/m,
            `package ${appPackage}.nearby;`
          );

          fs.writeFileSync(path.join(destDir, file), content, 'utf8');
          console.log(`[withNearbyConnections] copied ${file} -> ${destDir}`);
        }
      } else {
        console.warn(`[withNearbyConnections] source folder not found: ${srcDir}`);
      }

      return mod;
    },
  ]);
}

// ─── Step 4: Register NearbyConnectionsPackage in MainApplication ─────────────
function withNearbyMainApplication(config) {
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const projectRoot = mod.modRequest.projectRoot;
      const appPackage = (
        mod.android?.package ||
        config.android?.package ||
        'com.eventhorizon.scanner'
      );
      const packagePath = appPackage.replace(/\./g, '/');

      const javaPath = path.join(
        projectRoot, 'android', 'app', 'src', 'main', 'java',
        packagePath, 'MainApplication.java'
      );
      const ktPath = path.join(
        projectRoot, 'android', 'app', 'src', 'main', 'java',
        packagePath, 'MainApplication.kt'
      );

      if (fs.existsSync(javaPath)) {
        let content = fs.readFileSync(javaPath, 'utf8');

        const importLine  = `import ${appPackage}.nearby.NearbyConnectionsPackage;`;
        const packageLine = `packages.add(new NearbyConnectionsPackage());`;

        if (!content.includes('NearbyConnectionsPackage')) {
          content = content.replace(
            /(import [^\n]+;\n)(?!import)/,
            `$1${importLine}\n`
          );
          content = content.replace(
            /new PackageList\(this\)\.getPackages\(\);/,
            `new PackageList(this).getPackages();\n    ${packageLine}`
          );
          fs.writeFileSync(javaPath, content, 'utf8');
          console.log('[withNearbyConnections] patched MainApplication.java');
        }

      } else if (fs.existsSync(ktPath)) {
        let content = fs.readFileSync(ktPath, 'utf8');

        const importLine  = `import ${appPackage}.nearby.NearbyConnectionsPackage`;
        const packageLine = `add(NearbyConnectionsPackage())`;

        if (!content.includes('NearbyConnectionsPackage')) {
          content = content.replace(
            /(import [^\n]+\n)(?!import)/,
            `$1${importLine}\n`
          );
          if (content.includes('PackageList(this).packages.apply')) {
            content = content.replace(
              /PackageList\(this\)\.packages\.apply \{/,
              `PackageList(this).packages.apply {\n    ${packageLine}`
            );
          } else {
            content = content.replace(
              /PackageList\((application|this)\)\.packages/,
              `PackageList($1).packages.apply {\n    ${packageLine}\n  }`
            );
          }
          fs.writeFileSync(ktPath, content, 'utf8');
          console.log('[withNearbyConnections] patched MainApplication.kt');
        }
      } else {
        console.warn('[withNearbyConnections] MainApplication not found -- skipping patch');
      }

      return mod;
    },
  ]);
}

// ─── Compose all steps ────────────────────────────────────────────────────────
function withNearbyConnections(config) {
  config = withNearbyPermissions(config);
  config = withNearbyGradle(config);
  config = withNearbyJavaFiles(config);
  config = withNearbyMainApplication(config);
  return config;
}

module.exports = withNearbyConnections;