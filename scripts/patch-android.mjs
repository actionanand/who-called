import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const capacitorConfigPath = resolve('android/app/src/main/assets/capacitor.config.json');
const capacitorConfig = JSON.parse(await readFile(capacitorConfigPath, 'utf8'));
const appId = capacitorConfig.appId;

if (typeof appId !== 'string' || !appId.trim()) {
  throw new Error(`Android appId is missing from ${capacitorConfigPath}.`);
}

const javaPath = resolve('android/app/src/main/java', ...appId.split('.'), 'MainActivity.java');
const manifestPath = resolve('android/app/src/main/AndroidManifest.xml');
const resPath = resolve('android/app/src/main/res');
const stylesPath = resolve(resPath, 'values/styles.xml');
const nightStylesPath = resolve(resPath, 'values-night/styles.xml');
const notificationIconPath = resolve(resPath, 'drawable/ic_stat_who_called.xml');
const splashSourcePath = resolve('public/who-called.png');
const splashLogoPath = resolve(resPath, 'drawable-nodpi/who_called_splash_logo.png');
const splashIconPath = resolve(resPath, 'drawable/who_called_splash_icon.xml');
const splashPath = resolve(resPath, 'drawable/splash.xml');
const enableCallLog = process.env.ENABLE_DEVICE_CALL_LOG === 'true';

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
    <item android:drawable="#111B21" />
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

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsetsController;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.webkit.JavascriptInterface;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
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
    applyLaunchBarStyle();
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    captureSharedText(intent);
  }

  @Override
  public void onResume() {
    super.onResume();
    if (launchOverlay == null) applySystemBars(darkMode);
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
    public void openWhatsApp(String number, String message) {
      runOnUiThread(() -> {
        String url = "https://wa.me/" + number + (message.isEmpty() ? "" : "?text=" + Uri.encode(message));
        String[] packages = { "com.whatsapp", "com.whatsapp.w4b" };
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
    public void copyText(String value) {
      ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
      clipboard.setPrimaryClip(ClipData.newPlainText("Who Called", value));
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

  @SuppressWarnings("deprecation")
  private void applySystemBars(boolean dark) {
    Window window = getWindow();
    int background = Color.parseColor(dark ? "#0E1713" : "#F4F7F4");
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
