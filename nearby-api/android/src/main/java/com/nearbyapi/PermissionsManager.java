package com.nearbyapi;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import androidx.core.content.ContextCompat;
import java.util.ArrayList;
import java.util.List;

public class PermissionsManager {
    private static final String TAG = "NearbyPermissions";
    
    private static final String[] NEARBY_PERMISSIONS = {
        Manifest.permission.BLUETOOTH,
        Manifest.permission.BLUETOOTH_ADMIN,
        Manifest.permission.BLUETOOTH_SCAN,
        Manifest.permission.BLUETOOTH_ADVERTISE,
        Manifest.permission.BLUETOOTH_CONNECT,
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION,
        Manifest.permission.CHANGE_WIFI_STATE,
        Manifest.permission.ACCESS_WIFI_STATE,
        Manifest.permission.NEARBY_WIFI_DEVICES
    };

    public boolean hasAllNearbyPermissions(Context context) {
        for (String permission : NEARBY_PERMISSIONS) {
            try {
                if (ContextCompat.checkSelfPermission(context, permission) 
                        != PackageManager.PERMISSION_GRANTED) {
                    return false;
                }
            } catch (Exception e) {
                // Permission doesn't exist on this API level
            }
        }
        return true;
    }

    public List<String> getMissingPermissions(Context context) {
        List<String> missing = new ArrayList<>();
        for (String permission : NEARBY_PERMISSIONS) {
            try {
                if (ContextCompat.checkSelfPermission(context, permission) 
                        != PackageManager.PERMISSION_GRANTED) {
                    missing.add(permission);
                }
            } catch (Exception e) {
                // Permission doesn't exist on this API level
            }
        }
        return missing;
    }
}