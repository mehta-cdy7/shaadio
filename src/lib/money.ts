const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/** Integer paise as rupees with Indian grouping and no decimals: 124500000 → "₹12,45,000". */
export function formatPaise(paise: number): string {
  return inr.format(Math.round(paise / 100));
}
