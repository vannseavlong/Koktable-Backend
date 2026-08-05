export function daysBetween(start: string, end: string): number {
  const diff = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function withTotals(reservation: Record<string, unknown>) {
  const nights = daysBetween(reservation.start_date as string, reservation.end_date as string);
  return { ...reservation, nights, total: Number(reservation.daily_rate) * nights };
}
