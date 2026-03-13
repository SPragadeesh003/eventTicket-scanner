package com.nearbyapi;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import androidx.core.content.ContextCompat;

import java.util.ArrayList;
import java.util.List;

/**
 * Manages Nearby Connections permission checks with exact SDK-level gates.
 *
 * Official permission matrix (from developers.google.com/nearby/connections/android/get-started):
 *
 *  Permission                  minSdk  maxSdk  Notes
 *  ─────────────────────────── ─────── ─────── ──────────────────────────────────────
 *  BLUETOOTH                     -       30    Legacy BT (removed in API 31)
 *  BLUETOOTH_ADMIN               -       30    Legacy BT admin (removed in API 31)
 *  ACCESS_COARSE_LOCATION        -       28    Replaced by FINE at API 29
 *  ACCESS_FINE_LOCATION          29      31    Required for discovery; NEARBY_WIFI_DEVICES replaces at 32
 *  BLUETOOTH_SCAN                31      -     Modern BT scan (neverForLocation)
 *  BLUETOOTH_ADVERTISE           31      -     Modern BT advertise (neverForLocation)
 *  BLUETOOTH_CONNECT             31      -     Modern BT connect
 *  ACCESS_WIFI_STATE             -       31    WiFi state; not needed at 32+ (handled internally)
 *  CHANGE_WIFI_STATE             -       31    WiFi change; not needed at 32+
 *  NEARBY_WIFI_DEVICES           32      -     Replaces location for WiFi Direct (neverForLocation)
 *
 * hasAllNearbyPermissions() only checks permissions that APPLY to the current device's API level.
 * Checking BLUETOOTH_SCAN on a pre-31 device would always fail -- it doesn't exist there.
 */
public class PermissionsManager {

    private static final String TAG = "NearbyPermissions";

    /**
     * Returns the list of Nearby permissions that are both required AND applicable
     * to the current device's API level. Used at runtime to check / request only
     * what Android will actually honour.
     */
    public List<String> getRequiredPermissionsForApiLevel() {
        List<String> perms = new ArrayList<>();
        int api = Build.VERSION.SDK_INT;

        // ── Legacy Bluetooth (API <= 30) ──────────────────────────────────────
        if (api <= Build.VERSION_CODES.R) {                           // <= 30
            perms.add(Manifest.permission.BLUETOOTH);
            perms.add(Manifest.permission.BLUETOOTH_ADMIN);
        }

        // ── Location (required for discovery) ────────────────────────────────
        if (api <= 28) {
            perms.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }
        if (api >= 29 && api <= 31) {                                 // 29-31
            perms.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }

        // ── Modern Bluetooth (API >= 31) ──────────────────────────────────────
        if (api >= Build.VERSION_CODES.S) {                           // >= 31
            perms.add(Manifest.permission.BLUETOOTH_SCAN);
            perms.add(Manifest.permission.BLUETOOTH_ADVERTISE);
            perms.add(Manifest.permission.BLUETOOTH_CONNECT);
        }

        // ── WiFi (API <= 31 needs explicit perms; 32+ uses NEARBY_WIFI_DEVICES) ──
        if (api <= 31) {
            perms.add(Manifest.permission.ACCESS_WIFI_STATE);
            perms.add(Manifest.permission.CHANGE_WIFI_STATE);
        }

        // ── NEARBY_WIFI_DEVICES (API >= 32) ──────────────────────────────────
        // This replaces ACCESS_FINE_LOCATION for WiFi Direct at API 32+.
        // Without it Nearby silently falls back to BLE-only (~10x slower).
        if (api >= Build.VERSION_CODES.TIRAMISU) {                    // >= 33 (T)
            perms.add(Manifest.permission.NEARBY_WIFI_DEVICES);
        } else if (api == 32) {
            // API 32 (S_V2) added NEARBY_WIFI_DEVICES mid-cycle
            perms.add("android.permission.NEARBY_WIFI_DEVICES");
        }

        Log.d(TAG, "Required permissions for API " + api + ": " + perms);
        return perms;
    }

    /**
     * Returns true if every permission applicable to this device's API level is granted.
     * Permissions that don't exist on this API level are skipped automatically.
     */
    public boolean hasAllNearbyPermissions(Context context) {
        for (String permission : getRequiredPermissionsForApiLevel()) {
            if (!isGranted(context, permission)) {
                Log.w(TAG, "Missing permission: " + permission);
                return false;
            }
        }
        return true;
    }

    /**
     * Returns only the permissions that are applicable to this API level AND not yet granted.
     * Passed to Activity.requestPermissions() at runtime.
     */
    public List<String> getMissingPermissions(Context context) {
        List<String> missing = new ArrayList<>();
        for (String permission : getRequiredPermissionsForApiLevel()) {
            if (!isGranted(context, permission)) {
                missing.add(permission);
            }
        }
        return missing;
    }

    /**
     * Returns a human-readable summary of all permission states for the current API level.
     * Used by getDiagnostics().
     */
    public String getPermissionsSummary(Context context) {
        StringBuilder sb = new StringBuilder();
        for (String p : getRequiredPermissionsForApiLevel()) {
            String shortName = p.substring(p.lastIndexOf('.') + 1);
            sb.append(shortName).append(":").append(isGranted(context, p) ? "Y" : "N").append(" ");
        }
        return sb.toString().trim();
    }

    // ─────────────────────────────────────────────────────────────────────────

    private boolean isGranted(Context context, String permission) {
        try {
            return ContextCompat.checkSelfPermission(context, permission)
                    == PackageManager.PERMISSION_GRANTED;
        } catch (Exception e) {
            // Permission constant doesn't exist on this SDK version — treat as granted
            // (it's not required here, and checking it would always fail)
            Log.d(TAG, "Permission check skipped (not available on this SDK): " + permission);
            return true;
        }
    }
}