#!/usr/bin/env bash
# Builds the signed APK without Gradle. Needs: JDK, and in $SDK: aapt2, android.jar (API 34), d8.jar + d8lib/*.jar (its deps), signer.jar (uber-apk-signer).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"; SDK="${SDK:-$ROOT/../tools/sdk}"
APP="$ROOT/android/app/src/main"; OUT="$ROOT/dist/apk"; W="$OUT/work"
PKG=com.bgz.yatelha2; VCODE=2; VNAME=1.1.0
KS="$ROOT/android/keystore/yatelha2.jks"; KPASS="${YTM_STORE_PASS:-yatelha2}"
unset JAVA_TOOL_OPTIONS
python3 "$ROOT/build.py"
cp "$ROOT/dist/single/index.html" "$APP/assets/index.html"
rm -rf "$OUT"; mkdir -p "$W/classes" "$W/dex"
[ -f "$KS" ] || keytool -genkeypair -keystore "$KS" -storetype JKS -alias yatelha2 -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "$KPASS" -keypass "$KPASS" -dname "CN=Ya Telha2 Ya Matelha2sh, O=BGZ, C=EG"
sed "s|<manifest |<manifest package=\"$PKG\" |" "$APP/AndroidManifest.xml" > "$W/AndroidManifest.xml"
"$SDK/aapt2" compile --dir "$APP/res" -o "$W/res.zip"
"$SDK/aapt2" link -o "$W/base.apk" -I "$SDK/android.jar" --manifest "$W/AndroidManifest.xml" -A "$APP/assets" \
  --min-sdk-version 23 --target-sdk-version 34 --version-code $VCODE --version-name $VNAME "$W/res.zip"
javac --release 8 -Xlint:-options -cp "$SDK/android.jar" -d "$W/classes" $(find "$APP/java" -name '*.java')
java -cp "$SDK/d8.jar:$SDK/d8lib/*" com.android.tools.r8.D8 --release --min-api 23 --lib "$SDK/android.jar" --output "$W/dex" $(find "$W/classes" -name '*.class')
# normalise the dex header (SHA-1 signature + Adler-32 checksum) so strict tools accept it
python3 - "$W/dex/classes.dex" <<'PY'
import sys, hashlib, zlib, struct
p = sys.argv[1]; d = bytearray(open(p, "rb").read())
d[12:32] = hashlib.sha1(bytes(d[32:])).digest()
d[8:12] = struct.pack("<I", zlib.adler32(bytes(d[12:])) & 0xffffffff)
open(p, "wb").write(d)
PY
(cd "$W/dex" && zip -q -j "$W/base.apk" classes.dex)
java -jar "$SDK/signer.jar" -a "$W/base.apk" --ks "$KS" --ksAlias yatelha2 --ksPass "$KPASS" --ksKeyPass "$KPASS" -o "$W/signed" --allowResign
cp "$W"/signed/*.apk "$OUT/yatelha2.apk"
"$SDK/aapt2" dump badging "$OUT/yatelha2.apk" | head -12
ls -la "$OUT/yatelha2.apk"
