package com.shivamrut.milkbilling;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.provider.Settings;
import android.telephony.SmsManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Asks the server for waiting SMS and sends them from this phone's SIM, one at a time, a few seconds apart.
 * Limits and the choice of phone are decided by the server (SmsController). Runs while the phone is on, with a notification.
 */
public class SmsService extends Service {
    private static final String CHANNEL = "milk_sms", ACTION = "com.shivamrut.milkbilling.SMS_SENT";
    private static final long IDLE_MS = 10000, BETWEEN_MS = 3000, ERROR_MS = 30000;
    private volatile boolean running;
    private Thread thread;
    private PowerManager.WakeLock wake;

    @Override public IBinder onBind(Intent i) { return null; }

    @Override public int onStartCommand(Intent i, int flags, int id) {
        startForeground(1, note("Waiting for SMS"));
        if (thread == null) {
            running = true;
            wake = ((PowerManager) getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "milk:sms");
            wake.acquire();
            thread = new Thread(new Runnable() { @Override public void run() { loop(); } }, "sms");
            thread.start();
        }
        return START_STICKY;
    }

    @Override public void onDestroy() {
        running = false;
        if (thread != null) thread.interrupt();
        if (wake != null && wake.isHeld()) wake.release();
        super.onDestroy();
    }

    private Notification note(String text) {
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel c = new NotificationChannel(CHANNEL, "SMS", NotificationManager.IMPORTANCE_LOW);
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(c);
            b = new Notification.Builder(this, CHANNEL);
        } else b = new Notification.Builder(this);
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE);
        return b.setContentTitle("Milk Billing SMS").setContentText(text).setSmallIcon(R.drawable.icon).setContentIntent(pi).setOngoing(true).build();
    }

    private void show(String text) { ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(1, note(text)); }

    private void loop() {
        while (running) {
            long wait = IDLE_MS;
            try {
                SharedPreferences p = getSharedPreferences(MainActivity.PREFS, Context.MODE_PRIVATE);
                String url = p.getString("url", ""), token = p.getString("token", "");
                boolean can = Build.VERSION.SDK_INT < 23 || checkSelfPermission(Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED;
                if (!url.isEmpty() && !token.isEmpty() && can) wait = work(url, token);
            } catch (InterruptedException e) {
                return;
            } catch (Exception e) {
                wait = ERROR_MS;                 // no Wi-Fi, server off, login expired: try later
            }
            try { Thread.sleep(wait); } catch (InterruptedException e) { return; }
        }
    }

    private long work(String url, String token) throws Exception {
        String device = Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID);
        JSONObject req = new JSONObject().put("device", device).put("name", Build.MANUFACTURER + " " + Build.MODEL);
        JSONObject res = new JSONObject(post(url + "/api/sms/next", token, req.toString()));
        JSONArray list = res.getJSONArray("messages");
        int sent = res.optInt("sentToday");
        for (int i = 0; i < list.length() && running; i++) {
            JSONObject m = list.getJSONObject(i);
            String error = send(m.getString("to"), m.getString("text"));
            JSONObject rep = new JSONObject().put("device", device).put("id", m.getLong("id")).put("ok", error == null);
            if (error != null) rep.put("error", error); else sent++;
            post(url + "/api/sms/report", token, rep.toString());
            Thread.sleep(BETWEEN_MS);
        }
        show((res.optBoolean("enabled") ? "Sent today: " + sent + " / " + res.optInt("limit") : "SMS is off"));
        return list.length() > 0 ? 500 : IDLE_MS;
    }

    /** null when the phone network accepted the message, else the reason */
    private String send(String to, String text) throws InterruptedException {
        SmsManager sms = SmsManager.getDefault();
        ArrayList<String> parts = sms.divideMessage(text);
        final CountDownLatch done = new CountDownLatch(parts.size());
        final AtomicInteger failed = new AtomicInteger(0);
        BroadcastReceiver r = new BroadcastReceiver() {
            @Override public void onReceive(Context c, Intent in) {
                int code = getResultCode();
                if (code != Activity.RESULT_OK) failed.set(code);
                done.countDown();
            }
        };
        String action = ACTION + System.nanoTime();
        registerReceiver(r, new IntentFilter(action));
        try {
            ArrayList<PendingIntent> sent = new ArrayList<>();
            for (int i = 0; i < parts.size(); i++) {
                Intent in = new Intent(action).setPackage(getPackageName());
                sent.add(PendingIntent.getBroadcast(this, i, in, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_ONE_SHOT));
            }
            sms.sendMultipartTextMessage(to, null, parts, sent, null);
            if (!done.await(60, TimeUnit.SECONDS)) return "no answer from the phone network";
            return failed.get() == 0 ? null : "phone network error " + failed.get();
        } catch (RuntimeException e) {
            return String.valueOf(e.getMessage());
        } finally {
            unregisterReceiver(r);
        }
    }

    private String post(String url, String token, String body) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        try {
            c.setConnectTimeout(8000); c.setReadTimeout(15000);
            c.setRequestMethod("POST"); c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            c.setRequestProperty("Authorization", "Bearer " + token);
            try (OutputStream o = c.getOutputStream()) { o.write(body.getBytes("UTF-8")); }
            int code = c.getResponseCode();
            if (code / 100 != 2) throw new RuntimeException("HTTP " + code);
            try (InputStream in = c.getInputStream()) {
                ByteArrayOutputStream b = new ByteArrayOutputStream();
                byte[] buf = new byte[4096]; int n;
                while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
                return b.toString("UTF-8");
            }
        } finally { c.disconnect(); }
    }
}
