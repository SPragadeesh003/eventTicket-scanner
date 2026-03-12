const {
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
} = require('@expo/config-plugins');
const path = require('path');
const fs   = require('fs');

// ─── Permissions needed for Nearby Connections ────────────────
const NEARBY_PERMISSIONS = [
  'android.permission.BLUETOOTH',
  'android.permission.BLUETOOTH_ADMIN',
  'android.permission.BLUETOOTH_SCAN',
  'android.permission.BLUETOOTH_ADVERTISE',
  'android.permission.BLUETOOTH_CONNECT',
  'android.permission.WIFI_STATE',
  'android.permission.CHANGE_WIFI_STATE',
  'android.permission.ACCESS_WIFI_STATE',
  'android.permission.CHANGE_NETWORK_STATE',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.NEARBY_WIFI_DEVICES',
];

// Permissions that need usesPermissionFlags="neverForLocation" (Android 12+)
const NEVER_FOR_LOCATION = [
  'android.permission.BLUETOOTH_SCAN',
  'android.permission.BLUETOOTH_ADVERTISE',
  'android.permission.NEARBY_WIFI_DEVICES',
];

// ─── Step 1: Add permissions to AndroidManifest.xml ──────────
function withNearbyPermissions(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;

    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }

    for (const perm of NEARBY_PERMISSIONS) {
      // Avoid duplicates
      const exists = manifest['uses-permission'].some(
        (p) => p.$?.['android:name'] === perm
      );
      if (exists) continue;

      const entry = { $: { 'android:name': perm } };
      if (NEVER_FOR_LOCATION.includes(perm)) {
        entry.$['android:usesPermissionFlags'] = 'neverForLocation';
      }
      manifest['uses-permission'].push(entry);
    }

    return mod;
  });
}

// ─── Step 2: Add Nearby dependency to build.gradle ───────────
function withNearbyGradle(config) {
  return withAppBuildGradle(config, (mod) => {
    const gradle = mod.modResults.contents;

    const dep = "implementation 'com.google.android.gms:play-services-nearby:19.1.0'";

    if (!gradle.includes('play-services-nearby')) {
      mod.modResults.contents = gradle.replace(
        /dependencies\s*\{/,
        `dependencies {\n    ${dep}`
      );
    }

    return mod;
  });
}

// ─── Step 3: Copy Java files into android project ────────────
function withNearbyJavaFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const projectRoot = mod.modRequest.projectRoot;

      // Source: your modules/ folder in project root
      const srcDir = path.join(projectRoot, 'nearby-api', 'android', 'src', 'main', 'java', 'com', 'nearbyapi');

      // Destination: inside the generated android project
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

      // Create destination folder
      fs.mkdirSync(destDir, { recursive: true });

      // Copy all .java files
      if (fs.existsSync(srcDir)) {
        const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.java'));
        for (const file of files) {
          const src  = path.join(srcDir, file);
          let content = fs.readFileSync(src, 'utf8');

          // Fix package declaration to match actual app package
          content = content.replace(
            /^package com\.nearbyapi;/m,
            `package ${appPackage}.nearby;`
          );

          fs.writeFileSync(path.join(destDir, file), content, 'utf8');
          console.log(`[withNearbyConnections] copied ${file} → ${destDir}`);
        }
      } else {
        console.warn(`[withNearbyConnections] source folder not found: ${srcDir}`);
      }

      return mod;
    },
  ]);
}

// ─── Step 4: Register the package in MainApplication ─────────
function withNearbyMainApplication(config) {
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const projectRoot = mod.modRequest.projectRoot;
      const appPackage  = (
        mod.android?.package ||
        config.android?.package ||
        'com.eventhorizon.scanner'
      );
      const packagePath = appPackage.replace(/\./g, '/');

      // Try MainApplication.java first, then .kt
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
          // Add import after last import statement
          content = content.replace(
            /(import [^\n]+;\n)(?!import)/,
            `$1${importLine}\n`
          );
          // Add package registration
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
        console.warn('[withNearbyConnections] MainApplication not found — skipping patch');
      }

      return mod;
    },
  ]);
}

// ─── Compose all steps into one plugin ───────────────────────
function withNearbyConnections(config) {
  config = withNearbyPermissions(config);
  config = withNearbyGradle(config);
  config = withNearbyJavaFiles(config);
  config = withNearbyMainApplication(config);
  return config;
}

module.exports = withNearbyConnections;