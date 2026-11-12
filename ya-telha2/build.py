#!/usr/bin/env python3
"""Builds dist/web (PWA) and dist/single (one self-contained index.html for the APK / preview)."""
import base64, pathlib, shutil, hashlib, sys
R = pathlib.Path(__file__).parent
SRC, DIST = R / "src", R / "dist"
def b64(p): return base64.b64encode(p.read_bytes()).decode()
def face(fam, f, weight, rng):
    return "@font-face{font-family:'%s';font-style:normal;font-weight:%s;font-display:block;src:url(data:font/woff2;base64,%s) format('woff2');unicode-range:%s}" % (fam, weight, b64(SRC / "fonts" / f), rng)
AR = "U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0898-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC"
LA = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
fonts = "".join([
    face("Baloo Bhaijaan 2", "baloo-bhaijaan-2-arabic-wght-normal.woff2", "400 800", AR),
    face("Baloo Bhaijaan 2", "baloo-bhaijaan-2-latin-wght-normal.woff2", "400 800", LA),
    face("Lalezar", "lalezar-arabic-400-normal.woff2", "400", AR),
    face("Lalezar", "lalezar-latin-400-normal.woff2", "400", LA)])
t = (SRC / "index.html").read_text(encoding="utf8")
def make(head):
    return (t.replace("<!--HEAD-->", head).replace("/*FONTS*/", fonts)
             .replace("/*CSS*/", (SRC / "styles.css").read_text(encoding="utf8"))
             .replace("/*QUESTIONS*/", (SRC / "questions.js").read_text(encoding="utf8"))
             .replace("/*APP*/", (SRC / "app.js").read_text(encoding="utf8")))
shutil.rmtree(DIST, ignore_errors=True)
(DIST / "web").mkdir(parents=True); (DIST / "single").mkdir()
web = make('<link rel="manifest" href="manifest.webmanifest"><link rel="icon" href="icon-192.png"><link rel="apple-touch-icon" href="icon-192.png"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">')
(DIST / "web" / "index.html").write_text(web, encoding="utf8")
(DIST / "single" / "index.html").write_text(make(""), encoding="utf8")
ver = hashlib.sha1(web.encode()).hexdigest()[:10]
(DIST / "web" / "sw.js").write_text((SRC / "sw.js").read_text().replace("__VER__", ver))
shutil.copy(SRC / "manifest.webmanifest", DIST / "web")
for n in ("icon-192.png", "icon-512.png"):
    if (SRC / "icons" / n).exists(): shutil.copy(SRC / "icons" / n, DIST / "web")
print("built", ver, (DIST / "single" / "index.html").stat().st_size, "bytes")
