package com.phonebridgemobile;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.annotation.NonNull;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/**
 * React Native native module to start/stop the StreamingService foreground service.
 * Registered in MainApplication via the Packages list.
 */
public class StreamingServiceModule extends ReactContextBaseJavaModule {

    StreamingServiceModule(ReactApplicationContext context) {
        super(context);
    }

    @NonNull
    @Override
    public String getName() {
        return "StreamingServiceModule";
    }

    @ReactMethod
    public void start() {
        Context ctx = getReactApplicationContext();
        Intent intent = new Intent(ctx, StreamingService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(intent);
        } else {
            ctx.startService(intent);
        }
    }

    @ReactMethod
    public void stop() {
        Context ctx = getReactApplicationContext();
        Intent intent = new Intent(ctx, StreamingService.class);
        intent.setAction("STOP");
        ctx.startService(intent);
    }
}
