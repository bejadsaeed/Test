import sys, pathlib, re
from playwright.sync_api import sync_playwright
from PIL import Image
R = pathlib.Path(sys.argv[1]); svg = (R/"src/icon.svg").read_text()
fg = re.sub(r'<rect id="bgr"[^>]*/>', '', svg).replace('<g id="fg">', '<g id="fg" transform="translate(256 256) scale(.62) translate(-256 -256)">')
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width":1024,"height":1024})
    for name, s in (("full", svg), ("fg", fg)):
        pg.set_content('<body style="margin:0;background:transparent">'+s.replace('<svg ','<svg width="1024" height="1024" '))
        pg.screenshot(path=str(R/f"src/icons/{name}.png"), omit_background=True)
    b.close()
full = Image.open(R/"src/icons/full.png")
for n in (192, 512): full.resize((n,n), Image.LANCZOS).save(R/f"src/icons/icon-{n}.png")
