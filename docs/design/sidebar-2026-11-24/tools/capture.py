"""Capture each direction in the same scripted scenario, for the judges and the morning packet.

Runs installed Google Chrome through Playwright (Chromium, not IINA's WebKit: colours and blur may differ).
For each folder: the panel at 360 and 300, the three hash states, typing a search, a keyboard switch, and
(direction S) the switcher over the video. Writes PNGs and metrics.json into <out>/<folder>/.
Usage: python3 -I capture.py <sidebar-2026-11-24 folder> <out folder> [folders...]
"""
import json, sys, pathlib
from playwright.sync_api import sync_playwright

root, out = pathlib.Path(sys.argv[1]).resolve(), pathlib.Path(sys.argv[2]).resolve()
folders = sys.argv[3:] or ["p", "q", "r", "s", "t"]

METRICS_JS = """() => {
  const d = document, w = d.defaultView;
  const visible = el => { const r = el.getBoundingClientRect(), s = w.getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && r.bottom > 0 && r.top < w.innerHeight; };
  const strings = [];
  const walk = d.createTreeWalker(d.body, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) { const t = walk.currentNode.textContent.trim(); const el = walk.currentNode.parentElement;
    if (t && el && visible(el)) strings.push(t); }
  const placeholders = [...d.querySelectorAll('input[placeholder]')].filter(visible).map(i => i.placeholder);
  return { strings, placeholders, distinct: [...new Set(strings)].length,
           overflowX: d.documentElement.scrollWidth > w.innerWidth + 1,
           images: [...d.images].filter(visible).length };
}"""

def panel(page):
    return page.frame_locator("#panel")

def frame_of(page, name):
    return next(f for f in page.frames if f.name == name or (f.url.endswith(name + ".html")))

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="chrome")
    for name in folders:
        index = root / name / "index.html"
        if not index.exists():
            print("missing", index); continue
        o = out / name; o.mkdir(parents=True, exist_ok=True)
        metrics = {}
        page = browser.new_page(viewport={"width": 1240, "height": 820}, device_scale_factor=2)
        page.goto(index.as_uri()); page.wait_for_timeout(900)
        pf = frame_of(page, "panel")
        for width in ("360", "300"):
            page.click(f'#w button[data-w="{width}"]'); page.wait_for_timeout(400)
            page.screenshot(path=str(o / f"open-{width}.png"))
            metrics[f"open-{width}"] = pf.evaluate(METRICS_JS)
        page.click('#w button[data-w="360"]')
        for state in ("signed-out", "new", "many"):
            pf.evaluate(f"location.hash = '#{state}'"); page.wait_for_timeout(500)
            page.screenshot(path=str(o / f"state-{state}.png"))
            metrics[f"state-{state}"] = pf.evaluate(METRICS_JS)
        pf.evaluate("location.hash = ''"); page.wait_for_timeout(400)
        search = pf.locator('input[type="search"], input[type="text"]').first
        if search.count() and search.is_visible():
            search.click(); search.type("lu", delay=60); page.wait_for_timeout(400)
            page.screenshot(path=str(o / "search-lu.png"))
            metrics["search-lu"] = pf.evaluate(METRICS_JS)
            search.press("Escape"); page.wait_for_timeout(200)
        before = page.inner_text("#title")
        pf.locator("body").press("ArrowDown"); pf.locator("body").press("ArrowDown"); page.wait_for_timeout(150)
        page.screenshot(path=str(o / "keyboard-selected.png"))
        pf.locator("body").press("Enter"); page.wait_for_timeout(900)
        page.screenshot(path=str(o / "keyboard-after-return.png"))
        metrics["keyboard"] = {"title_before": before, "title_after": page.inner_text("#title"),
                               "panel_closed": "closed" in (page.get_attribute("#sidebar", "class") or "")}
        if (root / name / "overlay.html").exists():
            page.goto(index.as_uri()); page.wait_for_timeout(800)
            page.locator("#video").click(); page.keyboard.press("Tab"); page.wait_for_timeout(500)
            page.screenshot(path=str(o / "switcher.png"))
            page.keyboard.press("Enter"); page.wait_for_timeout(900)
            metrics["switcher"] = {"title_after_tab_return": page.inner_text("#title")}
        (o / "metrics.json").write_text(json.dumps(metrics, indent=1, ensure_ascii=False))
        page.close(); print("captured", name)
    browser.close()
