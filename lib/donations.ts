export type DonationCampaign = {
  enabled: boolean;
  title: string;
  description: string;
  buttonLabel: string;
};

export type TargetDonationCampaign = DonationCampaign & {
  targetPence: number;
  raisedPence: number;
};

export type DonationSettings = {
  generic: DonationCampaign;
  target: TargetDonationCampaign;
};

export const defaultDonationSettings: DonationSettings = {
  generic: {
    enabled: false,
    title: "Help keep steam in motion.",
    description:
      "Every gift helps us care for the railway, maintain the grounds and share model engineering with the next generation.",
    buttonLabel: "Make a donation",
  },
  target: {
    enabled: false,
    title: "Help us reach our next milestone.",
    description:
      "Support a focused Society project and watch the campaign move closer to its goal.",
    buttonLabel: "Support this project",
    targetPence: 500_000,
    raisedPence: 0,
  },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown, fallback: string, maxLength: number) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback;
}

function penceValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : fallback;
}

export function parseDonationSettings(settings: unknown): DonationSettings {
  const root = asRecord(settings);
  const donations = asRecord(root.donations);
  const generic = asRecord(donations.generic);
  const target = asRecord(donations.target);

  return {
    generic: {
      enabled: generic.enabled === true,
      title: stringValue(generic.title, defaultDonationSettings.generic.title, 120),
      description: stringValue(generic.description, defaultDonationSettings.generic.description, 500),
      buttonLabel: stringValue(generic.buttonLabel, defaultDonationSettings.generic.buttonLabel, 40),
    },
    target: {
      enabled: target.enabled === true,
      title: stringValue(target.title, defaultDonationSettings.target.title, 120),
      description: stringValue(target.description, defaultDonationSettings.target.description, 500),
      buttonLabel: stringValue(target.buttonLabel, defaultDonationSettings.target.buttonLabel, 40),
      targetPence: penceValue(target.targetPence, defaultDonationSettings.target.targetPence),
      raisedPence: 0,
    },
  };
}
