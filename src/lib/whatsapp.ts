/**
 * The WhatsApp share link (API_DESIGN §16), built in the browser: `wa.me/<digits>?text=…` opens
 * the guest's chat, `wa.me/?text=…` lets the family pick the chat when there is no phone.
 */
export function whatsAppUrl(phone: string | undefined, text: string): string {
  const digits = phone?.replace(/\D/g, '') ?? '';
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
