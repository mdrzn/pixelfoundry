export const STARTER_CREDIT_GRANT = 100;

export const CREDIT_COSTS = {
  CREATE_IMAGE: 12,
  EDIT_IMAGE: 10,
  CREATE_VIDEO: 32,
} as const;

export type JobCreditKey = keyof typeof CREDIT_COSTS;

export const PLACEHOLDER_IMAGE_URLS = [
  "https://images.placeholderapi.com/seed/pixelfoundry-1/1200/800",
  "https://images.placeholderapi.com/seed/pixelfoundry-2/1200/800",
  "https://images.placeholderapi.com/seed/pixelfoundry-3/1200/800",
  "https://images.placeholderapi.com/seed/pixelfoundry-4/1200/800",
];

