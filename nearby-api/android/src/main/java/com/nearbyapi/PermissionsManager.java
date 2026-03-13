package com.nearbyapi;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import androidx.core.content.ContextCompat;

import java.util.ArrayList;
import java.util.List;

public class PermissionsManager {

    private static final String TAG = "NearbyPermissions";

    public List<String> getRequiredPermissionsForApiLevel() {
        List<String> perms = new ArrayList<>();
        int api = Build.VERSION.SDK_INT;

        if (api <= Build.VERSION_CODES.R) {                       
            perms.add(Manifest.permission.BLUETOOTH);
            perms.add(Manifest.permission.BLUETOOTH_ADMIN);
        }

        if (api <= 28) {
            perms.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }
        if (api >= 29 && api <= 31) {                              
            perms.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }

        if (api >= Build.VERSION_CODES.S) {                       
            perms.add(Manifest.permission.BLUETOOTH_SCAN);
            perms.add(Manifest.permission.BLUETOOTH_ADVERTISE);
            perms.add(Manifest.permission.BLUETOOTH_CONNECT);
        }

        if (api <= 31) {
            perms.add(Manifest.permission.ACCESS_WIFI_STATE);
            perms.add(Manifest.permission.CHANGE_WIFI_STATE);
        }
        if (api >= Build.VERSION_CODES.TIRAMISU) {
            perms.add(Manifest.permission.NEARBY_WIFI_DEVICES);
        } else if (api == 32) {
            perms.add("android.permission.NEARBY_WIFI_DEVICES");
        }

        Log.d(TAG, "Required permissions for API " + api + ": " + perms);
        return perms;
    }
    public boolean hasAllNearbyPermissions(Context context) {
        for (String permission : getRequiredPermissionsForApiLevel()) {
            if (!isGranted(context, permission)) {
                Log.w(TAG, "Missing permission: " + permission);
                return false;
            }
        }
        return true;
    }
    public List<String> getMissingPermissions(Context context) {
        List<String> missing = new ArrayList<>();
        for (String permission : getRequiredPermissionsForApiLevel()) {
            if (!isGranted(context, permission)) {
                missing.add(permission);
            }
        }
        return missing;
    }
    public String getPermissionsSummary(Context context) {
        StringBuilder sb = new StringBuilder();
        for (String p : getRequiredPermissionsForApiLevel()) {
            String shortName = p.substring(p.lastIndexOf('.') + 1);
            sb.append(shortName).append(":").append(isGranted(context, p) ? "Y" : "N").append(" ");
        }
        return sb.toString().trim();
    }

    private boolean isGranted(Context context, String permission) {
        try {
            return ContextCompat.checkSelfPermission(context, permission)
                    == PackageManager.PERMISSION_GRANTED;
        } catch (Exception e) {
            Log.d(TAG, "Permission check skipped (not available on this SDK): " + permission);
            return true;
        }
    }
}