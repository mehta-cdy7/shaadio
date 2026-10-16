import QRCode from 'qrcode';

/**
 * The printable gallery QR card (PRD §9.23, SYSTEM_DESIGN §25), drawn in the browser: the server
 * stores no image. Colours come from the brand tokens (always the light brand, so prints look the
 * same in dark mode); fonts are the app's own, resolved from the page.
 */

const WIDTH = 1200;
const HEIGHT = 1600;
const QR_SIZE = 760;

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** The resolved font stack behind a utility class (next/font names are generated). */
function fontOf(className: string): string {
  const probe = document.createElement('span');
  probe.className = className;
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  document.body.appendChild(probe);
  const family = getComputedStyle(probe).fontFamily;
  probe.remove();
  return family;
}

/** Splits `text` into lines no wider than `max` at the context's current font. */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderQrCard({
  url,
  title,
  caption,
  couple,
}: {
  url: string;
  title: string;
  caption: string;
  couple: string;
}): Promise<HTMLCanvasElement> {
  const ink = token('--sh-brand-primary-deep');
  const brass = token('--sh-brand-secondary-ink');
  const paper = token('--sh-brand-canvas');
  const display = fontOf('font-display');
  const sans = fontOf('font-sans');
  await document.fonts.ready;

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // A thin brass frame.
  ctx.strokeStyle = brass;
  ctx.lineWidth = 4;
  ctx.strokeRect(40, 40, WIDTH - 80, HEIGHT - 80);

  ctx.textAlign = 'center';
  ctx.fillStyle = ink;
  ctx.font = `400 76px ${display}`;
  ctx.fillText(title, WIDTH / 2, 200);

  ctx.fillStyle = brass;
  ctx.font = `600 34px ${sans}`;
  ctx.fillText(couple.toUpperCase(), WIDTH / 2, 268);

  const code = document.createElement('canvas');
  await QRCode.toCanvas(code, url, {
    width: QR_SIZE,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: ink, light: paper },
  });
  ctx.drawImage(code, (WIDTH - QR_SIZE) / 2, 330, QR_SIZE, QR_SIZE);

  ctx.fillStyle = ink;
  ctx.font = `400 40px ${sans}`;
  wrap(ctx, caption, WIDTH - 240).forEach((line, i) => {
    ctx.fillText(line, WIDTH / 2, 1180 + i * 56);
  });

  ctx.fillStyle = brass;
  ctx.font = `400 28px ${sans}`;
  ctx.fillText(url.replace(/^https?:\/\//, ''), WIDTH / 2, HEIGHT - 110);
  return canvas;
}
