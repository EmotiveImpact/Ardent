/** Pence to pounds: whole amounts without pence (£1,320), others with (£7.40). */
export const pounds = (pence: number) => {
  const whole = pence % 100 === 0;
  return `£${(pence / 100).toLocaleString('en-GB', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 })}`;
};

export const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
