package com.shivamrut.milkbilling;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.text.InputType;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;

/** The Milk Billing web program in a window, plus SMS: the page hands over its login, SmsService sends. */
public class MainActivity extends Activity {
    static final String PREFS = "milk";
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
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onCloseWindow(WebView w) { finish(); }
        });
        setContentView(web);
        askPermissions();
        String url = prefs().getString("url", "");
        if (url.isEmpty()) askServer(); else open(url);
    }

    private SharedPreferences prefs() { return getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    private void askPermissions() {
        if (Build.VERSION.SDK_INT < 23) return;
        boolean sms = checkSelfPermission(Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED;
        if (!sms) requestPermissions(Build.VERSION.SDK_INT >= 33
            ? new String[]{Manifest.permission.SEND_SMS, "android.permission.POST_NOTIFICATIONS"}
            : new String[]{Manifest.permission.SEND_SMS}, 1);
    }

    /** Server address, asked once; long press of the back key asks again. */
    private void askServer() {
        final EditText t = new EditText(this);
        t.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        String cur = prefs().getString("url", "");
        t.setText(cur.isEmpty() ? "http://192.168.0.121:5080" : cur);
        new AlertDialog.Builder(this).setTitle("Server address").setView(t).setCancelable(false)
            .setPositiveButton("OK", new android.content.DialogInterface.OnClickListener() {
                @Override public void onClick(android.content.DialogInterface d, int w) {
                    String u = t.getText().toString().trim();
                    prefs().edit().putString("url", u).apply();
                    open(u);
                }
            }).show();
    }

    private void open(String url) {
        web.loadUrl(url);
        startSms();
    }

    private void startSms() {
        Intent i = new Intent(this, SmsService.class);
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(i); else startService(i);
    }

    @Override public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else moveTaskToBack(true);   // keeps running, SMS keep going
    }

    @Override public boolean onKeyLongPress(int keyCode, android.view.KeyEvent e) {
        if (keyCode == android.view.KeyEvent.KEYCODE_BACK) { askServer(); return true; }
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
