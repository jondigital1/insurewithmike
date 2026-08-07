/**
 * Shared visual identity, per ASK-MIKE-IDENTITY.md.
 *
 * Both the client form and the agent recommendation are generated, and both
 * pull their tokens and their logo from here, so the two sides cannot drift
 * into looking like different products.
 */

export const TOKENS = `
  :root {
    --am-ink:        #14304A;
    --am-ink-soft:   #4A6076;
    --am-muted:      #7C8FA3;

    --am-blue-800:   #083F66;
    --am-blue-700:   #0B5E96;
    --am-blue-600:   #0F7CC0;
    --am-blue-300:   #7FBCE4;
    --am-blue-100:   #E3F0F9;
    --am-blue-50:    #F2F8FC;

    --am-amber-600:  #C67E32;
    --am-amber-500:  #E8973F;
    --am-amber-400:  #F2A65A;
    --am-amber-100:  #FBEEDD;
    --am-amber-text: #8A5A1E;

    --am-green:      #2E8B72;
    --am-green-100:  #E4F1EC;
    --am-alert:      #B4472E;
    --am-alert-100:  #F8E9E5;

    --am-paper:      #FCFBF8;
    --am-white:      #FFFFFF;
    --am-line:       #E0E8EF;
    --am-line-soft:  #F0F4F8;

    --display: "Instrument Serif", Georgia, serif;
    --sans: "Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
    --measure: 620px;
    --r-control: 12px;
    --r-card: 18px;
    --r-panel: 24px;
  }`;

export const FONT_LINKS = `<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400;0,500;0,600;1,400&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet" />`;

/** The Reply. Wide soft speech bubble, amber dot. Never outlined, never shadowed. */
export const mark = (size: number, fill = "#0F7CC0"): string =>
  `<svg class="mark" width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" aria-hidden="true">` +
  `<path d="M6 17a11 11 0 0 1 11-11h14a11 11 0 0 1 11 11v7a11 11 0 0 1-11 11h-8l-9 6.5V35A11 11 0 0 1 6 24z" fill="${fill}"/>` +
  `<circle cx="24" cy="20.5" r="5.5" fill="#F2A65A"/></svg>`;

/** Fatter variant for small sizes, where the tail and corner radii collapse. */
export const markSmall = (size: number, fill: string): string =>
  `<svg width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" aria-hidden="true">` +
  `<path d="M5 16.5a11.5 11.5 0 0 1 11.5-11.5h15A11.5 11.5 0 0 1 43 16.5v8A11.5 11.5 0 0 1 31.5 36h-8l-9 7v-7.3A11.5 11.5 0 0 1 5 24.5z" fill="${fill}"/>` +
  `<circle cx="24" cy="20.5" r="6" fill="#FBEEDD"/></svg>`;

export const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="10" fill="#FCFBF8"/><path d="M5 16.5a11.5 11.5 0 0 1 11.5-11.5h15A11.5 11.5 0 0 1 43 16.5v8A11.5 11.5 0 0 1 31.5 36h-8l-9 7v-7.3A11.5 11.5 0 0 1 5 24.5z" fill="#0F7CC0"/><circle cx="24" cy="20.5" r="6" fill="#F2A65A"/></svg>`,
  );

export const lockup = (size = 32): string =>
  `<span class="lockup">${mark(size)}<span class="word">Ask Mike</span></span>`;
