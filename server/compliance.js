// Real-money compliance seam. PURE gate + a payments interface stub (no processor integrated yet).
// Real money stays OFF unless ENABLE_REAL_MONEY=1 AND every per-user check passes.

export function realMoneyConfigFromEnv(env = process.env) {
  const enabled = env.ENABLE_REAL_MONEY === '1' || env.ENABLE_REAL_MONEY === 'true';
  const allowedCountries = String(env.REAL_MONEY_COUNTRIES || '')
    .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  return { enabled, allowedCountries };
}

// user: row from `users` ({kyc_status, age_verified, country, banned}) or camelCase equivalent.
export function canUseRealMoney(user, { enabled = false, allowedCountries = [] } = {}) {
  const reasons = [];
  if (!enabled) reasons.push('real_money_disabled');
  if (!user) { reasons.push('no_user'); return { ok: false, reasons }; }
  const kyc = user.kyc_status ?? user.kycStatus;
  const age = user.age_verified ?? user.ageVerified;
  const country = String(user.country || '').toUpperCase();
  if (kyc !== 'verified') reasons.push('kyc_not_verified');
  if (!Number(age)) reasons.push('age_not_verified');
  if (!country || !allowedCountries.map(c => String(c).toUpperCase()).includes(country)) reasons.push('country_not_allowed');
  if (Number(user.banned)) reasons.push('banned');
  return { ok: reasons.length === 0, reasons };
}

// Payment processor seam (e.g. Paystack/Flutterwave for NGN, Stripe for USD). Deliberately unimplemented:
// a real adapter must credit the ledger only from a verified server-side webhook, with idemKey = provider ref.
export class PaymentsNotConfigured extends Error {
  constructor() { super('payments not configured'); this.code = 'payments_not_configured'; }
}
export const payments = {
  configured: false,
  async deposit(/* { userId, currency, amountMinor, providerRef } */) { throw new PaymentsNotConfigured(); },
  async withdraw(/* { userId, currency, amountMinor, destination } */) { throw new PaymentsNotConfigured(); }
};
