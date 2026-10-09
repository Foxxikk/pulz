// Společná kontrola PINu (PIN je jen na serveru; výchozí 4321, lze změnit proměnnou PULZ_PIN)
export const PIN = process.env.PULZ_PIN || '4321';
export function pinOk(v) {
  return typeof v === 'string' && v.length === PIN.length && v === PIN;
}
export function deny(res) {
  res.status(401).json({ error: 'Špatný PIN' });
}
