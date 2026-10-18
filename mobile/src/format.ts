export const pounds = (pence: number) =>
  `£${(pence / 100).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;

export const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
