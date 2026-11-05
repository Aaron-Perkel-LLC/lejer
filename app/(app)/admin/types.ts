// What the admin sections render, as plain data the client components can take: dates as ISO
// strings, the server's "now" alongside so relative times agree between the server render and
// the browser. page.tsx builds these from lib/admin.ts's AdminView.

export const SECTIONS = ["overview", "households", "people", "email", "waitlist"] as const;
export type Section = (typeof SECTIONS)[number];
export const SECTION_LABEL: Record<Section, string> = { overview: "Overview", households: "Households", people: "People", email: "Email", waitlist: "Waitlist" };

export interface MemberDto {
  userId: number;
  name: string;
  email: string;
  role: "admin" | "member";
  joined: boolean;
}

export interface HouseholdDto {
  id: number;
  name: string;
  slug: string;
  mode: string;
  theme: string;
  createdAt: string;
  lastActivity: string;
  memberCount: number;
  joinedCount: number;
  billCount: number;
  remindersEnabled: boolean;
  /** "deleting on Oct 25, 2026" / "deletion requested Oct 18, 2026", or null. */
  deletion: string | null;
  lastRunAt: string | null;
  lastTickOutcome: string | null;
  lastSentAt: string | null;
  lastSentCount: number;
  members: MemberDto[];
}

export interface SeatDto {
  householdId: number;
  householdName: string;
  slug: string;
  role: "admin" | "member";
  joined: boolean;
}

export interface PersonDto {
  id: number;
  name: string;
  email: string;
  createdAt: string;
  operator: boolean;
  mutedUpdates: boolean;
  seats: SeatDto[];
}

export interface WaitlistDto {
  email: string;
  createdAt: string;
  notifiedAt: string | null;
}

export interface MailKindDto {
  kind: string;
  sent: number;
  failed: number;
}

export interface FailureDto {
  sentAt: string;
  kind: string;
  householdName: string | null;
}

export interface WeekDto {
  week: string;
  households: number;
  users: number;
  bills: number;
}

export interface BudgetDto {
  today: number;
  month: number;
  dailyCeiling: number;
  monthQuota: number;
}

export interface TotalsDto {
  households: number;
  users: number;
  membershipsJoined: number;
  membershipsPending: number;
  bills: number;
  billsUnpaid: number;
  householdsDeleting: number;
}

export type Audience = "everyone" | "households" | "users" | "waitlist";

export interface Picks {
  households: number[];
  users: number[];
}

export type FormAction = (formData: FormData) => Promise<void>;
