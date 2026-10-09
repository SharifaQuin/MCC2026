import { prisma } from "@/lib/prisma";
import { businessTimeParts } from "@/lib/timezone";

// Kept in the same SalesToolData key-value store leadform:config already
// uses — this is a Management-owned setting (edited on /management), not a
// Sales one, but there's no dedicated settings table in this app, and
// adding one just for this single value would be more machinery than the
// value itself.
const BUSINESS_HOURS_KEY = "settings:businessHours";

export interface BusinessHoursConfig {
  // ISO weekday numbers, 1 = Monday .. 7 = Sunday (matches businessTimeParts).
  weekdays: number[];
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

export const DEFAULT_BUSINESS_HOURS: BusinessHoursConfig = {
  weekdays: [1, 2, 3, 4, 5],
  startHour: 8,
  startMinute: 0,
  endHour: 17,
  endMinute: 0,
};

export async function getBusinessHours(): Promise<BusinessHoursConfig> {
  const row = await prisma.salesToolData.findUnique({ where: { key: BUSINESS_HOURS_KEY } });
  if (!row) return DEFAULT_BUSINESS_HOURS;
  try {
    return { ...DEFAULT_BUSINESS_HOURS, ...(JSON.parse(row.value) as Partial<BusinessHoursConfig>) };
  } catch {
    return DEFAULT_BUSINESS_HOURS;
  }
}

export async function setBusinessHours(config: BusinessHoursConfig): Promise<void> {
  await prisma.salesToolData.upsert({
    where: { key: BUSINESS_HOURS_KEY },
    create: { key: BUSINESS_HOURS_KEY, value: JSON.stringify(config) },
    update: { value: JSON.stringify(config) },
  });
}

// Whether `date` falls inside the configured business hours, evaluated in
// the business timezone (Pacific by default) regardless of the server's
// own runtime timezone.
export function isWithinBusinessHours(date: Date, config: BusinessHoursConfig): boolean {
  const { weekday, hour, minute } = businessTimeParts(date);
  if (!config.weekdays.includes(weekday)) return false;
  const minutesOfDay = hour * 60 + minute;
  const start = config.startHour * 60 + config.startMinute;
  const end = config.endHour * 60 + config.endMinute;
  return minutesOfDay >= start && minutesOfDay < end;
}
