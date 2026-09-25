import { prisma } from "@/lib/prisma";
import { markLessonComplete } from "@/lib/courses";
import type { FieldSkillRating } from "@prisma/client";

// ── Rookie Journey V2 — additive layer on top of the existing Academy ──
// Nothing here duplicates or rewrites the 25 modules/172 lessons/267 quiz
// questions; RookieLessonAssignment only points at an existing Lesson row,
// and completing one through the Rookie Journey still writes to the same
// LessonProgress table /modules does (see markLessonComplete).

export const ROOKIE_DAY_COUNT = 10;

// The initial 21-skill field checklist library, seeded once. An Admin can
// rename/reorder/retire these afterward via the config UI without breaking
// historical RookieFieldSkillRating rows (which keep their own rating).
export const FIELD_SKILL_LIBRARY: { key: string; labelEn: string; labelEs: string }[] = [
  { key: "dusting", labelEn: "Dusting", labelEs: "Sacudir el Polvo" },
  { key: "floors_vacuuming", labelEn: "Floors/Vacuuming", labelEs: "Pisos/Aspirado" },
  { key: "mopping", labelEn: "Mopping", labelEs: "Trapeado" },
  { key: "bathroom", labelEn: "Bathroom", labelEs: "Baño" },
  { key: "kitchen", labelEn: "Kitchen", labelEs: "Cocina" },
  { key: "bedroom", labelEn: "Bedroom", labelEs: "Recámara" },
  { key: "living_area", labelEn: "Living Area", labelEs: "Sala" },
  { key: "complete_room_flow", labelEn: "Complete Room Flow", labelEs: "Flujo Completo de Habitación" },
  { key: "complete_home_flow", labelEn: "Complete Home Flow", labelEs: "Flujo Completo del Hogar" },
  { key: "tool_setup", labelEn: "Tool Setup", labelEs: "Preparación de Herramientas" },
  { key: "chemical_safety", labelEn: "Chemical Safety", labelEs: "Seguridad con Químicos" },
  { key: "top_to_bottom", labelEn: "Top-to-Bottom", labelEs: "De Arriba Hacia Abajo" },
  { key: "left_to_right", labelEn: "Left-to-Right", labelEs: "De Izquierda a Derecha" },
  { key: "uses_both_hands", labelEn: "Uses Both Hands", labelEs: "Usa Ambas Manos" },
  { key: "returns_items", labelEn: "Returns Items Correctly", labelEs: "Regresa los Artículos Correctamente" },
  { key: "final_quality_check", labelEn: "Final Quality Check", labelEs: "Revisión Final de Calidad" },
  { key: "speed_with_purpose", labelEn: "Speed With Purpose", labelEs: "Velocidad con Propósito" },
  { key: "team_flow", labelEn: "Team Flow", labelEs: "Flujo en Equipo" },
  { key: "client_etiquette", labelEn: "Client Etiquette", labelEs: "Etiqueta con el Cliente" },
  { key: "tcs_usage", labelEn: "TCS Usage", labelEs: "Uso de TCS" },
  { key: "office_escalation", labelEn: "Office Escalation", labelEs: "Escalación a la Oficina" },
];

// Default content for the 10 Rookie Days, per the approved framework. An
// Admin can edit any of this afterward via /admin/rookie-journey — nothing
// here is hardcoded into the UI itself.
export const ROOKIE_DAY_DEFAULTS: {
  dayNumber: number;
  titleEn: string;
  titleEs: string;
  descriptionEn: string;
  descriptionEs: string;
  estimatedAcademyMinutes: number;
  fieldGoalEn: string;
  fieldGoalEs: string;
  fieldSkillKeys: string[];
}[] = [
  {
    dayNumber: 1,
    titleEn: "Fundamentals + First Clean",
    titleEs: "Fundamentos + Primera Limpieza",
    descriptionEn:
      "Welcome to Mama's, the MAMAS values, hospitality, a day in the life, basic team roles, TCS essentials, the Golden Rules, essential safety, and essential supplies/tools — then an afternoon of hands-on field training covering dusting, floors, and bathroom basics.",
    descriptionEs:
      "Bienvenida a Mama's, los valores MAMAS, hospitalidad, un día en la vida, roles básicos de equipo, lo esencial de TCS, las Reglas de Oro, seguridad esencial y herramientas/suministros esenciales — luego una tarde de capacitación práctica en campo cubriendo lo básico de sacudir el polvo, pisos y baño.",
    estimatedAcademyMinutes: 180,
    fieldGoalEn: "Hands-on afternoon: dusting, floors, and bathroom, with a trainer alongside.",
    fieldGoalEs: "Tarde práctica: sacudir el polvo, pisos y baño, con un capacitador presente.",
    fieldSkillKeys: ["dusting", "floors_vacuuming", "bathroom", "tool_setup", "chemical_safety"],
  },
  {
    dayNumber: 2,
    titleEn: "Kitchen + Complete Room Flow",
    titleEs: "Cocina + Flujo Completo de Habitación",
    descriptionEn:
      "Kitchen, bedrooms, living areas, the complete MCC room flow, and proper reset/final inspection — reinforcing dusting, floors, and bathroom. Most of the day is field time.",
    descriptionEs:
      "Cocina, recámaras, salas, el flujo completo de habitación de MCC, y el reinicio/inspección final adecuados — reforzando sacudir el polvo, pisos y baño. La mayor parte del día es en campo.",
    estimatedAcademyMinutes: 75,
    fieldGoalEn: "Complete a full room flow in the kitchen, a bedroom, and a living area with a final inspection.",
    fieldGoalEs: "Completa un flujo de habitación completo en la cocina, una recámara y una sala, con inspección final.",
    fieldSkillKeys: ["kitchen", "bedroom", "living_area", "complete_room_flow", "final_quality_check"],
  },
  {
    dayNumber: 3,
    titleEn: "Full Home Flow",
    titleEs: "Flujo Completo del Hogar",
    descriptionEn:
      "The complete-home workflow, team flow, speed with purpose, Dirt Codes/time expectations, quality control, field communication, and escalation basics. By the end of today you should understand how to independently move through an entire standard MCC home — you're not expected to have mastered speed yet.",
    descriptionEs:
      "El flujo de trabajo del hogar completo, flujo en equipo, velocidad con propósito, Dirt Codes/expectativas de tiempo, control de calidad, comunicación de campo y lo básico de escalación. Al final de hoy debes entender cómo moverte de forma independiente por una casa estándar completa de MCC — todavía no se espera que domines la velocidad.",
    estimatedAcademyMinutes: 60,
    fieldGoalEn: "Move through an entire home's flow independently, with support available.",
    fieldGoalEs: "Recorre el flujo de una casa completa de forma independiente, con apoyo disponible.",
    fieldSkillKeys: ["complete_home_flow", "team_flow", "speed_with_purpose", "tcs_usage", "office_escalation"],
  },
  {
    dayNumber: 4,
    titleEn: "Accuracy",
    titleEs: "Precisión",
    descriptionEn: "Follow the MCC cleaning sequence correctly without constant reminders.",
    descriptionEs: "Sigue la secuencia de limpieza de MCC correctamente sin recordatorios constantes.",
    estimatedAcademyMinutes: 30,
    fieldGoalEn: "Work the full sequence top-to-bottom, left-to-right, with fewer reminders needed.",
    fieldGoalEs: "Trabaja la secuencia completa de arriba hacia abajo y de izquierda a derecha, con menos recordatorios necesarios.",
    fieldSkillKeys: ["top_to_bottom", "left_to_right"],
  },
  {
    dayNumber: 5,
    titleEn: "Quality",
    titleEs: "Calidad",
    descriptionEn: "Details, final inspections, and reducing missed items.",
    descriptionEs: "Detalles, inspecciones finales y reducir los artículos pasados por alto.",
    estimatedAcademyMinutes: 30,
    fieldGoalEn: "Catch missed details before calling a room done.",
    fieldGoalEs: "Detecta los detalles pasados por alto antes de dar una habitación por terminada.",
    fieldSkillKeys: ["final_quality_check", "returns_items"],
  },
  {
    dayNumber: 6,
    titleEn: "Efficiency",
    titleEs: "Eficiencia",
    descriptionEn: "Using both hands, preparation, movement, and reducing backtracking.",
    descriptionEs: "Usar ambas manos, preparación, movimiento y reducir los retrocesos.",
    estimatedAcademyMinutes: 30,
    fieldGoalEn: "Set up tools ahead of time and move through the home without backtracking.",
    fieldGoalEs: "Prepara las herramientas con anticipación y recorre la casa sin retroceder.",
    fieldSkillKeys: ["uses_both_hands", "tool_setup"],
  },
  {
    dayNumber: 7,
    titleEn: "Pace",
    titleEs: "Ritmo",
    descriptionEn: "Working toward MCC time expectations without sacrificing quality.",
    descriptionEs: "Trabajar hacia las expectativas de tiempo de MCC sin sacrificar la calidad.",
    estimatedAcademyMinutes: 30,
    fieldGoalEn: "Move with purpose toward the Dirt Code time expectation for each room.",
    fieldGoalEs: "Muévete con propósito hacia la expectativa de tiempo del Dirt Code de cada habitación.",
    fieldSkillKeys: ["speed_with_purpose"],
  },
  {
    dayNumber: 8,
    titleEn: "Team Flow",
    titleEs: "Flujo en Equipo",
    descriptionEn: "Working effectively with a partner/Lead Technician.",
    descriptionEs: "Trabajar de forma efectiva con un compañero/Técnico Líder.",
    estimatedAcademyMinutes: 30,
    fieldGoalEn: "Split work with your partner cleanly and communicate throughout the job.",
    fieldGoalEs: "Divide el trabajo con tu compañero de forma clara y comunícate durante todo el trabajo.",
    fieldSkillKeys: ["team_flow", "client_etiquette"],
  },
  {
    dayNumber: 9,
    titleEn: "Independence",
    titleEs: "Independencia",
    descriptionEn: "Completing assigned areas with minimal trainer intervention.",
    descriptionEs: "Completar las áreas asignadas con mínima intervención del capacitador.",
    estimatedAcademyMinutes: 30,
    fieldGoalEn: "Complete your assigned areas with minimal check-ins from your trainer.",
    fieldGoalEs: "Completa tus áreas asignadas con mínimas intervenciones de tu capacitador.",
    fieldSkillKeys: ["complete_home_flow", "returns_items"],
  },
  {
    dayNumber: 10,
    titleEn: "Consistency + Rookie Evaluation",
    titleEs: "Consistencia + Evaluación Rookie",
    descriptionEn: "Repeatable, MCC-standard performance — today wraps up with the Rookie Training Review.",
    descriptionEs: "Desempeño repetible con el estándar de MCC — hoy termina con la Revisión de Entrenamiento Rookie.",
    estimatedAcademyMinutes: 30,
    fieldGoalEn: "Show the same MCC-standard quality and pace across every home today.",
    fieldGoalEs: "Muestra la misma calidad y ritmo del estándar de MCC en cada casa de hoy.",
    fieldSkillKeys: ["complete_home_flow", "final_quality_check", "speed_with_purpose"],
  },
];

// The 10 fixed Day-30 MCC Seal of Approval categories.
export const SEAL_OF_APPROVAL_CATEGORIES: { key: string; labelEn: string; labelEs: string }[] = [
  { key: "CLEANING_QUALITY", labelEn: "Cleaning Quality", labelEs: "Calidad de Limpieza" },
  { key: "EFFICIENCY", labelEn: "Efficiency", labelEs: "Eficiencia" },
  { key: "SAFETY", labelEn: "Safety", labelEs: "Seguridad" },
  { key: "RELIABILITY", labelEn: "Reliability", labelEs: "Confiabilidad" },
  { key: "ATTENDANCE", labelEn: "Attendance", labelEs: "Asistencia" },
  { key: "TEAMWORK", labelEn: "Teamwork", labelEs: "Trabajo en Equipo" },
  { key: "HOSPITALITY", labelEn: "Hospitality", labelEs: "Hospitalidad" },
  { key: "COMMUNICATION", labelEn: "Communication", labelEs: "Comunicación" },
  { key: "COACHABILITY", labelEn: "Coachability", labelEs: "Capacidad de Aprendizaje" },
  { key: "MAMAS_VALUES", labelEn: "MAMAS Values", labelEs: "Valores MAMAS" },
];

export interface SealCategoryScore {
  key: string;
  score: number;
  note?: string;
}

// ── Where a trainee is in the Journey ──
// Computed live from hireDate (falling back to createdAt for anyone hired
// before hireDate was tracked), same "never store a due date" philosophy as
// the existing MilestoneReview system — never stored, always derived.
export type RookieJourneyPosition =
  | { phase: "ROOKIE_DAY"; day: number }
  | { phase: "AWAITING_30"; elapsedDays: number }
  | { phase: "AWAITING_60"; elapsedDays: number }
  | { phase: "AWAITING_90"; elapsedDays: number }
  | { phase: "BEYOND_90"; elapsedDays: number };

export function rookieAnchorDate(user: { hireDate: Date | null; createdAt: Date }): Date {
  return user.hireDate ?? user.createdAt;
}

export function getRookieJourneyPosition(anchor: Date, now: Date = new Date()): RookieJourneyPosition {
  const elapsedDays = Math.max(1, Math.floor((now.getTime() - anchor.getTime()) / 86400000) + 1);
  if (elapsedDays <= ROOKIE_DAY_COUNT) return { phase: "ROOKIE_DAY", day: elapsedDays };
  if (elapsedDays <= 30) return { phase: "AWAITING_30", elapsedDays };
  if (elapsedDays <= 60) return { phase: "AWAITING_60", elapsedDays };
  if (elapsedDays <= 90) return { phase: "AWAITING_90", elapsedDays };
  return { phase: "BEYOND_90", elapsedDays };
}

// The 13 stops on the progress rail (Day 1..10, then 30/60/90), each marked
// done/current/upcoming relative to the trainee's position — purely a
// display helper, no DB access.
export interface RookieRailStop {
  key: string;
  label: string;
  status: "done" | "current" | "upcoming";
}

export function buildRookieRail(position: RookieJourneyPosition): RookieRailStop[] {
  const currentDay = position.phase === "ROOKIE_DAY" ? position.day : ROOKIE_DAY_COUNT + 1;
  const dayStops: RookieRailStop[] = Array.from({ length: ROOKIE_DAY_COUNT }, (_, i) => {
    const day = i + 1;
    return {
      key: `day-${day}`,
      label: `${day}`,
      status: day < currentDay ? "done" : day === currentDay ? "current" : "upcoming",
    };
  });

  const milestoneStatus = (threshold: 30 | 60 | 90): RookieRailStop["status"] => {
    if (position.phase === "ROOKIE_DAY") return "upcoming";
    const order = { AWAITING_30: 30, AWAITING_60: 60, AWAITING_90: 90, BEYOND_90: 91 } as const;
    const current = order[position.phase];
    if (current > threshold) return "done";
    if (current === threshold) return "current";
    return "upcoming";
  };

  return [
    ...dayStops,
    { key: "day-30", label: "30", status: milestoneStatus(30) },
    { key: "day-60", label: "60", status: milestoneStatus(60) },
    { key: "day-90", label: "90", status: milestoneStatus(90) },
  ];
}

// ── Admin config: Rookie Days + lesson/field-skill assignment ──

export async function getAllRookieDaysForAdmin() {
  const days = await prisma.rookieDay.findMany({
    orderBy: { dayNumber: "asc" },
    include: {
      lessons: {
        orderBy: { order: "asc" },
        include: { lesson: { include: { module: { select: { titleEn: true, order: true } } } } },
      },
      fieldSkills: {
        orderBy: { order: "asc" },
        include: { fieldSkill: true },
      },
    },
  });
  return days;
}

// Every published lesson, with module context and its current Rookie
// assignment (if any) — the source list for the admin "assign to a day"
// picker. Read-only; assigning is a separate action.
export async function getLessonAssignmentOptions() {
  const lessons = await prisma.lesson.findMany({
    where: { published: true },
    orderBy: [{ module: { order: "asc" } }, { order: "asc" }],
    include: {
      module: { select: { titleEn: true, order: true } },
      rookieAssignment: { select: { id: true, slot: true, rookieDay: { select: { dayNumber: true } } } },
    },
  });
  return lessons.map((l) => ({
    id: l.id,
    titleEn: l.titleEn,
    moduleTitleEn: l.module.titleEn,
    moduleOrder: l.module.order,
    order: l.order,
    assignment: l.rookieAssignment[0]
      ? {
          id: l.rookieAssignment[0].id,
          slot: l.rookieAssignment[0].slot,
          dayNumber: l.rookieAssignment[0].rookieDay?.dayNumber ?? null,
        }
      : null,
  }));
}

export async function getFieldSkillLibrary() {
  return prisma.fieldSkill.findMany({ where: { active: true }, orderBy: { order: "asc" } });
}

// ── Trainee-facing: Today's Training ──

export interface TodaysRookieTraining {
  position: RookieJourneyPosition;
  rail: RookieRailStop[];
  day: {
    dayNumber: number;
    titleEn: string;
    titleEs: string;
    descriptionEn: string;
    descriptionEs: string;
    estimatedAcademyMinutes: number;
    fieldGoalEn: string | null;
    fieldGoalEs: string | null;
    lessons: {
      id: string;
      titleEn: string;
      titleEs: string | null;
      moduleSlug: string;
      lessonOrder: number;
      completed: boolean;
    }[];
    fieldSkills: { id: string; labelEn: string; labelEs: string }[];
    allLessonsComplete: boolean;
  } | null;
}

export async function getTodaysRookieTraining(userId: string): Promise<TodaysRookieTraining> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { hireDate: true, createdAt: true },
  });
  const anchor = rookieAnchorDate(user ?? { hireDate: null, createdAt: new Date() });
  const position = getRookieJourneyPosition(anchor);
  const rail = buildRookieRail(position);

  if (position.phase !== "ROOKIE_DAY") {
    return { position, rail, day: null };
  }

  const dayConfig = await prisma.rookieDay.findUnique({
    where: { dayNumber: position.day },
    include: {
      lessons: {
        where: { slot: "ROOKIE_DAY" },
        orderBy: { order: "asc" },
        include: { lesson: { include: { module: { select: { slug: true } } } } },
      },
      fieldSkills: { orderBy: { order: "asc" }, include: { fieldSkill: true } },
    },
  });
  if (!dayConfig) return { position, rail, day: null };

  const lessonIds = dayConfig.lessons.map((l) => l.lessonId);
  const completedRows = lessonIds.length
    ? await prisma.lessonProgress.findMany({
        where: { userId, lessonId: { in: lessonIds } },
        select: { lessonId: true },
      })
    : [];
  const completedIds = new Set(completedRows.map((r) => r.lessonId));

  const lessons = dayConfig.lessons.map((l) => ({
    id: l.lesson.id,
    titleEn: l.lesson.titleEn,
    titleEs: l.lesson.titleEs,
    moduleSlug: l.lesson.module.slug,
    lessonOrder: l.lesson.order,
    completed: completedIds.has(l.lesson.id),
  }));

  return {
    position,
    rail,
    day: {
      dayNumber: dayConfig.dayNumber,
      titleEn: dayConfig.titleEn,
      titleEs: dayConfig.titleEs,
      descriptionEn: dayConfig.descriptionEn,
      descriptionEs: dayConfig.descriptionEs,
      estimatedAcademyMinutes: dayConfig.estimatedAcademyMinutes,
      fieldGoalEn: dayConfig.fieldGoalEn,
      fieldGoalEs: dayConfig.fieldGoalEs,
      lessons,
      fieldSkills: dayConfig.fieldSkills.map((s) => ({
        id: s.fieldSkill.id,
        labelEn: s.fieldSkill.labelEn,
        labelEs: s.fieldSkill.labelEs,
      })),
      allLessonsComplete: lessons.length > 0 && lessons.every((l) => l.completed),
    },
  };
}

// Re-exported so callers don't need to know the Rookie Journey reuses the
// exact same completion path /modules uses — there is no separate "mark
// complete" for a lesson reached through the Rookie dashboard.
export { markLessonComplete };

// ── Trainer: field checkoffs ──

export interface FieldCheckoffInput {
  traineeId: string;
  trainerId: string;
  rookieDayNumber: number;
  ratings: { fieldSkillId: string; rating: FieldSkillRating; note?: string }[];
  wentWellNotes?: string;
  needsCoachingNotes?: string;
  tomorrowFocusNotes?: string;
}

export async function recordFieldCheckoff(input: FieldCheckoffInput) {
  return prisma.rookieFieldCheckoff.create({
    data: {
      traineeId: input.traineeId,
      trainerId: input.trainerId,
      rookieDayNumber: input.rookieDayNumber,
      wentWellNotes: input.wentWellNotes || null,
      needsCoachingNotes: input.needsCoachingNotes || null,
      tomorrowFocusNotes: input.tomorrowFocusNotes || null,
      skillRatings: {
        create: input.ratings.map((r) => ({
          fieldSkillId: r.fieldSkillId,
          rating: r.rating,
          note: r.note || null,
        })),
      },
    },
  });
}

export async function getRookieFieldCheckoffHistory(traineeId: string) {
  const rows = await prisma.rookieFieldCheckoff.findMany({
    where: { traineeId },
    orderBy: { checkoffDate: "desc" },
    include: {
      trainer: { select: { name: true } },
      skillRatings: { include: { fieldSkill: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    rookieDayNumber: r.rookieDayNumber,
    checkoffDate: r.checkoffDate,
    trainerName: r.trainer.name,
    wentWellNotes: r.wentWellNotes,
    needsCoachingNotes: r.needsCoachingNotes,
    tomorrowFocusNotes: r.tomorrowFocusNotes,
    ratings: r.skillRatings.map((sr) => ({
      fieldSkillLabelEn: sr.fieldSkill.labelEn,
      rating: sr.rating,
      note: sr.note,
    })),
  }));
}

// ── Day-3 / Day-10 / Day-30 decisions ──

export async function getDay3Readiness(traineeId: string) {
  return prisma.rookieDay3Readiness.findUnique({
    where: { traineeId },
    include: { decidedBy: { select: { name: true } } },
  });
}

export async function getDay10Review(traineeId: string) {
  return prisma.rookieDay10Review.findUnique({
    where: { traineeId },
    include: { decidedBy: { select: { name: true } } },
  });
}

export async function getSealEvaluationHistory(traineeId: string) {
  const rows = await prisma.sealOfApprovalEvaluation.findMany({
    where: { traineeId },
    orderBy: { evaluatedAt: "desc" },
    include: { evaluatedBy: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    categoryScores: r.categoryScores as unknown as SealCategoryScore[],
    decision: r.decision,
    notes: r.notes,
    evaluatedByName: r.evaluatedBy.name,
    evaluatedAt: r.evaluatedAt,
  }));
}
