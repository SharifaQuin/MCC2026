export interface FieldEvalCategoryDef {
  key: string;
  label: string;
  checklistItems: string[];
  relatedModuleTitles: string[];
}

export const FIELD_EVAL_CATEGORIES: FieldEvalCategoryDef[] = [
  {
    key: "GOLDEN_RULES_TECHNIQUE",
    label: "Golden Rules & Cleaning Technique",
    checklistItems: [
      "Worked top-to-bottom, left-to-right",
      "Used sponge then rag on countertops",
      "Put items back exactly as found, labels facing out",
      "Checked own work before moving on",
    ],
    relatedModuleTitles: [
      "Golden Rules of Cleaning",
      "Advanced Cleaning and Technique",
      "Deep Cleaning and Specialty Tasks",
      "How to Clean a Bathroom",
      "How to Clean a Kitchen",
      "Living Area and Bedrooms",
    ],
  },
  {
    key: "SPEED_EFFICIENCY",
    label: "Speed & Time Management",
    checklistItems: [
      "Finished within the scheduled JTH/AH",
      "Didn't cut corners to save time",
      "Planned a route through the home before starting",
    ],
    relatedModuleTitles: ["Time Management and Travel Efficiency"],
  },
  {
    key: "TEAMWORK_COMMUNICATION",
    label: "Teamwork & Internal Communication",
    checklistItems: [
      "Split wet/dry areas correctly with partner",
      "Helped partner finish when done early",
      "Communicated clearly with teammate throughout the job",
    ],
    relatedModuleTitles: ["Working in Teams & Working Solo", "A Day in the Life"],
  },
  {
    key: "CLIENT_INTERACTION",
    label: "Client Interaction & Etiquette",
    checklistItems: [
      "Greeted client professionally",
      "Kept voice low when client was home",
      "Avoided oversharing personal or internal office info",
    ],
    relatedModuleTitles: ["Client Communication and Etiquette", "Who We Are"],
  },
  {
    key: "SAFETY_PROFESSIONALISM",
    label: "Safety & Professionalism",
    checklistItems: [
      "Followed safety precautions (ladders, chemicals, pets, etc.)",
      "Wore proper uniform",
      "Cell phone not used except for emergencies",
      "Vacuum/supplies handled per policy",
    ],
    relatedModuleTitles: [
      "Supplies, Tools & Safety",
      "Taking Care of You",
      "Field Scenarios & Office Communication",
      "Uniform Standard Policy",
    ],
  },
];

export function findCategory(key: string) {
  return FIELD_EVAL_CATEGORIES.find((c) => c.key === key);
}

export function averageScore(scores: number[]): number | null {
  if (scores.length === 0) return null;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
}
