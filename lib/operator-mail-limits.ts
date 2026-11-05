// The compose form's limits (lib/operator-mail.ts), in a module with no server imports so the
// client form can read them.
export const SUBJECT_MAX = 150;
export const BODY_MAX = 10_000;
export const LINK_LABEL_MAX = 40;
