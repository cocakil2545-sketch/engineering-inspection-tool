
package com.taark.engineeringinspection;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebSettings;
import android.webkit.WebChromeClient;
import android.webkit.WebViewClient;
import android.webkit.ValueCallback;
import android.webkit.JavascriptInterface;
import android.webkit.ConsoleMessage;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import android.util.Log;
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

        // JavaScript and storage
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);

        // Allow local HTML and JavaScript files
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);

        // Android bridge for saving files
        webView.addJavascriptInterface(new AndroidBridge(), "Android");

        webView.setWebViewClient(new WebViewClient());

        // File picker and JavaScript console
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

                try {
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("application/pdf");
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

                    startActivityForResult(intent, FILE_PICKER);

                } catch (Exception e) {
                    Log.e("InspectionTool", "File picker error", e);
                    fileCallback.onReceiveValue(null);
                    fileCallback = null;

                    Toast.makeText(
                        MainActivity.this,
                        "Unable to open PDF picker",
                        Toast.LENGTH_LONG
                    ).show();
                }

                return true;
            }

            @Override
            public boolean onConsoleMessage(ConsoleMessage message) {
                Log.d(
                    "InspectionTool",
                    message.message() + " — line " + message.lineNumber()
                );
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
                        } else if (fileName.toLowerCase().endsWith(".xlsx")) {
                            mimeType =
                                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
                        }

                        Intent intent =
                            new Intent(Intent.ACTION_CREATE_DOCUMENT);

                        intent.addCategory(Intent.CATEGORY_OPENABLE);
                        intent.setType(mimeType);
                        intent.putExtra(Intent.EXTRA_TITLE, fileName);

                        startActivityForResult(intent, SAVE_FILE);

                    } catch (Exception e) {
                        Log.e("InspectionTool", "Save picker error", e);

                        Toast.makeText(
                            MainActivity.this,
                            "Unable to open save location",
                            Toast.LENGTH_LONG
                        ).show();
                    }
                });

            } catch (Exception e) {
                Log.e("InspectionTool", "File preparation error", e);

                Toast.makeText(
                    MainActivity.this,
                    "File preparation failed: " + e.getMessage(),
                    Toast.LENGTH_LONG
                ).show();
            }
        }
    }

    @Override
    protected void onActivityResult(
            int requestCode,
            int resultCode,
            Intent data) {

        super.onActivityResult(requestCode, resultCode, data);

        // PDF selection
        if (requestCode == FILE_PICKER) {

            Uri[] results = null;

            if (resultCode == RESULT_OK &&
                    data != null &&
                    data.getData() != null) {

                results = new Uri[]{data.getData()};
            }

            if (fileCallback != null) {
                fileCallback.onReceiveValue(results);
                fileCallback = null;
            }
        }

        // Save PDF or Excel
        if (requestCode == SAVE_FILE) {

            if (resultCode == RESULT_OK &&
                    data != null &&
                    data.getData() != null) {

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

                    Toast.makeText(
                        this,
                        "File saved successfully",
                        Toast.LENGTH_LONG
                    ).show();

                } catch (Exception e) {
                    Log.e("InspectionTool", "Save failed", e);

                    Toast.makeText(
                        this,
                        "Save failed: " + e.getMessage(),
                        Toast.LENGTH_LONG
                    ).show();
                }

            } else {
                Toast.makeText(
                    this,
                    "Save cancelled",
                    Toast.LENGTH_SHORT
                ).show();
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
