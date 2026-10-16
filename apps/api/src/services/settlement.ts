export type Balance = { memberId: string; name: string; balancePaise: number };
export type Transfer = { fromId: string; from: string; toId: string; to: string; amountPaise: number };

export function simplifyDebts(balances: Balance[]): Transfer[] {
  const debtors = balances
    .filter((b) => b.balancePaise < 0)
    .map((b) => ({ ...b, remaining: -b.balancePaise }))
    .sort((a, b) => b.remaining - a.remaining);
  const creditors = balances
    .filter((b) => b.balancePaise > 0)
    .map((b) => ({ ...b, remaining: b.balancePaise }))
    .sort((a, b) => b.remaining - a.remaining);

  const transfers: Transfer[] = [];
  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const amountPaise = Math.min(debtors[d].remaining, creditors[c].remaining);
    if (amountPaise > 0) {
      transfers.push({
        fromId: debtors[d].memberId,
        from: debtors[d].name,
        toId: creditors[c].memberId,
        to: creditors[c].name,
        amountPaise,
      });
      debtors[d].remaining -= amountPaise;
      creditors[c].remaining -= amountPaise;
    }
    if (debtors[d].remaining === 0) d++;
    if (creditors[c].remaining === 0) c++;
  }
  return transfers;
}
