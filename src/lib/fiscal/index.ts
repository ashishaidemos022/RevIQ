/**
 * TD Fiscal Year Utilities
 *
 * TD's fiscal year starts February 1st and uses forward-labeled years:
 * FY2027 = Feb 1, 2026 → Jan 31, 2027
 *
 * Quarter mapping:
 * Q1: Feb, Mar, Apr
 * Q2: May, Jun, Jul
 * Q3: Aug, Sep, Oct
 * Q4: Nov, Dec, Jan
 */

export function getFiscalYear(date: Date): number {
  const month = date.getMonth() + 1; // 1-indexed
  const year = date.getFullYear();
  if (month >= 2) return year + 1; // Feb–Dec: forward label
  return year; // January: still in prior FY
}

export function getFiscalQuarter(date: Date): number {
  const month = date.getMonth() + 1; // 1-indexed
  if (month >= 2 && month <= 4) return 1;
  if (month >= 5 && month <= 7) return 2;
  if (month >= 8 && month <= 10) return 3;
  return 4; // Nov, Dec, Jan
}

export function getFiscalYearLabel(date: Date): string {
  return `FY${getFiscalYear(date)}`;
}

export function getQuarterLabel(date: Date): string {
  return `Q${getFiscalQuarter(date)} ${getFiscalYearLabel(date)}`;
}

/**
 * Returns the start date of a given fiscal quarter.
 * Q1 FY2027 starts Feb 1, 2026.
 */
export function getQuarterStartDate(fiscalYear: number, quarter: number): Date {
  const calendarYear = fiscalYear - 1; // FY2027 starts in calendar 2026
  const monthMap: Record<number, number> = {
    1: 1, // Feb (0-indexed)
    2: 4, // May
    3: 7, // Aug
    4: 10, // Nov
  };
  const month = monthMap[quarter];
  // Q4 Nov is in calendarYear, but Jan is in calendarYear+1
  // Start of Q4 is Nov 1 of calendarYear
  return new Date(calendarYear, month, 1);
}

/**
 * Returns the end date (inclusive) of a given fiscal quarter.
 */
export function getQuarterEndDate(fiscalYear: number, quarter: number): Date {
  const calendarYear = fiscalYear - 1;
  const endMap: Record<number, { month: number; year: number }> = {
    1: { month: 3, year: calendarYear }, // Apr 30
    2: { month: 6, year: calendarYear }, // Jul 31
    3: { month: 9, year: calendarYear }, // Oct 31
    4: { month: 0, year: calendarYear + 1 }, // Jan 31
  };
  const { month, year } = endMap[quarter];
  // Last day of the month
  return new Date(year, month + 1, 0);
}

/**
 * Returns start and end dates for a full fiscal year.
 */
export function getFiscalYearRange(fiscalYear: number): { start: Date; end: Date } {
  return {
    start: getQuarterStartDate(fiscalYear, 1),
    end: getQuarterEndDate(fiscalYear, 4),
  };
}

/**
 * Returns the current fiscal quarter info.
 */
export function getCurrentFiscalPeriod(): {
  fiscalYear: number;
  fiscalQuarter: number;
  label: string;
} {
  const now = new Date();
  return {
    fiscalYear: getFiscalYear(now),
    fiscalQuarter: getFiscalQuarter(now),
    label: getQuarterLabel(now),
  };
}

/**
 * Returns 4 rolling quarters ending with the current quarter.
 */
export function getRollingQuarters(count: number = 4): Array<{
  fiscalYear: number;
  fiscalQuarter: number;
  label: string;
}> {
  const { fiscalYear, fiscalQuarter } = getCurrentFiscalPeriod();
  const quarters: Array<{ fiscalYear: number; fiscalQuarter: number; label: string }> = [];

  let fy = fiscalYear;
  let fq = fiscalQuarter;

  for (let i = 0; i < count; i++) {
    quarters.push({
      fiscalYear: fy,
      fiscalQuarter: fq,
      label: `Q${fq} FY${fy}`,
    });
    fq--;
    if (fq === 0) {
      fq = 4;
      fy--;
    }
  }

  return quarters.reverse();
}

/**
 * Returns the current quarter plus the next N quarters (forward-looking).
 */
export function getForwardQuarters(count: number = 4): Array<{
  fiscalYear: number;
  fiscalQuarter: number;
  label: string;
}> {
  const { fiscalYear, fiscalQuarter } = getCurrentFiscalPeriod();
  const quarters: Array<{ fiscalYear: number; fiscalQuarter: number; label: string }> = [];

  let fy = fiscalYear;
  let fq = fiscalQuarter;

  for (let i = 0; i < count; i++) {
    quarters.push({
      fiscalYear: fy,
      fiscalQuarter: fq,
      label: `Q${fq} FY${fy}`,
    });
    fq++;
    if (fq === 5) {
      fq = 1;
      fy++;
    }
  }

  return quarters;
}

/**
 * Formats a date string to fiscal quarter label.
 */
export function dateToQuarterLabel(dateStr: string): string {
  const date = new Date(dateStr);
  return getQuarterLabel(date);
}

/**
 * Checks if a date falls within a specific fiscal quarter.
 */
export function isInFiscalQuarter(
  dateStr: string,
  fiscalYear: number,
  fiscalQuarter: number
): boolean {
  const start = getQuarterStartDate(fiscalYear, fiscalQuarter);
  const end = getQuarterEndDate(fiscalYear, fiscalQuarter);
  const date = new Date(dateStr);
  return date >= start && date <= end;
}
