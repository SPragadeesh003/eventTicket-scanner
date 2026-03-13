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
// KEY FIX: ACCESS_WIFI_STATE was previously maxSdkVersion:31 which meant it was
// ABSENT from the manifest on API 32+ devices. This caused error 8032
// (MISSING_PERMISSION_ACCESS_WIFI_STATE) on Android 13/14 devices.
// Fix: Remove the maxSdkVersion cap — ACCESS_WIFI_STATE is needed on ALL API levels.
//
// Similarly CHANGE_WIFI_STATE and network state permissions are needed on all levels.
//
const NEARBY_PERMISSIONS = [
  // ── Legacy Bluetooth — API <= 30 only ────────────────────────────────────
  { name: 'android.permission.BLUETOOTH',       maxSdkVersion: 30 },
  { name: 'android.permission.BLUETOOTH_ADMIN', maxSdkVersion: 30 },

  // ── Legacy location — required for discovery on older API levels ──────────
  { name: 'android.permission.ACCESS_COARSE_LOCATION', maxSdkVersion: 28 },
  { name: 'android.permission.ACCESS_FINE_LOCATION',   minSdkVersion: 29, maxSdkVersion: 31 },

  // ── Modern Bluetooth — API >= 31 ─────────────────────────────────────────
  // neverForLocation: tells Android these are NOT used to infer location.
  // Without this flag on API 31+, the device may block WiFi Direct operations.
  { name: 'android.permission.BLUETOOTH_SCAN',      minSdkVersion: 31, neverForLocation: true },
  { name: 'android.permission.BLUETOOTH_ADVERTISE', minSdkVersion: 31, neverForLocation: true },
  { name: 'android.permission.BLUETOOTH_CONNECT',   minSdkVersion: 31 },

  // ── WiFi state — NO maxSdkVersion cap ────────────────────────────────────
  // FIX: Previously these had maxSdkVersion:31 which caused error 8032 on
  // Android 13/14 (API 32+). Nearby Connections needs these on ALL API levels.
  { name: 'android.permission.ACCESS_WIFI_STATE'  },                          // ← no cap
  { name: 'android.permission.CHANGE_WIFI_STATE',   neverForLocation: true }, // ← no cap

  // ── Network state — needed for Nearby to detect transport availability ────
  { name: 'android.permission.ACCESS_NETWORK_STATE' },
  { name: 'android.permission.CHANGE_NETWORK_STATE' },

  // ── NEARBY_WIFI_DEVICES — API >= 32 ──────────────────────────────────────
  // Replaces ACCESS_FINE_LOCATION for WiFi Direct at API 32+.
  // Without it, Nearby silently falls back to BLE-only (~10x slower, ~100m range limit).
  // neverForLocation required or Android 13+ may deny WiFi Direct scan operations.
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
      // Remove existing entry for this permission so we can re-add with correct attrs
      // (handles the case where a previous build had the wrong maxSdkVersion)
      manifest['uses-permission'] = manifest['uses-permission'].filter(
        (p) => p.$?.['android:name'] !== perm.name
      );

      const entry = { $: { 'android:name': perm.name } };

      if (perm.maxSdkVersion != null) {
        entry.$['android:maxSdkVersion'] = String(perm.maxSdkVersion);
      }
      if (perm.minSdkVersion != null) {
        entry.$['android:minSdkVersion'] = String(perm.minSdkVersion);
      }
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

    const dep = "implementation 'com.google.android.gms:play-services-nearby:19.3.0'";

    if (!gradle.includes('play-services-nearby')) {
      mod.modResults.contents = gradle.replace(
        /dependencies\s*\{/,
        `dependencies {\n    ${dep}`
      );
    } else {
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