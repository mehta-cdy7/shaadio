'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { renderQrCard } from '@/components/photos/qr-card';
import { Alert } from '@/components/ui/alert';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChatIcon, CheckCircleIcon, CopyIcon, DownloadIcon, QrIcon } from '@/components/ui/icons';
import { useApiErrorMessage } from '@/components/ui/use-api-error';
import { patchJson } from '@/lib/api';
import { cn } from '@/lib/cn';
import { whatsAppUrl } from '@/lib/whatsapp';
import type { GallerySettings } from '@/modules/gallery/schemas';

type Switch = 'guestViewEnabled' | 'guestUploadEnabled';

/**
 * Sharing the gallery (PRD §9.20, §9.23; Stitch "Share gallery"): the stable link, WhatsApp, the
 * QR card as PNG or print, and the two guest switches. Misuse is handled by the switches, never by
 * changing the link (SYSTEM_DESIGN §25), so printed cards keep working.
 */
export function ShareGalleryCard({
  settings: initial,
  couple,
}: {
  settings: GallerySettings;
  couple: readonly [string, string];
}) {
  const t = useTranslations('members.photos.share');
  const errorMessage = useApiErrorMessage();
  const [settings, setSettings] = useState(initial);
  const [pending, setPending] = useState<Switch>();
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState<'yes' | 'failed'>();
  const [qr, setQr] = useState<string>();
  const [qrFailed, setQrFailed] = useState(false);

  const names = `${couple[0]} & ${couple[1]}`;
  const cardText = {
    url: settings.galleryUrl,
    title: t('qr.title'),
    caption: t('qr.caption', { couple: names }),
    couple: names,
  };

  async function toggle(key: Switch) {
    setPending(key);
    setError(undefined);
    const result = await patchJson<GallerySettings>('/api/gallery/settings', {
      [key]: !settings[key],
    });
    setPending(undefined);
    if (result.ok) setSettings(result.data);
    else setError(errorMessage(result));
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(settings.galleryUrl);
      setCopied('yes');
    } catch {
      setCopied('failed');
    }
  }

  async function showQr() {
    setQrFailed(false);
    try {
      setQr((await renderQrCard(cardText)).toDataURL('image/png'));
    } catch {
      setQrFailed(true);
    }
  }

  function downloadQr() {
    if (!qr) return;
    const link = document.createElement('a');
    link.href = qr;
    link.download = 'wedding-gallery-qr.png';
    link.click();
  }

  function printQr() {
    if (!qr) return;
    const win = window.open('', '_blank');
    if (!win) return;
    const doc = win.document;
    doc.title = t('qr.title');
    const style = doc.createElement('style');
    style.textContent =
      '@page{margin:12mm}html,body{margin:0;height:100%}body{display:flex;align-items:center;justify-content:center}img{max-width:100%;max-height:100%}';
    doc.head.appendChild(style);
    const img = doc.createElement('img');
    img.alt = '';
    img.onload = () => {
      win.focus();
      win.print();
    };
    img.src = qr;
    doc.body.appendChild(img);
  }

  const message = t('message', { couple: names, url: settings.galleryUrl });

  return (
    <Card className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-headline-sm text-ink">{t('title')}</h2>
        <p className="mt-1 text-body text-ink-muted">{t('lead')}</p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="gallery-url" className="text-body font-medium text-ink">
          {t('linkLabel')}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="gallery-url"
            readOnly
            value={settings.galleryUrl}
            onFocus={(event) => event.target.select()}
            className="h-11 min-w-0 flex-1 rounded-control border border-line bg-canvas-muted px-3.5 text-body text-ink"
          />
          <Button variant="outline" onClick={copy}>
            <CopyIcon width={16} height={16} />
            {t('copy')}
          </Button>
        </div>
        <p role="status" className="min-h-5 text-label">
          {copied === 'yes' && (
            <span className="inline-flex items-center gap-1.5 font-medium text-success">
              <CheckCircleIcon width={14} height={14} />
              {t('copied')}
            </span>
          )}
          {copied === 'failed' && <span className="text-danger">{t('copyFailed')}</span>}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <a
            href={whatsAppUrl(undefined, message)}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses()}
          >
            <ChatIcon width={18} height={18} />
            {t('whatsapp')}
          </a>
          <Button variant="outline" onClick={showQr}>
            <QrIcon width={18} height={18} />
            {t('showQr')}
          </Button>
        </div>
      </div>

      {qrFailed && <Alert>{t('qr.failed')}</Alert>}
      {qr && (
        <div className="flex flex-col items-center gap-3 rounded-card bg-canvas-muted p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt={t('qr.alt', { couple: names })}
            className="w-full max-w-64 rounded-control shadow-card"
          />
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={downloadQr}>
              <DownloadIcon width={18} height={18} />
              {t('qr.download')}
            </Button>
            <Button variant="outline" onClick={printQr}>
              {t('qr.print')}
            </Button>
          </div>
          <p className="text-center text-label text-ink-muted">{t('qr.stable')}</p>
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-line pt-5">
        <h3 className="text-title font-semibold text-ink">{t('accessTitle')}</h3>
        {(['guestViewEnabled', 'guestUploadEnabled'] as const).map((key) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <div>
              <p className="text-body font-medium text-ink">{t(`${key}.label`)}</p>
              <p className="text-label text-ink-muted">{t(`${key}.hint`)}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings[key]}
              aria-label={t(`${key}.label`)}
              onClick={() => toggle(key)}
              disabled={pending !== undefined}
              className={cn(
                'relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60',
                settings[key] ? 'bg-primary' : 'bg-fill',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'absolute top-1 size-5 rounded-full bg-surface shadow-card transition-[left]',
                  settings[key] ? 'left-6' : 'left-1',
                )}
              />
            </button>
          </div>
        ))}
        {error && <Alert>{error}</Alert>}
      </div>
    </Card>
  );
}
