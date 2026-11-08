#!/bin/bash
# Builds android/MilkBilling.apk with the Android SDK tools only (no Gradle).
# Windows: run from Git Bash: bash android/build.sh.  Linux (GitHub Actions): same command, needs ANDROID_HOME and JAVA_HOME.
set -e
cd "$(dirname "$0")"
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) EXE=.exe; BAT=.bat ;; *) EXE=; BAT= ;; esac
SDK="${ANDROID_HOME:-$LOCALAPPDATA/Android/Sdk}"
BT="$SDK/build-tools/35.0.0"
JAR="$SDK/platforms/android-34/android.jar"
# JDK 11+ (d8 needs it): Android Studio's jbr, else BUILD_JDK, else the newest ~/.jdks entry, else JAVA_HOME
JDK="/c/Program Files/Android/Android Studio/jbr"
[ -x "$JDK/bin/javac$EXE" ] || JDK="${BUILD_JDK:-$(ls -d "$HOME"/.jdks/* 2>/dev/null | sort | tail -1)}"
[ -x "$JDK/bin/javac$EXE" ] || JDK="$JAVA_HOME"
JBIN="$JDK/bin"
export JAVA_HOME="$JDK"
export PATH="$JBIN:$PATH"
rm -rf out && mkdir -p out/res out/gen out/classes out/dex out/assets
# the web pages go inside the app (assets/www); the APK copy kept in frontend for phones to download is left out
cp -r ../frontend out/assets/www && rm -f out/assets/www/*.apk
# icon: a simple drop
"$BT/aapt2$EXE" compile --dir res -o out/res/res.zip
"$BT/aapt2$EXE" link -o out/base.apk -I "$JAR" --manifest AndroidManifest.xml -A out/assets --java out/gen --min-sdk-version 23 --target-sdk-version 33 out/res/res.zip
"$JBIN/javac$EXE" -nowarn -source 8 -target 8 -bootclasspath "$JAR" -d out/classes -sourcepath src:out/gen \
  src/com/shivamrut/milkbilling/*.java out/gen/com/shivamrut/milkbilling/R.java 2>&1 | grep -v "^Note\|bootstrap\|warning" || true
"$BT/d8$BAT" --release --lib "$JAR" --min-api 23 --output out/dex out/classes/com/shivamrut/milkbilling/*.class
cp out/base.apk out/app.apk
"$JBIN/jar$EXE" uMf out/app.apk -C out/dex classes.dex
"$BT/zipalign$EXE" -f 4 out/app.apk out/aligned.apk
# signing key: keep this file; updates of the app need the same key
[ -f milkbilling.keystore ] || "$JBIN/keytool$EXE" -genkeypair -keystore milkbilling.keystore -storepass milkbilling -keypass milkbilling -alias milk -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Milk Billing"
"$BT/apksigner$BAT" sign --ks milkbilling.keystore --ks-pass pass:milkbilling --key-pass pass:milkbilling --out MilkBilling.apk out/aligned.apk
ls -la MilkBilling.apk
