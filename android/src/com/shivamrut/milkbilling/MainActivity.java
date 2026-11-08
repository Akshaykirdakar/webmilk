package com.shivamrut.milkbilling;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.text.InputType;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONObject;

/** The Milk Billing program as an app: the pages are inside the APK (assets/www), the data comes from the
 *  server address entered once (the API on the server PC, which talks to the Oracle database). Plus SMS:
 *  the page hands over its login, SmsService sends. */
public class MainActivity extends Activity {
    static final String PREFS = "milk";
    /** the pages are served to the WebView under this made-up address, see asset() */
    static final String HOST = "appassets.local";
    private WebView web;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        web.addJavascriptInterface(new Bridge(), "MilkSms");
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                return HOST.equals(u.getHost()) ? asset(u.getPath()) : null;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onCloseWindow(WebView w) { finish(); }
        });
        setContentView(web);
        if (server().isEmpty()) askServer(null); else open();
    }

    private SharedPreferences prefs() { return getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    private String server() { return prefs().getString("url", ""); }

    private boolean smsLater;   // "Later" pressed: don't ask again until the app is started again

    private boolean hasSms() {
        return Build.VERSION.SDK_INT < 23 || checkSelfPermission(Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED;
    }

    /** Asks for SMS (and notifications); when Android no longer shows the question, explains how to allow it in Settings. */
    private void askPermissions() {
        if (hasSms() || smsLater) return;
        if (!prefs().getBoolean("smsAsked", false) || shouldShowRequestPermissionRationale(Manifest.permission.SEND_SMS)) {
            prefs().edit().putBoolean("smsAsked", true).apply();
            requestPermissions(Build.VERSION.SDK_INT >= 33
                ? new String[]{Manifest.permission.SEND_SMS, "android.permission.POST_NOTIFICATIONS"}
                : new String[]{Manifest.permission.SEND_SMS}, 1);
        } else smsSettings();
    }

    @Override public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        if (!hasSms() && !shouldShowRequestPermissionRationale(Manifest.permission.SEND_SMS)) smsSettings();
    }

    @Override protected void onResume() {
        super.onResume();
        askPermissions();   // also after coming back from Settings
    }

    private void smsSettings() {
        new AlertDialog.Builder(this).setTitle("SMS permission is off")
            .setMessage("This phone cannot send the Milk Billing SMS until SMS is allowed.\n\n"
                + "Open settings > Permissions > SMS > Allow.\n\n"
                + "If it says \"Restricted setting\": on the App info page tap ⋮ (top right) > "
                + "Allow restricted settings, then allow SMS.")
            .setPositiveButton("Open settings", new DialogInterface.OnClickListener() {
                @Override public void onClick(DialogInterface d, int w) {
                    startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getPackageName(), null)));
                }
            })
            .setNegativeButton("Later", new DialogInterface.OnClickListener() {
                @Override public void onClick(DialogInterface d, int w) { smsLater = true; }
            }).show();
    }

    /** Server address, asked once; long press of the back key asks again. */
    private void askServer(String error) {
        final EditText t = new EditText(this);
        t.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        t.setText(server().isEmpty() ? "http://192.168.0.121:5080" : server());
        new AlertDialog.Builder(this).setTitle("Server address").setMessage(error).setView(t).setCancelable(false)
            .setPositiveButton("OK", new DialogInterface.OnClickListener() {
                @Override public void onClick(DialogInterface d, int w) {
                    String u = t.getText().toString().trim().replaceAll("/+$", "");
                    if (!u.matches("(?i)https?://.*")) u = "http://" + u;
                    prefs().edit().putString("url", u).apply();
                    open();
                }
            }).show();
    }

    /** Shows the pages and checks in the background that the server answers. */
    private void open() {
        web.loadUrl("http://" + HOST + "/index.html");
        startSms();
        final String url = server();
        new Thread(new Runnable() {
            @Override public void run() {
                String error = null;
                try {
                    HttpURLConnection c = (HttpURLConnection) new URL(url + "/api/health").openConnection();
                    c.setConnectTimeout(5000);
                    c.setReadTimeout(5000);
                    if (c.getResponseCode() != 200) error = "Server answered " + c.getResponseCode();
                    c.disconnect();
                } catch (Exception e) { error = e.getMessage(); }
                if (error == null) return;
                final String msg = "Cannot reach " + url + "\n" + error;
                runOnUiThread(new Runnable() { @Override public void run() { if (!isFinishing()) askServer(msg); } });
            }
        }).start();
    }

    /** A file from assets/www; js/config.js is made here so the page calls the API at the server address. */
    private WebResourceResponse asset(String path) {
        if (path == null || path.equals("/")) path = "/index.html";
        try {
            if (path.equals("/js/config.js")) {
                String js = "window.APP_CONFIG = { apiBase: " + JSONObject.quote(server()) + " };";
                return new WebResourceResponse("application/javascript", "utf-8", new ByteArrayInputStream(js.getBytes("UTF-8")));
            }
            String mime = mime(path);
            return new WebResourceResponse(mime, mime.startsWith("text/") || mime.endsWith("javascript") ? "utf-8" : null,
                getAssets().open("www" + path));
        } catch (IOException e) {
            WebResourceResponse r = new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
            r.setStatusCodeAndReasonPhrase(404, "Not Found");
            return r;
        }
    }

    private static String mime(String path) {
        String ext = path.substring(path.lastIndexOf('.') + 1).toLowerCase();
        switch (ext) {
            case "html": return "text/html";
            case "css": return "text/css";
            case "js": return "application/javascript";
            case "json": return "application/json";
            case "png": return "image/png";
            case "jpg": case "jpeg": return "image/jpeg";
            case "gif": return "image/gif";
            case "svg": return "image/svg+xml";
            case "ico": return "image/x-icon";
            case "ttf": return "font/ttf";
            case "otf": return "font/otf";
            case "woff": return "font/woff";
            case "woff2": return "font/woff2";
            default: return "application/octet-stream";
        }
    }

    private void startSms() {
        Intent i = new Intent(this, SmsService.class);
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(i); else startService(i);
    }

    @Override public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else moveTaskToBack(true);   // keeps running, SMS keep going
    }

    @Override public boolean onKeyLongPress(int keyCode, android.view.KeyEvent e) {
        if (keyCode == android.view.KeyEvent.KEYCODE_BACK) { askServer(null); return true; }
        return super.onKeyLongPress(keyCode, e);
    }

    /** window.MilkSms in the page */
    class Bridge {
        @JavascriptInterface public String deviceId() {
            return Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID);
        }
        @JavascriptInterface public void setToken(String token) {
            prefs().edit().putString("token", token).apply();
        }
    }
}
