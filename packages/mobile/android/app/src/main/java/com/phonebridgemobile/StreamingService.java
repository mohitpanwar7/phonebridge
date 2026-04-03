package com.phonebridgemobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;

/**
 * Foreground service that keeps the streaming session alive when the phone
 * screen is turned off or the app is backgrounded.
 *
 * Requires: FOREGROUND_SERVICE, CAMERA, MICROPHONE, FOREGROUND_SERVICE_CAMERA,
 *           FOREGROUND_SERVICE_MICROPHONE in AndroidManifest.xml
 */
public class StreamingService extends Service {

    private static final String CHANNEL_ID = "phonebridge_streaming";
    private static final int NOTIF_ID = 1001;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if ("STOP".equals(action)) {
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        Intent openApp = new Intent(this, MainActivity.class);
        openApp.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(
            this, 0, openApp,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent stopIntent = new Intent(this, StreamingService.class);
        stopIntent.setAction("STOP");
        PendingIntent stopPi = PendingIntent.getService(
            this, 0, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("PhoneBridge — Streaming")
            .setContentText("Camera and mic active. Tap to open.")
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setContentIntent(pi)
            .addAction(android.R.drawable.ic_delete, "Stop", stopPi)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();

        startForeground(NOTIF_ID, notification);
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "PhoneBridge Streaming",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Keeps camera/mic active while streaming");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }
}
