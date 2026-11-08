package com.taark.engineeringinspection;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebSettings;
import android.webkit.WebChromeClient;
import android.webkit.WebViewClient;
import android.webkit.ValueCallback;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.widget.Toast;
import java.io.File;
import java.io.FileOutputStream;

public class MainActivity extends Activity {

    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private static final int FILE_PICKER = 1001;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);

        webView.addJavascriptInterface(new AndroidBridge(), "Android");
        webView.setWebViewClient(new WebViewClient());

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView view,
                    ValueCallback<Uri[]> callback,
                    FileChooserParams params) {

                if (fileCallback != null) {
                    fileCallback.onReceiveValue(null);
                }

                fileCallback = callback;

                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/pdf");

                startActivityForResult(intent, FILE_PICKER);
                return true;
            }
        });

        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == FILE_PICKER && fileCallback != null) {
            Uri[] results = null;

            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                results = new Uri[]{data.getData()};
            }

            fileCallback.onReceiveValue(results);
            fileCallback = null;
        }
    }

    public class AndroidBridge {
        @JavascriptInterface
        public void saveBlob(String base64Data, String fileName) {
            try {
                String cleanData = base64Data.substring(base64Data.indexOf(",") + 1);
                byte[] bytes = Base64.decode(cleanData, Base64.DEFAULT);

                File folder = new File(getExternalFilesDir(null), "EngineeringInspectionTool");
                if (!folder.exists()) folder.mkdirs();

                File file = new File(folder, fileName);

                FileOutputStream output = new FileOutputStream(file);
                output.write(bytes);
                output.close();

                runOnUiThread(() ->
                    Toast.makeText(MainActivity.this,
                        "Saved: " + file.getAbsolutePath(),
                        Toast.LENGTH_LONG).show()
                );

            } catch (Exception e) {
                runOnUiThread(() ->
                    Toast.makeText(MainActivity.this,
                        "Save failed: " + e.getMessage(),
                        Toast.LENGTH_LONG).show()
                );
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
