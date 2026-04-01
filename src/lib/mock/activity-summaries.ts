import { ActivityDailySummary } from '@/types/database';

// ---------------------------------------------------------------------------
// Activity daily summaries — last 90 days per AE
// Realistic call/email/linkedin/meeting mix
// ---------------------------------------------------------------------------

const AE_ACTIVITY_PROFILES: Array<{
  userId: string;
  sfId: string;
  name: string;
  callsPerWeek: number;
  emailsPerWeek: number;
  linkedinPerWeek: number;
  meetingsPerWeek: number;
}> = [
  { userId: 'demo-usr-008', sfId: 'sf-usr-008', name: 'Ashley Park',     callsPerWeek: 12, emailsPerWeek: 25, linkedinPerWeek: 8, meetingsPerWeek: 6 },
  { userId: 'demo-usr-009', sfId: 'sf-usr-009', name: 'Ryan Patel',       callsPerWeek: 15, emailsPerWeek: 30, linkedinPerWeek: 10, meetingsPerWeek: 8 },
  { userId: 'demo-usr-010', sfId: 'sf-usr-010', name: 'Jennifer Liu',     callsPerWeek: 10, emailsPerWeek: 20, linkedinPerWeek: 6, meetingsPerWeek: 4 },
  { userId: 'demo-usr-011', sfId: 'sf-usr-011', name: 'Marcus Johnson',   callsPerWeek: 14, emailsPerWeek: 28, linkedinPerWeek: 9, meetingsPerWeek: 7 },
  { userId: 'demo-usr-012', sfId: 'sf-usr-012', name: 'Kelly Chen',       callsPerWeek: 9,  emailsPerWeek: 18, linkedinPerWeek: 5, meetingsPerWeek: 4 },
  { userId: 'demo-usr-013', sfId: 'sf-usr-013', name: 'Anna Schmidt',     callsPerWeek: 11, emailsPerWeek: 22, linkedinPerWeek: 7, meetingsPerWeek: 5 },
  { userId: 'demo-usr-014', sfId: 'sf-usr-014', name: 'Carlos Mendez',    callsPerWeek: 8,  emailsPerWeek: 16, linkedinPerWeek: 5, meetingsPerWeek: 3 },
  { userId: 'demo-usr-015', sfId: 'sf-usr-015', name: 'Tom Nguyen',       callsPerWeek: 10, emailsPerWeek: 19, linkedinPerWeek: 6, meetingsPerWeek: 4 },
  { userId: 'demo-usr-016', sfId: 'sf-usr-016', name: 'Lisa Wang',        callsPerWeek: 8,  emailsPerWeek: 15, linkedinPerWeek: 4, meetingsPerWeek: 3 },
];

/** Seeded pseudo-random for deterministic demo data */
function seededRand(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

function distributeCount(total: number, days: number, seed: number): number[] {
  const perDay: number[] = [];
  let remaining = total;
  for (let i = 0; i < days; i++) {
    const r = seededRand(seed * 7 + i);
    const count = i === days - 1
      ? remaining
      : Math.min(remaining, Math.round(r * (total / days) * 2));
    perDay.push(Math.max(0, count));
    remaining = Math.max(0, remaining - count);
  }
  return perDay;
}

const SYNCED_AT = '2026-03-28T07:00:00Z';
let seq = 0;

function generateSummariesForAE(profile: typeof AE_ACTIVITY_PROFILES[0]): ActivityDailySummary[] {
  const summaries: ActivityDailySummary[] = [];
  // Generate 13 weeks of data (Mon–Fri only)
  const startDate = new Date('2025-12-29'); // Start ~13 weeks before Mar 28, 2026

  for (let week = 0; week < 13; week++) {
    const weekSeed = profile.userId.charCodeAt(8) + week * 100;
    const calls     = Math.round(profile.callsPerWeek    * (0.7 + seededRand(weekSeed + 1) * 0.6));
    const emails    = Math.round(profile.emailsPerWeek   * (0.7 + seededRand(weekSeed + 2) * 0.6));
    const linkedin  = Math.round(profile.linkedinPerWeek * (0.7 + seededRand(weekSeed + 3) * 0.6));
    const meetings  = Math.round(profile.meetingsPerWeek * (0.7 + seededRand(weekSeed + 4) * 0.6));

    // Spread across 5 business days
    const dayDistCalls    = distributeCount(calls,    5, weekSeed + 10);
    const dayDistEmails   = distributeCount(emails,   5, weekSeed + 20);
    const dayDistLinkedin = distributeCount(linkedin, 5, weekSeed + 30);
    const dayDistMeetings = distributeCount(meetings, 5, weekSeed + 40);

    for (let day = 0; day < 5; day++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + week * 7 + day);

      // Skip future dates
      if (date > new Date('2026-03-28')) continue;

      const c = dayDistCalls[day];
      const e = dayDistEmails[day];
      const l = dayDistLinkedin[day];
      const m = dayDistMeetings[day];
      const total = c + e + l + m;

      if (total === 0) continue;

      seq++;
      summaries.push({
        id: `demo-act-${String(seq).padStart(4, '0')}`,
        owner_sf_id: profile.sfId,
        ae_name: profile.name,
        activity_date: date.toISOString().split('T')[0],
        activity_count: total,
        call_count: c,
        email_count: e,
        linkedin_count: l,
        meeting_count: m,
        synced_at: SYNCED_AT,
      });
    }
  }
  return summaries;
}

export const MOCK_ACTIVITY_SUMMARIES: ActivityDailySummary[] = AE_ACTIVITY_PROFILES.flatMap(generateSummariesForAE);
