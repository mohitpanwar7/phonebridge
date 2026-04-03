package com.phonebridgemobile.nfc;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/**
 * PhoneBridgeHCEModule
 *
 * React Native NativeModule that controls the HCE (Host Card Emulation) service.
 *
 * Exposed JS name: "PhoneBridgeHCE"
 *
 * Methods available to JavaScript:
 *   startEmulation(tagId: string, payloadString: string) — parse the NDEF payload
 *       string and start the HCE service.
 *   stopEmulation() — stop the HCE service.
 *
 * The payload string follows the format defined in HCEService.ts:
 *   "tnf:type:hexPayload|tnf:type:hexPayload|..."
 */
public class PhoneBridgeHCEModule extends ReactContextBaseJavaModule {

    private static final String TAG = "PhoneBridgeHCE";

    /** Module name exposed to React Native (accessible as NativeModules.PhoneBridgeHCE) */
    private static final String MODULE_NAME = "PhoneBridgeHCE";

    private final ReactApplicationContext reactContext;

    public PhoneBridgeHCEModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    // -----------------------------------------------------------------------
    // ReactContextBaseJavaModule
    // -----------------------------------------------------------------------

    @Override
    public String getName() {
        return MODULE_NAME;
    }

    // -----------------------------------------------------------------------
    // React Methods
    // -----------------------------------------------------------------------

    /**
     * Starts NFC HCE emulation.
     *
     * @param tagId        Identifier for the virtual tag (informational; logged).
     * @param payloadString NDEF payload string in "tnf:type:hexPayload|…" format.
     */
    @ReactMethod
    public void startEmulation(String tagId, String payloadString) {
        Log.d(TAG, "startEmulation: tagId=" + tagId + " payload=" + payloadString);

        // Parse the payload string into raw NDEF bytes and store on the service class
        byte[] ndefBytes = PhoneBridgeHCEService.parseNdefPayloadString(payloadString);
        PhoneBridgeHCEService.currentNdefBytes = ndefBytes;
        Log.d(TAG, "startEmulation: NDEF bytes length=" + ndefBytes.length);

        // Start (or restart) the HCE service
        startHceService();
    }

    /**
     * Stops NFC HCE emulation and resets the NDEF payload to the default.
     */
    @ReactMethod
    public void stopEmulation() {
        Log.d(TAG, "stopEmulation: stopping HCE service");
        stopHceService();
    }

    // -----------------------------------------------------------------------
    // Service lifecycle helpers
    // -----------------------------------------------------------------------

    private void startHceService() {
        try {
            Context context = reactContext.getApplicationContext();
            Intent intent = new Intent(context, PhoneBridgeHCEService.class);
            intent.setComponent(new ComponentName(context, PhoneBridgeHCEService.class));
            context.startService(intent);
            Log.d(TAG, "startHceService: service started");
        } catch (Exception e) {
            Log.d(TAG, "startHceService: failed to start service: " + e.getMessage());
        }
    }

    private void stopHceService() {
        try {
            Context context = reactContext.getApplicationContext();
            Intent intent = new Intent(context, PhoneBridgeHCEService.class);
            intent.setComponent(new ComponentName(context, PhoneBridgeHCEService.class));
            context.stopService(intent);
            Log.d(TAG, "stopHceService: service stopped");
        } catch (Exception e) {
            Log.d(TAG, "stopHceService: failed to stop service: " + e.getMessage());
        }
    }
}
