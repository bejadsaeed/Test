package com.bgz.yatelha2;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** Offline WebView shell: the whole game lives in assets/index.html. */
@SuppressWarnings({"rawtypes", "unchecked", "deprecation"})
public class MainActivity extends Activity implements ValueCallback {
    private static final String HOME = "file:///android_asset/index.html";
    private WebView web;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        w.setStatusBarColor(0xFF120A38);
        w.setNavigationBarColor(0xFF07051A);

        web = new WebView(this);
        web.setBackgroundColor(0xFF07051A);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        web.setWebViewClient(new Client());
        setContentView(web);
        web.loadUrl(HOME);
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(window.__back&&window.__back())===true", this);
    }

    /** Result of the JS back handler: anything but "true" means the game did not consume it. */
    @Override
    public void onReceiveValue(Object handled) {
        if (!"true".equals(String.valueOf(handled))) finish();
    }

    /** Keeps the WebView on the bundled page; anything else opens outside the app. */
    static final class Client extends WebViewClient {
        Client() { }

        @Override
        public boolean shouldOverrideUrlLoading(WebView v, String url) {
            if (url != null && url.startsWith("file:///android_asset/")) return false;
            try { v.getContext().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception ignored) { }
            return true;
        }
    }

    @Override
    protected void onPause() { super.onPause(); web.onPause(); }

    @Override
    protected void onResume() { super.onResume(); web.onResume(); }

    @Override
    protected void onDestroy() { web.destroy(); super.onDestroy(); }
}
