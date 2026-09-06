export interface GlossaryTerm {
  term: string;
  definitionEn: string;
  definitionEs: string;
}

export const GLOSSARY: GlossaryTerm[] = [
  {
    term: "Team Lead",
    definitionEn:
      "Whoever arrives at a home first when there's no official Lead Technician on the team — handles the pre-cleaning walkthrough.",
    definitionEs:
      "Quien llega primero a una casa cuando no hay un Técnico Líder oficial en el equipo — se encarga del recorrido previo a la limpieza.",
  },
  {
    term: "Lead Technician",
    definitionEn:
      "A technician who has completed all training and evaluation needed to be promoted above Cleaning Technician.",
    definitionEs:
      "Un técnico que ha completado todo el entrenamiento y evaluación necesarios para ser ascendido por encima de Técnico de Limpieza.",
  },
  {
    term: "Initial Clean",
    definitionEn:
      "The first cleaning for a new recurring client's home — slightly deeper than a standard maintenance cleaning.",
    definitionEs:
      "La primera vez que limpiamos la casa de un nuevo cliente recurrente — un poco más profunda que una limpieza de mantenimiento estándar.",
  },
  {
    term: "One-Time Clean",
    definitionEn:
      "The only cleaning for a client's home, done as a maintenance cleaning (usually for a special occasion).",
    definitionEs:
      "La única vez que limpiamos la casa de un cliente, como limpieza de mantenimiento (normalmente para ocasiones especiales).",
  },
  {
    term: "Recurring Clean",
    definitionEn: "On the schedule regularly — weekly, biweekly, or monthly.",
    definitionEs: "Programada regularmente — semanal, quincenal o mensual.",
  },
  {
    term: "Flex House",
    definitionEn:
      "A flexible client who often hosts newer technicians, giving 100% honest feedback on performance.",
    definitionEs:
      "Un cliente flexible que frecuentemente recibe a técnicos nuevos, dando retroalimentación 100% honesta sobre su desempeño.",
  },
  {
    term: "TTB (Top to Bottom)",
    definitionEn:
      "A complete deep cleaning before recurring services start — also known as a Deep Cleaning (furnished homes).",
    definitionEs:
      "Una limpieza profunda completa antes de que inicien los servicios recurrentes — también conocida como Limpieza Profunda en casas amuebladas.",
  },
  {
    term: "Make Ready Clean",
    definitionEn:
      "A vacant/empty home cleaned before move-in or after move-out — also known as a Move-In/Move-Out Cleaning.",
    definitionEs:
      "Una casa vacía que se limpia antes de una mudanza de entrada o después de una de salida — también conocida como Limpieza de Mudanza.",
  },
  {
    term: "Post-Construction",
    definitionEn: "A cleaning after a home has been renovated or is under construction.",
    definitionEs: "Una limpieza después de que una casa ha sido remodelada o está en construcción.",
  },
  {
    term: "A La Carte",
    definitionEn:
      "Only a specific area or item needs cleaning — for example, just the kitchen, or one room.",
    definitionEs:
      "Solo se necesita limpiar un área o artículo específico — por ejemplo, solo la cocina, o una sola habitación.",
  },
  {
    term: "CRM / TCS",
    definitionEn:
      "The system holding client information, schedules, timesheets, and HR data. For MCC, this system is TCS.",
    definitionEs:
      "El sistema que contiene la información de los clientes, horarios, hojas de tiempo y datos de recursos humanos. Para MCC, este sistema es TCS.",
  },
  {
    term: "JTH (Job Ticket Hours)",
    definitionEn:
      "The time frame a client has paid for their home to be cleaned. 3 JTH = 3 hours paid to clean.",
    definitionEs:
      "El tiempo que el cliente ha pagado para que se limpie su casa. 3 JTH = 3 horas pagadas de limpieza.",
  },
  {
    term: "AH (Allowed Hours)",
    definitionEn: "Another name for the same JTH system — the scheduled/paid time for a job.",
    definitionEs: "Otro nombre para el mismo sistema JTH — el tiempo programado/pagado para un trabajo.",
  },
  {
    term: "Actual Hours / Labor Hours",
    definitionEn:
      "The real time it takes a technician to clean the house. A 3 JTH job might actually take 2.75 actual hours.",
    definitionEs:
      "El tiempo real que le toma a un técnico limpiar la casa. Un trabajo de 3 JTH podría tomar en realidad 2.75 horas reales.",
  },
  {
    term: "Employment Status",
    definitionEn:
      "Every MCC technician is a full-time, direct employee. MCC does not use part-time, seasonal, or temporary staff, and does not hire through outside staffing agencies.",
    definitionEs:
      "Cada técnico de MCC es un empleado de tiempo completo y directo. MCC no utiliza personal de medio tiempo, temporal ni de temporada, y no contrata a través de agencias de personal externas.",
  },
  {
    term: "Dirt Code",
    definitionEn:
      "Judges how dirty a home is so the right tools, time, and expectations can be communicated before anyone walks in. Codes 1–4 are maintenance-level homes; 5–10 involve a TTB clean.",
    definitionEs:
      "Evalúa qué tan sucio está un hogar para que se puedan comunicar las herramientas, el tiempo y las expectativas correctas antes de que alguien entre. Códigos 1–4 son hogares de mantenimiento; 5–10 implican una limpieza TTB.",
  },
  {
    term: "Lockout Fee",
    definitionEn:
      "If you arrive at a job and can't get in or complete the cleaning through no fault of your own, you're paid a $25 lockout fee before heading to your next scheduled home.",
    definitionEs:
      "Si llegas a un trabajo y no puedes entrar o completar la limpieza sin que sea tu culpa, se te paga un Lockout Fee de $25 antes de dirigirte a tu siguiente hogar programado.",
  },
];
