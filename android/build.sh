#!/bin/bash
# Builds android/MilkBilling.apk with the Android SDK tools only (no Gradle). Run from Git Bash: bash android/build.sh
set -e
cd "$(dirname "$0")"
SDK="${ANDROID_HOME:-$LOCALAPPDATA/Android/Sdk}"
BT="$SDK/build-tools/35.0.0"
JAR="$SDK/platforms/android-34/android.jar"
# JDK 11+ (d8 needs it): Android Studio's jbr, else BUILD_JDK, else the newest ~/.jdks entry
JDK="/c/Program Files/Android/Android Studio/jbr"
[ -x "$JDK/bin/javac.exe" ] || JDK="${BUILD_JDK:-$(ls -d "$HOME"/.jdks/* 2>/dev/null | sort | tail -1)}"
JBIN="$JDK/bin"
export JAVA_HOME="$JDK"
export PATH="$JBIN:$PATH"
rm -rf out && mkdir -p out/res out/gen out/classes out/dex
# icon: a simple drop
"$BT/aapt2.exe" compile --dir res -o out/res/res.zip
"$BT/aapt2.exe" link -o out/base.apk -I "$JAR" --manifest AndroidManifest.xml --java out/gen --min-sdk-version 23 --target-sdk-version 33 out/res/res.zip
"$JBIN/javac.exe" -nowarn -source 8 -target 8 -bootclasspath "$JAR" -d out/classes -sourcepath src:out/gen \
  src/com/shivamrut/milkbilling/*.java out/gen/com/shivamrut/milkbilling/R.java 2>&1 | grep -v "^Note\|bootstrap\|warning" || true
"$BT/d8.bat" --release --lib "$JAR" --min-api 23 --output out/dex out/classes/com/shivamrut/milkbilling/*.class
cp out/base.apk out/app.apk
python - <<'PY' 2>/dev/null || "$JBIN/jar.exe" uMf out/app.apk -C out/dex classes.dex
import zipfile
z=zipfile.ZipFile('out/app.apk','a',zipfile.ZIP_DEFLATED); z.write('out/dex/classes.dex','classes.dex'); z.close()
PY
"$BT/zipalign.exe" -f 4 out/app.apk out/aligned.apk
# signing key: keep this file; updates of the app need the same key
[ -f milkbilling.keystore ] || "$JBIN/keytool.exe" -genkeypair -keystore milkbilling.keystore -storepass milkbilling -keypass milkbilling -alias milk -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Milk Billing"
"$BT/apksigner.bat" sign --ks milkbilling.keystore --ks-pass pass:milkbilling --key-pass pass:milkbilling --out MilkBilling.apk out/aligned.apk
ls -la MilkBilling.apk
