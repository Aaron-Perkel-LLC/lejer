export type HouseholdMode = "single_payer" | "ledger";
export type Theme = "statement" | "peach" | "japandi" | "sheet";
export type ColorScheme = "system" | "light";
export type Role = "admin" | "member";

export interface User {
  id: number;
  email: string;
  name: string;
}

export interface Membership {
  id: number;
  householdId: number;
  userId: number;
  role: Role;
  splitsBills: boolean;
  welcomedAt: Date | null;
  joinedAt: Date | null;
  /** Mail categories this member turned off (lib/unsubscribe.ts, 0014). */
  mutedKinds: string[];
}

export interface Household {
  id: number;
  slug: string;
  name: string;
  tagline: string | null;
  mode: HouseholdMode;
  theme: Theme;
  colorScheme: ColorScheme;
  timezone: string;
  askBillDate: boolean;
  billsPerPage: number;
  featureRent: boolean;
  featureTrends: boolean;
  featureBulkEmail: boolean;
  featureDocuments: boolean;
  featureWelcomeTour: boolean;
  featureThanks: boolean;
  /** The payer's own check-off (0017): bill owners tick off paying the provider and get reminders until then. */
  featureOwnerCheckoff: boolean;
  monthlyRent: number | null;
  leaseStart: string | null;
  leaseEnd: string | null;
  remindersEnabled: boolean;
  sendHour: number;
  firstReminderDays: number;
  urgentReminderDays: number;
  fromName: string | null;
  replyTo: string | null;
  digestEmail: string | null;
  /** An open deletion request (lib/deletion.ts): when, and by which membership. */
  deletionRequestedAt: Date | null;
  deletionRequestedBy: number | null;
  /** Marked for deletion: read-only until then, and the cron deletes it once past. */
  deleteAfter: Date | null;
}

/** The cron's bookkeeping on a household: the settings page's "last tick / last send" readout. */
export interface ReminderRun {
  lastRunAt: Date | null;
  lastSendDate: string | null;
  lastSentAt: Date | null;
  lastSentCount: number;
}
