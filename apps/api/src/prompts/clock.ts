/** One line giving the model the real current date and time (it has no clock of its own). */
export function currentTimeLine(now: Date = new Date()): string {
  const fmt = (timeZone: string) =>
    new Intl.DateTimeFormat('en-GB', { timeZone, dateStyle: 'full', timeStyle: 'short' }).format(now);
  return `Current date and time: ${fmt('UTC')} UTC; ${fmt('Asia/Kolkata')} in India (IST). Use this when asked about the time or date and convert to other time zones as needed.`;
}
