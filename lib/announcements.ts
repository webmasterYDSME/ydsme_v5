export const ANNOUNCEMENT_TITLE_MAX_LENGTH = 26;
export const ANNOUNCEMENT_DESCRIPTION_MAX_LENGTH = 120;

export function fitAnnouncementText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;

  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}
