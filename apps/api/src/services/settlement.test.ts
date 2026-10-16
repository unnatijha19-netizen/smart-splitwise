import { describe, expect, it } from 'vitest';
import { simplifyDebts } from './settlement.js';

describe('simplifyDebts', () => {
  it('settles a debtor against a creditor', () => {
    expect(simplifyDebts([
      { memberId: 'a', name: 'A', balancePaise: -50000 },
      { memberId: 'b', name: 'B', balancePaise: 50000 },
    ])).toEqual([{ fromId: 'a', from: 'A', toId: 'b', to: 'B', amountPaise: 50000 }]);
  });

  it('returns no transfers for a balanced group', () => {
    expect(simplifyDebts([
      { memberId: 'a', name: 'A', balancePaise: 0 },
      { memberId: 'b', name: 'B', balancePaise: 0 },
    ])).toEqual([]);
  });

  it('splits a debt across two creditors', () => {
    const result = simplifyDebts([
      { memberId: 'a', name: 'A', balancePaise: -10000 },
      { memberId: 'b', name: 'B', balancePaise: 6000 },
      { memberId: 'c', name: 'C', balancePaise: 4000 },
    ]);
    expect(result.reduce((sum, t) => sum + t.amountPaise, 0)).toBe(10000);
    expect(result.every(t => t.amountPaise > 0)).toBe(true);
  });
});
