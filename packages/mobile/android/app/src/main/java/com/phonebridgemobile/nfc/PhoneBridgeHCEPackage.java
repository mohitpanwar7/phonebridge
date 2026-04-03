package com.phonebridgemobile.nfc;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * PhoneBridgeHCEPackage
 *
 * ReactPackage that registers {@link PhoneBridgeHCEModule} with React Native.
 *
 * Register this package in your MainApplication by adding:
 *   new PhoneBridgeHCEPackage()
 * to the list returned by getPackages().
 */
public class PhoneBridgeHCEPackage implements ReactPackage {

    /**
     * Returns the list of native modules to register with React Native.
     * Includes {@link PhoneBridgeHCEModule} which is accessible in JS as
     * NativeModules.PhoneBridgeHCE.
     */
    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
        List<NativeModule> modules = new ArrayList<>();
        modules.add(new PhoneBridgeHCEModule(reactContext));
        return modules;
    }

    /**
     * No custom view managers are provided by this package.
     */
    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
        return Collections.emptyList();
    }
}
