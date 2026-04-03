package com.phonebridgemobile;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

/**
 * Home screen widget: shows connection status, one-tap connect/disconnect.
 * Status is persisted via SharedPreferences (updated by JS via ReactMethod).
 */
public class PhoneBridgeWidget extends AppWidgetProvider {

    private static final String PREFS = "PhoneBridgeWidget";
    private static final String KEY_CONNECTED = "connected";
    private static final String KEY_PC_NAME = "pcName";
    private static final String ACTION_TOGGLE = "com.phonebridgemobile.WIDGET_TOGGLE";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) updateWidget(ctx, mgr, id);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        if (ACTION_TOGGLE.equals(intent.getAction())) {
            // Launch the app — JS will handle connection toggle
            Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
            if (launch != null) {
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(launch);
            }
        }
    }

    static void updateWidget(Context ctx, AppWidgetManager mgr, int widgetId) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        boolean connected = prefs.getBoolean(KEY_CONNECTED, false);
        String pcName = prefs.getString(KEY_PC_NAME, "");

        // Build RemoteViews using a simple layout (layout/widget_phonebridge.xml)
        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_phonebridge);
        views.setTextViewText(R.id.widget_status,
            connected ? ("Connected" + (pcName.isEmpty() ? "" : ": " + pcName)) : "Disconnected");
        views.setTextViewText(R.id.widget_btn, connected ? "Disconnect" : "Connect");

        Intent toggle = new Intent(ctx, PhoneBridgeWidget.class);
        toggle.setAction(ACTION_TOGGLE);
        PendingIntent pi = PendingIntent.getBroadcast(ctx, 0, toggle,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_btn, pi);

        mgr.updateAppWidget(widgetId, views);
    }

    /** Called from JS/React Native to update widget state */
    public static void setConnected(Context ctx, boolean connected, String pcName) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_CONNECTED, connected)
            .putString(KEY_PC_NAME, pcName != null ? pcName : "")
            .apply();

        // Update all widget instances
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        android.content.ComponentName provider = new android.content.ComponentName(ctx, PhoneBridgeWidget.class);
        int[] ids = mgr.getAppWidgetIds(provider);
        for (int id : ids) updateWidget(ctx, mgr, id);
    }
}
