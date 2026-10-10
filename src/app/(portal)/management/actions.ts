"use server";

import { revalidatePath } from "next/cache";
import { requireDepartmentAccess } from "@/lib/requireDepartmentAccess";
import { setBusinessHours, type BusinessHoursConfig } from "@/lib/businessHours";

// Index 0..6 maps to the ISO weekday numbers (1=Mon..7=Sun) businessTimeParts
// and BusinessHoursConfig.weekdays both use.
const WEEKDAY_FORM_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function parseTimeOfDay(raw: string, fallbackHour: number, fallbackMinute: number): [number, number] {
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return [fallbackHour, fallbackMinute];
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return [fallbackHour, fallbackMinute];
  return [hour, minute];
}

export async function setBusinessHoursAction(formData: FormData) {
  const { canEdit } = await requireDepartmentAccess("MANAGEMENT");
  if (!canEdit) return;

  const weekdays: number[] = [];
  WEEKDAY_FORM_KEYS.forEach((key, i) => {
    if (formData.get(`day_${key}`)) weekdays.push(i + 1);
  });

  const [startHour, startMinute] = parseTimeOfDay(String(formData.get("startTime") ?? ""), 8, 0);
  const [endHour, endMinute] = parseTimeOfDay(String(formData.get("endTime") ?? ""), 17, 0);

  const config: BusinessHoursConfig = {
    weekdays: weekdays.length > 0 ? weekdays : [1, 2, 3, 4, 5],
    startHour,
    startMinute,
    endHour,
    endMinute,
  };

  await setBusinessHours(config);
  revalidatePath("/management/business-hours");
}
