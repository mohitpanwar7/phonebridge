package com.phonebridgemobile;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaFormat;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.util.DisplayMetrics;
import android.view.Surface;
import androidx.annotation.NonNull;
import com.facebook.react.bridge.ActivityEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/**
 * Screen mirroring module using Android MediaProjection API.
 *
 * Flow:
 * 1. JS calls requestPermission() → shows system dialog
 * 2. User approves → onActivityResult gives us resultCode + data
 * 3. JS calls startMirroring() → creates VirtualDisplay → MediaCodec encodes frames
 * 4. JS calls stopMirroring() to tear down
 *
 * Note: this module handles the native side. The WebRTC track is set up on the JS
 * side using react-native-webrtc's custom video source (future integration point).
 */
public class ScreenMirrorModule extends ReactContextBaseJavaModule implements ActivityEventListener {

    private static final int REQUEST_MEDIA_PROJECTION = 2001;

    private final ReactApplicationContext reactContext;
    private MediaProjectionManager projectionManager;
    private MediaProjection mediaProjection;
    private VirtualDisplay virtualDisplay;
    private MediaCodec encoder;
    private Promise pendingPermissionPromise;

    private int resultCode;
    private Intent resultData;

    ScreenMirrorModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
        context.addActivityEventListener(this);
    }

    @NonNull
    @Override
    public String getName() {
        return "ScreenMirrorModule";
    }

    @ReactMethod
    public void requestPermission(Promise promise) {
        Activity activity = getCurrentActivity();
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No activity available");
            return;
        }
        pendingPermissionPromise = promise;
        projectionManager = (MediaProjectionManager)
            reactContext.getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        Intent captureIntent = projectionManager.createScreenCaptureIntent();
        activity.startActivityForResult(captureIntent, REQUEST_MEDIA_PROJECTION);
    }

    @ReactMethod
    public void startMirroring(int width, int height, int fps, Promise promise) {
        if (resultCode == 0 || resultData == null) {
            promise.reject("NO_PERMISSION", "Screen capture permission not granted");
            return;
        }
        try {
            mediaProjection = projectionManager.getMediaProjection(resultCode, resultData);
            if (mediaProjection == null) {
                promise.reject("PROJECTION_FAILED", "Could not get MediaProjection");
                return;
            }

            // Set up H.264 encoder
            MediaFormat format = MediaFormat.createVideoFormat("video/avc", width, height);
            format.setInteger(MediaFormat.KEY_BIT_RATE, 2_000_000); // 2 Mbps
            format.setInteger(MediaFormat.KEY_FRAME_RATE, fps);
            format.setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface);
            format.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1);

            encoder = MediaCodec.createEncoderByType("video/avc");
            encoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
            Surface encoderSurface = encoder.createInputSurface();
            encoder.start();

            // Create VirtualDisplay rendering to encoder input surface
            DisplayMetrics metrics = reactContext.getResources().getDisplayMetrics();
            virtualDisplay = mediaProjection.createVirtualDisplay(
                "PhoneBridgeMirror",
                width, height, metrics.densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                encoderSurface, null, null
            );

            promise.resolve("started");
        } catch (Exception e) {
            promise.reject("START_FAILED", e.getMessage());
        }
    }

    @ReactMethod
    public void stopMirroring(Promise promise) {
        try {
            if (virtualDisplay != null) { virtualDisplay.release(); virtualDisplay = null; }
            if (encoder != null) { encoder.stop(); encoder.release(); encoder = null; }
            if (mediaProjection != null) { mediaProjection.stop(); mediaProjection = null; }
            resultCode = 0;
            resultData = null;
            promise.resolve("stopped");
        } catch (Exception e) {
            promise.reject("STOP_FAILED", e.getMessage());
        }
    }

    @Override
    public void onActivityResult(Activity activity, int requestCode, int resultCode, Intent data) {
        if (requestCode == REQUEST_MEDIA_PROJECTION) {
            if (resultCode == Activity.RESULT_OK && data != null) {
                this.resultCode = resultCode;
                this.resultData = data;
                if (pendingPermissionPromise != null) {
                    pendingPermissionPromise.resolve("granted");
                    pendingPermissionPromise = null;
                }
            } else {
                if (pendingPermissionPromise != null) {
                    pendingPermissionPromise.reject("DENIED", "Screen capture permission denied");
                    pendingPermissionPromise = null;
                }
            }
        }
    }

    @Override
    public void onNewIntent(Intent intent) {}
}
