// ── highlight.js theme CSS (vendored locally) ──
let hljsCssLoaded = false;
export function ensureHljsCss() {
  if (hljsCssLoaded || typeof document === "undefined") return;
  const mk = (href: string, theme: "light" | "dark"): HTMLLinkElement => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute("data-hljs-theme", theme);
    document.head.appendChild(link);
    return link;
  };
  const light = mk("/vendor/hljs/atom-one-light.css", "light");
  const dark = mk("/vendor/hljs/atom-one-dark.css", "dark");
  const sync = () => {
    const d = document.documentElement.getAttribute("data-theme") === "dark";
    light.disabled = d;
    dark.disabled = !d;
  };
  sync();
  const observer = new MutationObserver(sync);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  hljsCssLoaded = true;
}
