import { describe, it, expect } from 'vitest';
import {
  getFiscalYear,
  getFiscalQuarter,
  getQuarterStartDate,
  getQuarterEndDate,
  getQuarterLabel,
  isInFiscalQuarter,
} from '../index';

describe('getFiscalYear', () => {
  it('returns FY2027 for March 2026 (Feb-Dec forward label)', () => {
    expect(getFiscalYear(new Date(2026, 2, 11))).toBe(2027); // March 11, 2026
  });

  it('returns FY2027 for February 2026 (start of FY2027)', () => {
    expect(getFiscalYear(new Date(2026, 1, 1))).toBe(2027); // Feb 1, 2026
  });

  it('returns FY2027 for December 2026', () => {
    expect(getFiscalYear(new Date(2026, 11, 15))).toBe(2027); // Dec 15, 2026
  });

  it('returns FY2027 for January 2027 (still in FY2027)', () => {
    expect(getFiscalYear(new Date(2027, 0, 15))).toBe(2027); // Jan 15, 2027
  });

  it('returns FY2028 for February 2027 (start of FY2028)', () => {
    expect(getFiscalYear(new Date(2027, 1, 1))).toBe(2028); // Feb 1, 2027
  });

  it('returns FY2026 for January 2026', () => {
    expect(getFiscalYear(new Date(2026, 0, 31))).toBe(2026); // Jan 31, 2026
  });
});

describe('getFiscalQuarter', () => {
  it('Q1: February', () => expect(getFiscalQuarter(new Date(2026, 1, 15))).toBe(1));
  it('Q1: March', () => expect(getFiscalQuarter(new Date(2026, 2, 1))).toBe(1));
  it('Q1: April', () => expect(getFiscalQuarter(new Date(2026, 3, 30))).toBe(1));
  it('Q2: May', () => expect(getFiscalQuarter(new Date(2026, 4, 1))).toBe(2));
  it('Q2: June', () => expect(getFiscalQuarter(new Date(2026, 5, 15))).toBe(2));
  it('Q2: July', () => expect(getFiscalQuarter(new Date(2026, 6, 31))).toBe(2));
  it('Q3: August', () => expect(getFiscalQuarter(new Date(2026, 7, 1))).toBe(3));
  it('Q3: September', () => expect(getFiscalQuarter(new Date(2026, 8, 15))).toBe(3));
  it('Q3: October', () => expect(getFiscalQuarter(new Date(2026, 9, 31))).toBe(3));
  it('Q4: November', () => expect(getFiscalQuarter(new Date(2026, 10, 1))).toBe(4));
  it('Q4: December', () => expect(getFiscalQuarter(new Date(2026, 11, 25))).toBe(4));
  it('Q4: January', () => expect(getFiscalQuarter(new Date(2027, 0, 15))).toBe(4));
});

describe('getQuarterStartDate', () => {
  it('Q1 FY2027 starts Feb 1, 2026', () => {
    const d = getQuarterStartDate(2027, 1);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(1); // Feb
    expect(d.getDate()).toBe(1);
  });

  it('Q4 FY2027 starts Nov 1, 2026', () => {
    const d = getQuarterStartDate(2027, 4);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(10); // Nov
    expect(d.getDate()).toBe(1);
  });
});

describe('getQuarterEndDate', () => {
  it('Q1 FY2027 ends Apr 30, 2026', () => {
    const d = getQuarterEndDate(2027, 1);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3); // Apr
    expect(d.getDate()).toBe(30);
  });

  it('Q4 FY2027 ends Jan 31, 2027', () => {
    const d = getQuarterEndDate(2027, 4);
    expect(d.getFullYear()).toBe(2027);
    expect(d.getMonth()).toBe(0); // Jan
    expect(d.getDate()).toBe(31);
  });
});

describe('getQuarterLabel', () => {
  it('March 2026 is Q1 FY2027', () => {
    expect(getQuarterLabel(new Date(2026, 2, 11))).toBe('Q1 FY2027');
  });

  it('January 2027 is Q4 FY2027', () => {
    expect(getQuarterLabel(new Date(2027, 0, 15))).toBe('Q4 FY2027');
  });
});

describe('isInFiscalQuarter', () => {
  it('March 2026 is in Q1 FY2027', () => {
    expect(isInFiscalQuarter('2026-03-15', 2027, 1)).toBe(true);
  });

  it('January 2026 is NOT in Q1 FY2027', () => {
    expect(isInFiscalQuarter('2026-01-15', 2027, 1)).toBe(false);
  });

  it('January 2027 is in Q4 FY2027', () => {
    expect(isInFiscalQuarter('2027-01-15', 2027, 4)).toBe(true);
  });
});
