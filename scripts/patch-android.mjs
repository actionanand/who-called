import { access, copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const capacitorConfigPath = resolve('android/app/src/main/assets/capacitor.config.json');
const capacitorConfig = JSON.parse(await readFile(capacitorConfigPath, 'utf8'));
const appId = capacitorConfig.appId;

if (typeof appId !== 'string' || !appId.trim()) {
  throw new Error(`Android appId is missing from ${capacitorConfigPath}.`);
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const javaPath = resolve('android/app/src/main/java', ...appId.split('.'), 'MainActivity.java');
const manifestPath = resolve('android/app/src/main/AndroidManifest.xml');
const gradlePath = resolve('android/app/build.gradle');
const resPath = resolve('android/app/src/main/res');
const stylesPath = resolve(resPath, 'values/styles.xml');
const nightStylesPath = resolve(resPath, 'values-night/styles.xml');
const notificationIconPath = resolve(resPath, 'drawable/ic_stat_who_called.xml');
const splashSourcePath = resolve('public/who-called.png');
const splashLogoPath = resolve(resPath, 'drawable-nodpi/who_called_splash_logo.png');
const splashIconPath = resolve(resPath, 'drawable/who_called_splash_icon.xml');
const splashPath = resolve(resPath, 'drawable/splash.xml');
const enableCallLog = process.env.ENABLE_DEVICE_CALL_LOG !== 'false';

await access(javaPath).catch(() => {
  throw new Error(`Android project file not found: ${javaPath}. Run "npx cap add android" first.`);
});

let manifest = await readFile(manifestPath, 'utf8');
const permissions = [
  'android.permission.USE_BIOMETRIC',
  'android.permission.CAMERA',
  'android.permission.POST_NOTIFICATIONS',
];
if (enableCallLog) permissions.push('android.permission.READ_CALL_LOG');

for (const permission of permissions) {
  if (!manifest.includes(permission)) {
    manifest = manifest.replace(
      /(<manifest[^>]*>)/,
      `$1\n    <uses-permission android:name="${permission}" />`,
    );
  }
}
if (!enableCallLog) {
  manifest = manifest.replace(
    /\s*<uses-permission android:name="android\.permission\.READ_CALL_LOG"\s*\/>/g,
    '',
  );
}

if (!manifest.includes('com.whatsapp.w4b')) {
  manifest = manifest.replace(
    '</manifest>',
    `    <queries>
        <package android:name="com.whatsapp" />
        <package android:name="com.whatsapp.w4b" />
    </queries>
</manifest>`,
  );
}

manifest = manifest.replace(
  /<activity\b(?=[^>]*android:name="\.MainActivity")[^>]*>/,
  (activity) => {
    const themed = activity.includes('android:theme=')
      ? activity.replace(
          /android:theme="[^"]*"/,
          'android:theme="@style/AppTheme.NoActionBarLaunch"',
        )
      : activity.replace(/>$/, '\n            android:theme="@style/AppTheme.NoActionBarLaunch">');
    return themed;
  },
);

if (!manifest.includes('android.intent.action.SEND')) {
  manifest = manifest.replace(
    /(<activity\b(?=[^>]*android:name="\.MainActivity")[^>]*>)/,
    `$1
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="text/plain" />
            </intent-filter>`,
  );
}
await writeFile(manifestPath, manifest, 'utf8');

let gradle = await readFile(gradlePath, 'utf8');
if (!gradle.includes('androidx.biometric:biometric')) {
  gradle = gradle.replace(
    /dependencies\s*\{/,
    "dependencies {\n    implementation 'androidx.biometric:biometric:1.1.0'",
  );
  await writeFile(gradlePath, gradle, 'utf8');
}

await mkdir(dirname(notificationIconPath), { recursive: true });
await writeFile(
  notificationIconPath,
  `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#FFFFFFFF"
        android:pathData="M6.6,10.8c1.5,3 3.7,5.2 6.7,6.7l2.2,-2.2c0.3,-0.3 0.7,-0.4 1,-0.2 1.1,0.4 2.2,0.6 3.4,0.6 0.6,0 1,0.4 1,1V20c0,0.6 -0.4,1 -1,1C10.6,21 3,13.4 3,4c0,-0.6 0.4,-1 1,-1h3.5c0.6,0 1,0.4 1,1 0,1.2 0.2,2.4 0.6,3.4 0.1,0.4 0,0.8 -0.2,1z" />
</vector>`,
  'utf8',
);

try {
  for (const directory of await readdir(resPath)) {
    if (!directory.startsWith('drawable')) continue;
    const generatedSplashPng = resolve(resPath, directory, 'splash.png');
    const generatedSplashXml = resolve(resPath, directory, 'splash.xml');
    if (await fileExists(generatedSplashPng)) await rm(generatedSplashPng);
    if (directory !== 'drawable' && (await fileExists(generatedSplashXml))) {
      await rm(generatedSplashXml);
    }
  }
} catch {
  // Capacitor creates resource folders during sync; missing folders are harmless here.
}

await mkdir(dirname(splashLogoPath), { recursive: true });
await copyFile(splashSourcePath, splashLogoPath);
await writeFile(
  splashIconPath,
  `<?xml version="1.0" encoding="utf-8"?>
<inset xmlns:android="http://schemas.android.com/apk/res/android"
    android:drawable="@drawable/who_called_splash_logo"
    android:inset="22%" />`,
  'utf8',
);
await writeFile(
  splashPath,
  `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item>
        <shape android:shape="rectangle">
            <solid android:color="#111B21" />
        </shape>
    </item>
    <item android:gravity="center">
        <inset
            android:drawable="@drawable/who_called_splash_icon"
            android:inset="34%" />
    </item>
</layer-list>`,
  'utf8',
);

const ensureThemes = async (path, dark) => {
  await mkdir(dirname(path), { recursive: true });
  let styles;
  try {
    styles = await readFile(path, 'utf8');
  } catch {
    styles = '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n</resources>\n';
  }

  const body = dark
    ? `    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="android:statusBarColor">#0E1713</item>
        <item name="android:navigationBarColor">#0E1713</item>
        <item name="android:windowLightStatusBar">false</item>
        <item name="android:windowLightNavigationBar">false</item>
    </style>
    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">#111B21</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/who_called_splash_icon</item>
        <item name="windowSplashScreenIconBackgroundColor">@android:color/transparent</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
        <item name="android:statusBarColor">#111B21</item>
        <item name="android:navigationBarColor">#111B21</item>
        <item name="android:windowLightStatusBar">false</item>
        <item name="android:windowLightNavigationBar">false</item>
    </style>`
    : `    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="android:statusBarColor">#F4F7F4</item>
        <item name="android:navigationBarColor">#F4F7F4</item>
        <item name="android:windowLightStatusBar">true</item>
        <item name="android:windowLightNavigationBar">true</item>
    </style>
    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">#111B21</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/who_called_splash_icon</item>
        <item name="windowSplashScreenIconBackgroundColor">@android:color/transparent</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
        <item name="android:statusBarColor">#111B21</item>
        <item name="android:navigationBarColor">#111B21</item>
        <item name="android:windowLightStatusBar">false</item>
        <item name="android:windowLightNavigationBar">false</item>
    </style>`;

  styles = styles.replace(/\s*<style name="AppTheme\.NoActionBar"[\s\S]*?<\/style>/g, '');
  styles = styles.replace(/\s*<style name="AppTheme\.NoActionBarLaunch"[\s\S]*?<\/style>/g, '');
  styles = styles.replace('</resources>', `${body}\n</resources>`);
  await writeFile(path, styles, 'utf8');
};

await ensureThemes(stylesPath, false);
await ensureThemes(nightStylesPath, true);

const source = `package ${appId};

import android.Manifest;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsetsController;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.webkit.JavascriptInterface;
import android.provider.CallLog;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import org.json.JSONArray;
import org.json.JSONObject;

import java.security.KeyStore;
import java.util.concurrent.Executor;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

public class MainActivity extends BridgeActivity {
  private static final boolean DEVICE_CALL_LOG_ENABLED = ${enableCallLog};
  private static final int CALL_LOG_PERMISSION_REQUEST = 4801;
  private static final String BIOMETRIC_KEY_ALIAS = "who_called_biometric_key";
  private static final String SECURITY_PREFERENCES = "who_called_security";
  private final Handler mainHandler = new Handler(Looper.getMainLooper());
  private boolean darkMode;
  private View launchOverlay;
  private long launchOverlayShownAt;
  private String sharedText = "";

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    darkMode = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
      == Configuration.UI_MODE_NIGHT_YES;
    captureSharedText(getIntent());
    showLaunchOverlay();
    getBridge().getWebView().addJavascriptInterface(new WhoCalledNativeBridge(), "WhoCalledNative");
    getBridge().getWebView().addJavascriptInterface(new SystemBarsBridge(), "WhoCalledSystemBars");
    getWindow().setBackgroundDrawable(
      new android.graphics.drawable.ColorDrawable(Color.parseColor("#0E1713"))
    );
    getBridge().getWebView().setBackgroundColor(Color.parseColor(darkMode ? "#0E1713" : "#F4F7F4"));
    applyLaunchBarStyle();
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    captureSharedText(intent);
  }

  @Override
  public void onRequestPermissionsResult(
    int requestCode,
    String[] permissions,
    int[] grantResults
  ) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    if (requestCode != CALL_LOG_PERMISSION_REQUEST) return;
    if (
      grantResults.length > 0
        && grantResults[0] == PackageManager.PERMISSION_GRANTED
    ) {
      dispatchDeviceCallHistory();
    } else {
      dispatchNativeResult(
        "call-history",
        false,
        "",
        "Phone call history permission was not granted."
      );
    }
  }

  @Override
  public void onResume() {
    super.onResume();
    if (launchOverlay == null) applySystemBars(darkMode);
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus && launchOverlay == null) applySystemBars(darkMode);
  }

  private void captureSharedText(Intent intent) {
    if (Intent.ACTION_SEND.equals(intent.getAction()) && "text/plain".equals(intent.getType())) {
      String text = intent.getStringExtra(Intent.EXTRA_TEXT);
      sharedText = text == null ? "" : text;
    }
  }

  public class SystemBarsBridge {
    @JavascriptInterface
    public void setDarkMode(boolean enabled) {
      darkMode = enabled;
      runOnUiThread(() -> applySystemBars(enabled));
    }
  }

  public class WhoCalledNativeBridge {
    @JavascriptInterface
    public void hideSplash() {
      runOnUiThread(() -> hideLaunchOverlay());
    }

    @JavascriptInterface
    public String consumeSharedText() {
      String value = sharedText;
      sharedText = "";
      return value;
    }

    @JavascriptInterface
    public String readClipboard() {
      ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
      if (clipboard == null || !clipboard.hasPrimaryClip()) return "";
      ClipData clip = clipboard.getPrimaryClip();
      if (clip == null || clip.getItemCount() == 0) return "";
      CharSequence text = clip.getItemAt(0).coerceToText(MainActivity.this);
      return text == null ? "" : text.toString();
    }

    @JavascriptInterface
    public void openDialler(String number) {
      startActivity(new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(number))));
    }

    @JavascriptInterface
    public void openSms(String number, String message) {
      Intent intent = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + Uri.encode(number)));
      intent.putExtra("sms_body", message);
      startActivity(intent);
    }

    @JavascriptInterface
    public void openWhatsApp(String number, String message, boolean businessFallback) {
      runOnUiThread(() -> {
        String url = "https://wa.me/" + number + (message.isEmpty() ? "" : "?text=" + Uri.encode(message));
        String[] packages = businessFallback
          ? new String[] { "com.whatsapp", "com.whatsapp.w4b" }
          : new String[] { "com.whatsapp" };
        for (String packageName : packages) {
          Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
          intent.setPackage(packageName);
          if (intent.resolveActivity(getPackageManager()) != null) {
            startActivity(intent);
            return;
          }
        }
        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
      });
    }

    @JavascriptInterface
    public String availableWhatsAppApps() {
      JSONArray applications = new JSONArray();
      if (isPackageAvailable("com.whatsapp")) {
        applications.put("com.whatsapp");
      }
      if (isPackageAvailable("com.whatsapp.w4b")) {
        applications.put("com.whatsapp.w4b");
      }
      return applications.toString();
    }

    @JavascriptInterface
    public void openWhatsAppIn(String number, String message, String packageName) {
      runOnUiThread(() -> {
        String url = "https://wa.me/" + number
          + (message.isEmpty() ? "" : "?text=" + Uri.encode(message));
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        intent.setPackage(packageName);
        if (intent.resolveActivity(getPackageManager()) != null) {
          startActivity(intent);
        } else {
          startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        }
      });
    }

    @JavascriptInterface
    public void copyText(String value) {
      ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
      clipboard.setPrimaryClip(ClipData.newPlainText("Who Called", value));
    }

    @JavascriptInterface
    public void setScreenshotProtection(boolean enabled) {
      runOnUiThread(() -> {
        if (enabled) {
          getWindow().setFlags(
            android.view.WindowManager.LayoutParams.FLAG_SECURE,
            android.view.WindowManager.LayoutParams.FLAG_SECURE
          );
        } else {
          getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
        }
      });
    }

    @JavascriptInterface
    public boolean deviceCallHistorySupported() {
      return DEVICE_CALL_LOG_ENABLED;
    }

    @JavascriptInterface
    public void requestDeviceCallHistory() {
      runOnUiThread(() -> {
        if (!DEVICE_CALL_LOG_ENABLED) {
          dispatchNativeResult(
            "call-history",
            false,
            "",
            "Phone call history is disabled in this Android build."
          );
          return;
        }
        if (
          Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            && checkSelfPermission(Manifest.permission.READ_CALL_LOG)
              != PackageManager.PERMISSION_GRANTED
        ) {
          requestPermissions(
            new String[] { Manifest.permission.READ_CALL_LOG },
            CALL_LOG_PERMISSION_REQUEST
          );
          return;
        }
        dispatchDeviceCallHistory();
      });
    }

    @JavascriptInterface
    public String appVersion() {
      try {
        PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
        return info.versionName == null ? "" : info.versionName;
      } catch (Exception ignored) {
        return "";
      }
    }

    @JavascriptInterface
    public boolean isBiometricAvailable() {
      return BiometricManager.from(MainActivity.this).canAuthenticate(
        BiometricManager.Authenticators.BIOMETRIC_STRONG
      ) == BiometricManager.BIOMETRIC_SUCCESS;
    }

    @JavascriptInterface
    public void enableBiometric(String secret) {
      runOnUiThread(() -> {
        try {
          byte[] plaintext = secret.getBytes(java.nio.charset.StandardCharsets.UTF_8);
          Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
          cipher.init(Cipher.ENCRYPT_MODE, createBiometricKey());
          showBiometricPrompt("Enable biometric unlock", cipher, () -> {
            try {
              byte[] encrypted = cipher.doFinal(plaintext);
              getSharedPreferences(SECURITY_PREFERENCES, MODE_PRIVATE).edit()
                .putString("wrapped_secret", Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .putString("wrapped_iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .apply();
              java.util.Arrays.fill(plaintext, (byte) 0);
              dispatchNativeResult("biometric-enabled", true, "", "");
            } catch (Exception error) {
              dispatchNativeResult("biometric-enabled", false, "", error.getMessage());
            }
          }, "biometric-enabled");
        } catch (Exception error) {
          dispatchNativeResult("biometric-enabled", false, "", error.getMessage());
        }
      });
    }

    @JavascriptInterface
    public void authenticateBiometric() {
      runOnUiThread(() -> {
        try {
          String wrapped = getSharedPreferences(SECURITY_PREFERENCES, MODE_PRIVATE)
            .getString("wrapped_secret", null);
          String iv = getSharedPreferences(SECURITY_PREFERENCES, MODE_PRIVATE)
            .getString("wrapped_iv", null);
          if (wrapped == null || iv == null) {
            throw new IllegalStateException("Biometric unlock is not configured on this device.");
          }
          KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
          keyStore.load(null);
          SecretKey key = (SecretKey) keyStore.getKey(BIOMETRIC_KEY_ALIAS, null);
          if (key == null) throw new IllegalStateException("Enable biometric unlock again.");
          Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
          cipher.init(
            Cipher.DECRYPT_MODE,
            key,
            new GCMParameterSpec(128, Base64.decode(iv, Base64.DEFAULT))
          );
          showBiometricPrompt("Unlock Who Called?", cipher, () -> {
            try {
              byte[] raw = cipher.doFinal(Base64.decode(wrapped, Base64.DEFAULT));
              String secret = new String(raw, java.nio.charset.StandardCharsets.UTF_8);
              java.util.Arrays.fill(raw, (byte) 0);
              dispatchNativeResult("biometric-unlock", true, secret, "");
            } catch (Exception error) {
              dispatchNativeResult("biometric-unlock", false, "", error.getMessage());
            }
          }, "biometric-unlock");
        } catch (Exception error) {
          dispatchNativeResult("biometric-unlock", false, "", error.getMessage());
        }
      });
    }

    @JavascriptInterface
    public void disableBiometric() {
      try {
        getSharedPreferences(SECURITY_PREFERENCES, MODE_PRIVATE).edit().clear().apply();
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(BIOMETRIC_KEY_ALIAS)) {
          keyStore.deleteEntry(BIOMETRIC_KEY_ALIAS);
        }
      } catch (Exception ignored) { }
    }
  }

  private void showLaunchOverlay() {
    FrameLayout overlay = new FrameLayout(this);
    overlay.setBackgroundColor(Color.parseColor("#111B21"));
    overlay.setClickable(true);
    ImageView icon = new ImageView(this);
    icon.setImageResource(R.drawable.who_called_splash_logo);
    icon.setScaleType(ImageView.ScaleType.FIT_CENTER);
    FrameLayout.LayoutParams iconLayout = new FrameLayout.LayoutParams(dp(148), dp(148));
    iconLayout.gravity = Gravity.CENTER;
    overlay.addView(icon, iconLayout);
    addContentView(overlay, new ViewGroup.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.MATCH_PARENT
    ));
    launchOverlay = overlay;
    launchOverlayShownAt = System.currentTimeMillis();
  }

  private void hideLaunchOverlay() {
    View overlay = launchOverlay;
    if (overlay == null) return;
    long remaining = Math.max(0L, 900L - (System.currentTimeMillis() - launchOverlayShownAt));
    if (remaining > 0L) {
      mainHandler.postDelayed(this::hideLaunchOverlay, remaining);
      return;
    }
    launchOverlay = null;
    overlay.animate().alpha(0f).setDuration(180).withEndAction(() -> {
      if (overlay.getParent() instanceof ViewGroup) ((ViewGroup) overlay.getParent()).removeView(overlay);
      applySystemBars(darkMode);
    }).start();
  }

  private int dp(int value) {
    return Math.round(value * getResources().getDisplayMetrics().density);
  }

  private SecretKey createBiometricKey() throws Exception {
    KeyGenerator generator = KeyGenerator.getInstance(
      KeyProperties.KEY_ALGORITHM_AES,
      "AndroidKeyStore"
    );
    KeyGenParameterSpec.Builder builder = new KeyGenParameterSpec.Builder(
      BIOMETRIC_KEY_ALIAS,
      KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
    ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setUserAuthenticationRequired(true)
      .setInvalidatedByBiometricEnrollment(true);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      builder.setUserAuthenticationParameters(
        0,
        KeyProperties.AUTH_BIOMETRIC_STRONG
      );
    } else {
      builder.setUserAuthenticationValidityDurationSeconds(-1);
    }
    generator.init(builder.build());
    return generator.generateKey();
  }

  private void showBiometricPrompt(
    String title,
    Cipher cipher,
    Runnable success,
    String action
  ) {
    Executor executor = ContextCompat.getMainExecutor(this);
    BiometricPrompt prompt = new BiometricPrompt(
      this,
      executor,
      new BiometricPrompt.AuthenticationCallback() {
        @Override
        public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
          success.run();
        }

        @Override
        public void onAuthenticationError(int code, CharSequence message) {
          dispatchNativeResult(action, false, "", message.toString());
        }
      }
    );
    BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
      .setTitle(title)
      .setSubtitle("Confirm your identity on this device")
      .setNegativeButtonText("Cancel")
      .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
      .build();
    prompt.authenticate(info, new BiometricPrompt.CryptoObject(cipher));
  }

  private void dispatchNativeResult(
    String action,
    boolean success,
    String data,
    String message
  ) {
    runOnUiThread(() -> {
      String script = "window.dispatchEvent(new CustomEvent('who-called-native-result',{detail:{"
        + "action:" + JSONObject.quote(action) + ","
        + "success:" + success + ","
        + "data:" + JSONObject.quote(data == null ? "" : data) + ","
        + "message:" + JSONObject.quote(message == null ? "" : message)
        + "}}));";
      getBridge().getWebView().evaluateJavascript(script, null);
    });
  }

  private boolean isPackageAvailable(String packageName) {
    try {
      getPackageManager().getPackageInfo(packageName, 0);
      return true;
    } catch (PackageManager.NameNotFoundException ignored) {
      return false;
    }
  }

  private void dispatchDeviceCallHistory() {
    JSONArray calls = new JSONArray();
    String[] projection = new String[] {
      CallLog.Calls.NUMBER,
      CallLog.Calls.TYPE,
      CallLog.Calls.DATE,
      CallLog.Calls.DURATION,
      CallLog.Calls.CACHED_NAME
    };
    try (
      Cursor cursor = getContentResolver().query(
        CallLog.Calls.CONTENT_URI,
        projection,
        null,
        null,
        CallLog.Calls.DATE + " DESC"
      )
    ) {
      if (cursor == null) throw new IllegalStateException("Phone call history is unavailable.");
      int numberIndex = cursor.getColumnIndexOrThrow(CallLog.Calls.NUMBER);
      int typeIndex = cursor.getColumnIndexOrThrow(CallLog.Calls.TYPE);
      int dateIndex = cursor.getColumnIndexOrThrow(CallLog.Calls.DATE);
      int durationIndex = cursor.getColumnIndexOrThrow(CallLog.Calls.DURATION);
      int nameIndex = cursor.getColumnIndexOrThrow(CallLog.Calls.CACHED_NAME);
      int count = 0;
      while (cursor.moveToNext() && count < 100) {
        String number = cursor.getString(numberIndex);
        String cachedName = cursor.getString(nameIndex);
        JSONObject call = new JSONObject()
          .put("id", cursor.getLong(dateIndex) + "-" + count)
          .put("number", number == null ? "" : number)
          .put("cachedName", cachedName == null ? "" : cachedName)
          .put("type", callType(cursor.getInt(typeIndex)))
          .put("timestamp", cursor.getLong(dateIndex))
          .put("durationSeconds", cursor.getLong(durationIndex));
        calls.put(call);
        count += 1;
      }
      dispatchNativeResult("call-history", true, calls.toString(), "");
    } catch (Exception error) {
      dispatchNativeResult(
        "call-history",
        false,
        "",
        error.getMessage() == null ? "Phone call history could not be read." : error.getMessage()
      );
    }
  }

  private String callType(int value) {
    switch (value) {
      case CallLog.Calls.INCOMING_TYPE:
        return "incoming";
      case CallLog.Calls.OUTGOING_TYPE:
        return "outgoing";
      case CallLog.Calls.MISSED_TYPE:
        return "missed";
      case CallLog.Calls.REJECTED_TYPE:
        return "rejected";
      case CallLog.Calls.BLOCKED_TYPE:
        return "blocked";
      case CallLog.Calls.VOICEMAIL_TYPE:
        return "voicemail";
      default:
        return "unknown";
    }
  }

  @SuppressWarnings("deprecation")
  private void applySystemBars(boolean dark) {
    Window window = getWindow();
    int background = Color.parseColor(dark ? "#0E1713" : "#F4F7F4");
    window.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(background));
    window.getDecorView().setBackgroundColor(background);
    getBridge().getWebView().setBackgroundColor(background);
    window.setStatusBarColor(background);
    window.setNavigationBarColor(background);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.setStatusBarContrastEnforced(false);
      window.setNavigationBarContrastEnforced(false);
    }
    View decor = window.getDecorView();
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      WindowInsetsController controller = decor.getWindowInsetsController();
      if (controller != null) {
        int appearance = dark ? 0 : WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
          | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
        controller.setSystemBarsAppearance(
          appearance,
          WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
            | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
        );
      }
      return;
    }
    int flags = decor.getSystemUiVisibility();
    flags = dark ? flags & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR : flags | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      flags = dark ? flags & ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR : flags | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
    }
    decor.setSystemUiVisibility(flags);
  }

  @SuppressWarnings("deprecation")
  private void applyLaunchBarStyle() {
    Window window = getWindow();
    int background = Color.parseColor("#111B21");
    window.setStatusBarColor(background);
    window.setNavigationBarColor(background);
    View decor = window.getDecorView();
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      WindowInsetsController controller = decor.getWindowInsetsController();
      if (controller != null) {
        controller.setSystemBarsAppearance(
          0,
          WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
            | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
        );
      }
    }
  }
}
`;

await writeFile(javaPath, source, 'utf8');
console.log(
  `Applied Who Called Android splash, share-target, system-bar and notification-icon patches. Call log: ${enableCallLog ? 'enabled' : 'disabled'}.`,
);
