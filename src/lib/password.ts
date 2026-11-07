/** A rough strength estimate for the meter. The server enforces the real rules (12+ characters, not a common password). */
export function scorePassword(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!pw) return { score: 0, label: '' };
  if (pw.length < 12) return { score: 1, label: `${12 - pw.length} more character${pw.length === 11 ? '' : 's'} needed` };
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(pw)).length;
  const words = pw.trim().split(/\s+/).length;
  if (/^(.)\1+$/.test(pw) || /^(?:0123456789|1234567890|qwerty|password)/i.test(pw)) return { score: 1, label: 'Too easy to guess' };
  if (pw.length >= 20 || (words >= 4 && pw.length >= 16)) return { score: 4, label: 'Strong' };
  if (pw.length >= 16 || kinds >= 3) return { score: 3, label: 'Good' };
  return { score: 2, label: 'OK. Longer is stronger: try a few unrelated words.' };
}
