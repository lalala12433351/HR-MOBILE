package in.pixbe.hrsolutions;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Distinguishes Android "Allow all the time" (ACCESS_BACKGROUND_LOCATION)
 * from foreground-only location grants.
 */
@CapacitorPlugin(
        name = "AlwaysLocation",
        permissions = {
                @Permission(
                        strings = {
                                Manifest.permission.ACCESS_COARSE_LOCATION,
                                Manifest.permission.ACCESS_FINE_LOCATION
                        },
                        alias = "location"
                ),
                @Permission(
                        strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION },
                        alias = "background"
                )
        }
)
public class AlwaysLocationPlugin extends Plugin {
    private boolean hasForeground() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION)
                        == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_COARSE_LOCATION)
                        == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasAlways() {
        // Pre-Q there is no separate background location permission.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            return hasForeground();
        }
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    private void resolveStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("always", hasAlways());
        result.put("whenInUse", hasForeground());
        call.resolve(result);
    }

    @PluginMethod
    public void check(PluginCall call) {
        resolveStatus(call);
    }

    @PluginMethod
    public void request(PluginCall call) {
        if (hasAlways()) {
            resolveStatus(call);
            return;
        }
        if (!hasForeground()) {
            requestPermissionForAlias("location", call, "locationGranted");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            requestPermissionForAlias("background", call, "backgroundGranted");
            return;
        }
        resolveStatus(call);
    }

    @PermissionCallback
    private void locationGranted(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            resolveStatus(call);
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && !hasAlways()) {
            requestPermissionForAlias("background", call, "backgroundGranted");
            return;
        }
        resolveStatus(call);
    }

    @PermissionCallback
    private void backgroundGranted(PluginCall call) {
        resolveStatus(call);
    }
}
