
package com.taark.engineeringinspection;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebSettings;
import android.webkit.WebChromeClient;
import android.webkit.WebViewClient;
import android.webkit.ValueCallback;
import android.webkit.JavascriptInterface;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import android.widget.Toast;

import java.io.OutputStream;

public class MainActivity extends Activity {

    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;

    private static final int FILE_PICKER = 1001;
    private static final int SAVE_FILE = 1002;

    private byte[] pendingBytes;
    private String pendingFileName;

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

    public class AndroidBridge {

        @JavascriptInterface
        public void saveBlob(String base64Data, String fileName) {
            try {
                String cleanData =
                    base64Data.substring(base64Data.indexOf(",") + 1);

                pendingBytes = Base64.decode(cleanData, Base64.DEFAULT);
                pendingFileName = fileName;

                runOnUiThread(() -> {
                    try {
                        String mimeType = "application/octet-stream";

                        if (fileName.toLowerCase().endsWith(".pdf")) {
                            mimeType = "application/pdf";
                        } else if (
                            fileName.toLowerCase().endsWith(".xlsx")) {
                            mimeType =
                                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
                        }

                        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                        intent.addCategory(Intent.CATEGORY_OPENABLE);
                        intent.setType(mimeType);
                        intent.putExtra(Intent.EXTRA_TITLE, fileName);

                        startActivityForResult(intent, SAVE_FILE);

                    } catch (Exception e) {
                        Toast.makeText(MainActivity.this,
                            "Unable to open save location",
                            Toast.LENGTH_LONG).show();
                    }
                });

            } catch (Exception e) {
                Toast.makeText(MainActivity.this,
                    "File preparation failed: " + e.getMessage(),
                    Toast.LENGTH_LONG).show();
            }
        }
    }

    @Override
    protected void onActivityResult(
            int requestCode, int resultCode, Intent data) {

        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == FILE_PICKER && fileCallback != null) {
            Uri[] results = null;

            if (resultCode == RESULT_OK &&
                    data != null && data.getData() != null) {
                results = new Uri[]{data.getData()};
            }

            fileCallback.onReceiveValue(results);
            fileCallback = null;
        }

        if (requestCode == SAVE_FILE) {
            if (resultCode == RESULT_OK &&
                    data != null && data.getData() != null) {

                try {
                    Uri uri = data.getData();

                    try (OutputStream output =
                            getContentResolver().openOutputStream(uri)) {

                        if (output == null || pendingBytes == null) {
                            throw new Exception("Unable to write file");
                        }

                        output.write(pendingBytes);
                        output.flush();
                    }

                    Toast.makeText(this,
                        "File saved successfully",
                        Toast.LENGTH_LONG).show();

                } catch (Exception e) {
                    Toast.makeText(this,
                        "Save failed: " + e.getMessage(),
                        Toast.LENGTH_LONG).show();
                }

            } else {
                Toast.makeText(this,
                    "Save cancelled",
                    Toast.LENGTH_SHORT).show();
            }

            pendingBytes = null;
            pendingFileName = null;
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
