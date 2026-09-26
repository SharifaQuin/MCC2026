// ── Rookie Curriculum V2 (Phase 2) — content and day-mapping data ──
// Pure content, no prisma import (safe for client components too — same
// reasoning as rookieJourneyContent... but note: unlike that file, nothing
// here is imported by a "use client" component today, so this could import
// prisma-adjacent types freely; kept import-free anyway for consistency and
// so it stays trivially reusable from the seed script and admin lib alike).
//
// Every RookieContentItem below is NEW Rookie-only content — it is never a
// substitute for the original Lesson it condenses, and the sourceLessonKeys
// on each item are pure traceability (module#-lesson#) resolved to real
// Lesson ids at seed time. No original Lesson is ever modified or deleted.

export type RookieContentKindSeed = "PRACTICAL_LESSON" | "SCENARIO" | "RECAP";

export interface RookieContentSeed {
  key: string;
  dayNumber: number;
  kind: RookieContentKindSeed;
  order: number;
  titleEn: string;
  titleEs: string;
  bodyEn: string;
  bodyEs: string;
  promptEn?: string;
  promptEs?: string;
  revealEn?: string;
  revealEs?: string;
  hasFutureVideoSlot?: boolean;
  estimatedMinutes?: number;
  sourceLessonKeys: string[]; // "moduleOrder-lessonOrder", e.g. "5-1"
}

// Which existing lessons get referenced by which Rookie Day (or the
// Knowledge Library). "moduleOrder-lessonOrder" -> target. Any of the 172
// lessons NOT listed here is left unassigned — still fully reachable via
// /modules, neither required in the Rookie Journey nor filed in the
// Library. See the implementation report for the explicit list of what was
// left unassigned and why.
export const LESSON_DAY_ASSIGNMENTS: {
  moduleOrder: number;
  lessonOrder: number;
  target: { dayNumber: number } | { slot: "KNOWLEDGE_LIBRARY" };
}[] = [
  // Day 1 — Learn the Mama's Way (required concepts, condensed via reference not rewrite)
  { moduleOrder: 1, lessonOrder: 1, target: { dayNumber: 1 } }, // Welcome & Our History
  { moduleOrder: 1, lessonOrder: 2, target: { dayNumber: 1 } }, // Our Mission
  { moduleOrder: 1, lessonOrder: 3, target: { dayNumber: 1 } }, // MAMAS
  { moduleOrder: 1, lessonOrder: 5, target: { dayNumber: 1 } }, // What Clients Expect
  { moduleOrder: 1, lessonOrder: 6, target: { dayNumber: 1 } }, // Hospitality Company
  { moduleOrder: 1, lessonOrder: 8, target: { dayNumber: 1 } }, // Rookie Schedule
  { moduleOrder: 2, lessonOrder: 1, target: { dayNumber: 1 } }, // Roles & Team Terms
  { moduleOrder: 3, lessonOrder: 1, target: { dayNumber: 1 } }, // TCS essentials
  { moduleOrder: 4, lessonOrder: 1, target: { dayNumber: 1 } }, // Before You Head Out
  { moduleOrder: 5, lessonOrder: 1, target: { dayNumber: 1 } }, // Golden Rules 1-5
  { moduleOrder: 5, lessonOrder: 2, target: { dayNumber: 1 } }, // Golden Rules 6-10 (also referenced Day 6)
  { moduleOrder: 5, lessonOrder: 3, target: { dayNumber: 1 } }, // Golden Rules 11-15
  { moduleOrder: 8, lessonOrder: 1, target: { dayNumber: 1 } }, // Taking Care of Your Body
  { moduleOrder: 8, lessonOrder: 2, target: { dayNumber: 1 } }, // Safety Always Comes First
  { moduleOrder: 15, lessonOrder: 1, target: { dayNumber: 1 } }, // product reference
  { moduleOrder: 15, lessonOrder: 2, target: { dayNumber: 1 } }, // Tools of the Trade
  { moduleOrder: 15, lessonOrder: 3, target: { dayNumber: 1 } }, // pack for standard cleaning
  { moduleOrder: 15, lessonOrder: 8, target: { dayNumber: 1 } }, // Safety Regulations (12 Rules)
  { moduleOrder: 15, lessonOrder: 11, target: { dayNumber: 1 } }, // Prohibited Chemical Combos
  { moduleOrder: 24, lessonOrder: 1, target: { dayNumber: 1 } }, // Uniform Standard Policy (authoritative)
  { moduleOrder: 23, lessonOrder: 1, target: { dayNumber: 1 } }, // Standard Maintenance Cleaning Checklist

  // Day 2 — Build the Full Cleaning System
  { moduleOrder: 18, lessonOrder: 2, target: { dayNumber: 2 } }, // Dirty Dishes procedure
  { moduleOrder: 6, lessonOrder: 1, target: { dayNumber: 2 } }, // Standard Team Setup
  { moduleOrder: 6, lessonOrder: 2, target: { dayNumber: 2 } }, // Wet/Dry Team Workflow
  { moduleOrder: 20, lessonOrder: 1, target: { dayNumber: 2 } }, // Hospitality/Client Comm
  { moduleOrder: 20, lessonOrder: 2, target: { dayNumber: 2 } }, // Respecting Client's Home
  { moduleOrder: 10, lessonOrder: 2, target: { dayNumber: 2 } }, // Care of Client Property
  { moduleOrder: 10, lessonOrder: 4, target: { dayNumber: 2 } }, // Cleaning Supplies & Organization

  // Day 3 — Put the Whole Home Together
  { moduleOrder: 5, lessonOrder: 4, target: { dayNumber: 3 } }, // Work Through a Home as a Team
  { moduleOrder: 14, lessonOrder: 1, target: { dayNumber: 3 } }, // What is a Dirt Code
  { moduleOrder: 14, lessonOrder: 2, target: { dayNumber: 3 } }, // Who determines the code
  { moduleOrder: 14, lessonOrder: 3, target: { dayNumber: 3 } }, // Time Expectations by Dirt Code
  { moduleOrder: 16, lessonOrder: 1, target: { dayNumber: 3 } }, // When to Call Office
  { moduleOrder: 16, lessonOrder: 2, target: { dayNumber: 3 } }, // When to Slack
  { moduleOrder: 16, lessonOrder: 3, target: { dayNumber: 3 } }, // Notes Don't Match
  { moduleOrder: 16, lessonOrder: 4, target: { dayNumber: 3 } }, // House always takes longer
  { moduleOrder: 16, lessonOrder: 11, target: { dayNumber: 3 } }, // Extra Service / 10-min rule
  { moduleOrder: 16, lessonOrder: 12, target: { dayNumber: 3 } }, // Running late, injuries, breakage
  { moduleOrder: 16, lessonOrder: 16, target: { dayNumber: 3 } }, // End of Day Final Steps

  // Day 4 — Accuracy
  { moduleOrder: 9, lessonOrder: 9, target: { dayNumber: 4 } }, // Log EXACT time
  { moduleOrder: 10, lessonOrder: 8, target: { dayNumber: 4 } }, // Check-in/out
  { moduleOrder: 13, lessonOrder: 1, target: { dayNumber: 4 } }, // Rest Breaks
  { moduleOrder: 13, lessonOrder: 2, target: { dayNumber: 4 } }, // Meal Breaks
  { moduleOrder: 25, lessonOrder: 1, target: { dayNumber: 4 } }, // Client Confidentiality

  // Day 5 — Quality
  { moduleOrder: 10, lessonOrder: 9, target: { dayNumber: 5 } }, // Quality & Breakage Expectations
  { moduleOrder: 25, lessonOrder: 21, target: { dayNumber: 5 } }, // Property Damage & Insurance
  { moduleOrder: 25, lessonOrder: 22, target: { dayNumber: 5 } }, // Re-Clean/Redo Process
  { moduleOrder: 16, lessonOrder: 13, target: { dayNumber: 5 } }, // Client Complaints
  { moduleOrder: 20, lessonOrder: 3, target: { dayNumber: 5 } }, // WOW Sheet

  // Day 6 — Efficiency (Golden Rules 6-10 already referenced on Day 1; time-expectation lessons referenced Day 3)
  { moduleOrder: 22, lessonOrder: 2, target: { dayNumber: 6 } }, // How Long Should Each Room Take

  // Day 7 — Pace
  { moduleOrder: 2, lessonOrder: 3, target: { dayNumber: 7 } }, // Time & Pay Terms (JTH/AH basics)
  { moduleOrder: 11, lessonOrder: 2, target: { dayNumber: 7 } }, // JTH/Allowed Hours
  { moduleOrder: 11, lessonOrder: 13, target: { dayNumber: 7 } }, // How Labor Hours Work

  // Day 8 — Team Flow
  { moduleOrder: 6, lessonOrder: 4, target: { dayNumber: 8 } }, // Respecting Team's Time
  { moduleOrder: 6, lessonOrder: 5, target: { dayNumber: 8 } }, // Working Solo overview

  // ── Knowledge Library — preserved, browsable, not required in Rookie Journey ──
  { moduleOrder: 7, lessonOrder: 1, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Lead Technician Authorities
  { moduleOrder: 7, lessonOrder: 2, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Lead Technician Responsibilities
  { moduleOrder: 6, lessonOrder: 3, target: { slot: "KNOWLEDGE_LIBRARY" } }, // TTB/Vacant Home Team Workflow
  { moduleOrder: 11, lessonOrder: 1, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Training Pay
  { moduleOrder: 11, lessonOrder: 3, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Weekly Tiers & Bonus Rate
  { moduleOrder: 11, lessonOrder: 4, target: { slot: "KNOWLEDGE_LIBRARY" } }, // How Bonus Is Calculated
  { moduleOrder: 11, lessonOrder: 5, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Overtime
  { moduleOrder: 11, lessonOrder: 6, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Tips
  { moduleOrder: 11, lessonOrder: 7, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Lockout Fee
  { moduleOrder: 11, lessonOrder: 8, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Last-Minute Cancellations
  { moduleOrder: 11, lessonOrder: 9, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Retirement & Benefits
  { moduleOrder: 11, lessonOrder: 10, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Quality Gate — Star Ratings
  { moduleOrder: 11, lessonOrder: 11, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Redos Come Out of Bonus
  { moduleOrder: 11, lessonOrder: 12, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Mileage Reimbursement
  { moduleOrder: 12, lessonOrder: 1, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Incentive program (all 8)
  { moduleOrder: 12, lessonOrder: 2, target: { slot: "KNOWLEDGE_LIBRARY" } },
  { moduleOrder: 12, lessonOrder: 3, target: { slot: "KNOWLEDGE_LIBRARY" } },
  { moduleOrder: 12, lessonOrder: 4, target: { slot: "KNOWLEDGE_LIBRARY" } },
  { moduleOrder: 12, lessonOrder: 5, target: { slot: "KNOWLEDGE_LIBRARY" } },
  { moduleOrder: 12, lessonOrder: 6, target: { slot: "KNOWLEDGE_LIBRARY" } },
  { moduleOrder: 12, lessonOrder: 7, target: { slot: "KNOWLEDGE_LIBRARY" } },
  { moduleOrder: 12, lessonOrder: 8, target: { slot: "KNOWLEDGE_LIBRARY" } },
  { moduleOrder: 13, lessonOrder: 3, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Meal Break Waivers
  { moduleOrder: 13, lessonOrder: 4, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Off-Duty Meaning
  { moduleOrder: 13, lessonOrder: 5, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Missed Break Premium Pay
  { moduleOrder: 13, lessonOrder: 6, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Your Responsibilities
  { moduleOrder: 13, lessonOrder: 7, target: { slot: "KNOWLEDGE_LIBRARY" } }, // No Retaliation
  { moduleOrder: 25, lessonOrder: 2, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Protected Disclosures
  { moduleOrder: 25, lessonOrder: 3, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Non-Solicitation
  { moduleOrder: 25, lessonOrder: 4, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Auto Insurance
  { moduleOrder: 25, lessonOrder: 5, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Return of Company Property
  { moduleOrder: 25, lessonOrder: 6, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Resignation & Early Release
  { moduleOrder: 25, lessonOrder: 7, target: { slot: "KNOWLEDGE_LIBRARY" } }, // New Hire Paperwork
  { moduleOrder: 25, lessonOrder: 8, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Holiday Schedule
  { moduleOrder: 25, lessonOrder: 9, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Arbitration Agreement
  { moduleOrder: 25, lessonOrder: 10, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Pay Schedule
  { moduleOrder: 25, lessonOrder: 11, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Cell Phone Stipend
  { moduleOrder: 25, lessonOrder: 12, target: { slot: "KNOWLEDGE_LIBRARY" } }, // PTO
  { moduleOrder: 25, lessonOrder: 13, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Birthday PDO
  { moduleOrder: 25, lessonOrder: 14, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Paid Sick Leave
  { moduleOrder: 25, lessonOrder: 15, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Disciplinary Process
  { moduleOrder: 25, lessonOrder: 16, target: { slot: "KNOWLEDGE_LIBRARY" } }, // EEO
  { moduleOrder: 25, lessonOrder: 17, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Harassment
  { moduleOrder: 25, lessonOrder: 18, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Non-Discrimination
  { moduleOrder: 25, lessonOrder: 19, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Sexual Harassment
  { moduleOrder: 21, lessonOrder: 1, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Advanced Cleaning & Technique
  { moduleOrder: 21, lessonOrder: 2, target: { slot: "KNOWLEDGE_LIBRARY" } },
  { moduleOrder: 21, lessonOrder: 3, target: { slot: "KNOWLEDGE_LIBRARY" } },
  { moduleOrder: 23, lessonOrder: 2, target: { slot: "KNOWLEDGE_LIBRARY" } }, // TTB Cleaning Checklist
  { moduleOrder: 23, lessonOrder: 3, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Main Difference
  { moduleOrder: 1, lessonOrder: 7, target: { slot: "KNOWLEDGE_LIBRARY" } }, // Your Journey at MCC (career path)
];

export const ROOKIE_CONTENT_SEED: RookieContentSeed[] = [
  // ───────────────────────────── DAY 1 ─────────────────────────────
  {
    key: "day1-dusting",
    dayNumber: 1,
    kind: "PRACTICAL_LESSON",
    order: 100,
    titleEn: "Dusting the Mama's Way",
    titleEs: "Sacudir el Polvo al Estilo Mama's",
    hasFutureVideoSlot: true,
    estimatedMinutes: 15,
    sourceLessonKeys: ["5-1", "5-2", "5-3"],
    bodyEn: `**What you're learning:** how MCC dusts every home, every time — the same repeatable system, not a random wipe-down.

**The steps**
- Work Top-to-Bottom, then Left-to-Right in every room — this way nothing you already cleaned gets dusty again from something above it.
- Dust everything reachable: shelves, picture frames, moldings, blinds, window sills, lamps and lampshades, furniture, baseboards, ceiling fans and light fixtures (with your extended duster).
- Move items carefully to dust underneath and behind them, then put everything back exactly where you found it — labels facing out, in an orderly fashion.
- Use both hands — it's faster and safer than working one-handed.
- Check your work before you leave the room.

**Do**
- Dust before you vacuum or mop, so anything that falls lands on a floor you're about to clean anyway.
- Protect the client's property — set items down gently, never slide or drag anything.

**Don't**
- Don't skip returning something exactly where it was — a client noticing their photo frame moved is a trust problem, not a small thing.
- Don't rush past a surface just because it "looks clean" — check it.

**Trainer demonstration:** Show the trainee one full room, narrating Top-to-Bottom / Left-to-Right out loud as you go, including how you move and replace two or three items.

**Trainee practice:** Trainee dusts a room on their own while the trainer watches, then the trainer points out anything missed.

**This connects to your Day 1 field checkoff:** Dusting, Top-to-Bottom, Left-to-Right, Uses Both Hands, Returns Items Correctly.

**Video:** A real MCC demonstration video will be added here later. This lesson works completely without one.`,
    bodyEs: `**Lo que estás aprendiendo:** cómo MCC sacude el polvo en cada casa, cada vez — el mismo sistema repetible, no una limpiada al azar.

**Los pasos**
- Trabaja de Arriba Hacia Abajo y luego de Izquierda a Derecha en cada habitación — así nada de lo que ya limpiaste se vuelve a empolvar por algo de arriba.
- Sacude todo lo que esté a tu alcance: repisas, marcos de fotos, molduras, persianas, alféizares de ventanas, lámparas y sus pantallas, muebles, zócalos, ventiladores y lámparas de techo (con tu plumero extensible).
- Mueve los objetos con cuidado para sacudir debajo y detrás de ellos, y luego regresa todo exactamente a donde lo encontraste — con las etiquetas hacia afuera, de forma ordenada.
- Usa ambas manos — es más rápido y más seguro que trabajar con una sola mano.
- Revisa tu trabajo antes de salir de la habitación.

**Sí**
- Sacude el polvo antes de aspirar o trapear, así cualquier cosa que caiga termina en un piso que de todas formas vas a limpiar.
- Protege las pertenencias del cliente — coloca los objetos con cuidado, nunca los deslices ni los arrastres.

**No**
- No dejes de regresar algo exactamente a donde estaba — que un cliente note que su portarretratos se movió es un problema de confianza, no un detalle menor.
- No te apresures en una superficie solo porque "se ve limpia" — revísala.

**Demostración del capacitador:** Muestra al aprendiz una habitación completa, narrando en voz alta "Arriba Hacia Abajo / Izquierda a Derecha" mientras avanzas, incluyendo cómo mueves y regresas dos o tres objetos.

**Práctica del aprendiz:** El aprendiz sacude una habitación por su cuenta mientras el capacitador observa, y luego señala lo que se haya pasado.

**Esto se conecta con tu evaluación de campo del Día 1:** Sacudir el Polvo, De Arriba Hacia Abajo, De Izquierda a Derecha, Usa Ambas Manos, Regresa los Artículos Correctamente.

**Video:** Más adelante se agregará aquí un video real de demostración de MCC. Esta lección funciona completamente sin uno por ahora.`,
  },
  {
    key: "day1-floors",
    dayNumber: 1,
    kind: "PRACTICAL_LESSON",
    order: 101,
    titleEn: "Floors the Mama's Way",
    titleEs: "Pisos al Estilo Mama's",
    hasFutureVideoSlot: true,
    estimatedMinutes: 15,
    sourceLessonKeys: ["15-1", "15-2"],
    bodyEn: `**What you're learning:** how MCC vacuums and mops so floors get done efficiently and safely, in the right order.

**The steps**
- Prep first: make sure your vacuum and mop bucket are ready before you start the room, so you're not stopping mid-task.
- Assess the floor type in each room — hardwood needs the clear pH-neutral cleaner; every other floor uses the purple floor cleaner (never mix them up, using the wrong product can damage the floor).
- Vacuum edges and corners first, then work an efficient sequence across the rest of the room so you don't crisscross or double back.
- Move room to room in one direction — plan your path before you start so you're not walking back through a room you already finished.
- Never carry a vacuum on stairs one-handed, and never operate electrical equipment on a wet floor.
- Mop last, after everything else in the room is done, working backward toward the doorway so you don't walk on a wet floor you just mopped.
- Avoid cross-contamination — don't carry a bathroom mop head or rag into a kitchen, and vice versa.
- Final inspection: check corners, edges, and baseboards for anything the vacuum or mop missed.

**Do**
- Match the product to the floor. When in doubt, check the product reference before using anything on hardwood.
- Work yourself out of the room, ending near the door.

**Don't**
- Don't mop yourself into a corner with no way out except walking on the wet floor.
- Don't use the purple floor cleaner on natural hardwood.

**Trainer demonstration:** Trainer vacuums and mops one full room start to finish, narrating the floor-type check and the "always end near the door" rule.

**Trainee practice:** Trainee vacuums and mops a room solo; trainer checks corners/edges and confirms the right product was used for the floor type.

**This connects to your Day 1 field checkoff:** Floors/Vacuuming, Mopping, Tool Setup, Final Quality Check.

**Video:** A real MCC demonstration video will be added here later. This lesson works completely without one.`,
    bodyEs: `**Lo que estás aprendiendo:** cómo MCC aspira y trapea para que los pisos queden bien hechos de forma eficiente y segura, en el orden correcto.

**Los pasos**
- Prepárate primero: asegúrate de que tu aspiradora y tu cubeta de trapeado estén listas antes de empezar la habitación, para no detenerte a la mitad.
- Evalúa el tipo de piso en cada habitación — la madera necesita el limpiador transparente pH neutro; todos los demás pisos usan el limpiador morado (nunca los confundas, usar el producto equivocado puede dañar el piso).
- Aspira las orillas y esquinas primero, y luego sigue una secuencia eficiente por el resto de la habitación para no cruzar el mismo camino dos veces.
- Muévete de habitación en habitación en una sola dirección — planea tu recorrido antes de empezar para no tener que volver a pasar por una habitación ya terminada.
- Nunca cargues la aspiradora en escaleras con una sola mano, y nunca uses equipo eléctrico sobre un piso mojado.
- Trapea al final, después de terminar todo lo demás en la habitación, retrocediendo hacia la puerta para no caminar sobre el piso recién trapeado.
- Evita la contaminación cruzada — no lleves un trapeador o trapo de baño a la cocina, ni viceversa.
- Inspección final: revisa esquinas, orillas y zócalos por si la aspiradora o el trapeador dejaron algo.

**Sí**
- Usa el producto correcto según el tipo de piso. Si tienes dudas, revisa la referencia de productos antes de usar algo en madera.
- Trabaja saliendo de la habitación, terminando cerca de la puerta.

**No**
- No te trapees hacia una esquina sin salida más que caminando sobre el piso mojado.
- No uses el limpiador morado en madera natural.

**Demostración del capacitador:** El capacitador aspira y trapea una habitación completa de principio a fin, narrando la revisión del tipo de piso y la regla de "siempre termina cerca de la puerta".

**Práctica del aprendiz:** El aprendiz aspira y trapea una habitación solo; el capacitador revisa esquinas/orillas y confirma que se usó el producto correcto según el tipo de piso.

**Esto se conecta con tu evaluación de campo del Día 1:** Pisos/Aspirado, Trapeado, Preparación de Herramientas, Revisión Final de Calidad.

**Video:** Más adelante se agregará aquí un video real de demostración de MCC. Esta lección funciona completamente sin uno por ahora.`,
  },
  {
    key: "day1-bathroom",
    dayNumber: 1,
    kind: "PRACTICAL_LESSON",
    order: 102,
    titleEn: "How MCC Cleans a Bathroom",
    titleEs: "Cómo MCC Limpia un Baño",
    hasFutureVideoSlot: true,
    estimatedMinutes: 20,
    sourceLessonKeys: ["15-1", "15-8", "15-11"],
    bodyEn: `**What you're learning:** the full MCC bathroom sequence, start to finish. This replaces having to piece it together from several modules.

**The sequence**
1. **Assess & set up** — bring in your bathroom supplies (blue bathroom spray, toilet bowl cleaner, green glass cleaner, BKF liquid, pumice stone if needed — wet only) and check for anything unusual before you start.
2. **Top-to-Bottom** — start with anything overhead (light fixtures, exhaust fan) before you work down to counters and floors.
3. **Left-to-Right** — pick a starting point and move around the room in one direction so nothing gets skipped or double-cleaned.
4. **Shower/tub** — use blue bathroom spray (contains vinegar — shower surfaces only), scrub with a grout brush where needed, use a wet pumice stone on any tough rings.
5. **Toilet** — use the dedicated dark-blue toilet bowl cleaner (never the blue bathroom spray) inside the bowl; wipe down the exterior and base.
6. **Sink & counter** — BKF liquid for the sink basin, blue spray or the appropriate counter product for the counter itself.
7. **Mirror** — green glass cleaner, buffed streak-free.
8. **Fixtures & details** — faucets, handles, towel bars — wiped down and shined.
9. **Floors** — vacuum, then mop last, working backward out of the room.
10. **Reset** — return every bottle, towel, and item to exactly where you found it.
11. **Inspect** — stand back and check the whole room before moving on.

**Product/surface safety:** never combine bleach and ammonia, bleach and vinegar, or hydrogen peroxide and vinegar — this can create dangerous gases. If you ever notice fumes or an unexpected reaction, stop, ventilate the area, and notify your Service Manager immediately.

**Do**
- Follow the sequence in order every time — it's what makes you fast without missing anything.
- Use the pumice stone wet, never dry.

**Don't**
- Don't use the blue bathroom spray inside the toilet bowl — that's what the dedicated toilet cleaner is for.
- Don't climb into a tall shower to clean it.

**Trainer demonstration:** Trainer runs the full sequence in one bathroom, calling out each step by name.

**Trainee practice:** Trainee cleans a full bathroom using the sequence; trainer checks the final result against the 11 steps above.

**This connects to your Day 1 field checkoff:** Bathroom, Top-to-Bottom, Left-to-Right, Chemical Safety, Final Quality Check.

**Video:** One real MCC bathroom demonstration video will be added here later. This lesson works completely without one. (The three original placeholder bathroom lessons still exist in the full Academy and are unaffected.)`,
    bodyEs: `**Lo que estás aprendiendo:** la secuencia completa de MCC para limpiar un baño, de principio a fin. Esto reemplaza tener que armarla juntando varios módulos.

**La secuencia**
1. **Evalúa y prepárate** — trae tus productos de baño (spray azul de baño, limpiador de inodoro, limpiador verde de vidrios, líquido BKF, piedra pómez si hace falta — solo mojada) y revisa si hay algo fuera de lo normal antes de empezar.
2. **De Arriba Hacia Abajo** — empieza por lo que esté arriba (luces, extractor) antes de bajar a los mostradores y pisos.
3. **De Izquierda a Derecha** — elige un punto de inicio y muévete en una sola dirección por la habitación para que nada se salte o se limpie dos veces.
4. **Regadera/tina** — usa el spray azul de baño (contiene vinagre — solo superficies de regadera), talla con un cepillo de lechada donde haga falta, usa la piedra pómez mojada para manchas difíciles.
5. **Inodoro** — usa el limpiador de inodoro dedicado (azul oscuro, nunca el spray azul de baño) por dentro; limpia el exterior y la base por fuera.
6. **Lavabo y mostrador** — líquido BKF para el lavabo, spray azul o el producto adecuado para el mostrador.
7. **Espejo** — limpiador verde de vidrios, pulido sin rayas.
8. **Accesorios y detalles** — llaves, manijas, toalleros — limpios y brillantes.
9. **Pisos** — aspira, luego trapea al final, retrocediendo hacia afuera de la habitación.
10. **Reinicio** — regresa cada botella, toalla y objeto exactamente a donde lo encontraste.
11. **Inspecciona** — da un paso atrás y revisa toda la habitación antes de seguir.

**Seguridad de productos/superficies:** nunca combines cloro y amoniaco, cloro y vinagre, o peróxido de hidrógeno y vinagre — esto puede crear gases peligrosos. Si notas humos o una reacción inesperada, detente, ventila el área y notifica a tu Gerente de Servicio de inmediato.

**Sí**
- Sigue la secuencia en orden cada vez — es lo que te hace rápido sin dejar nada pasar.
- Usa la piedra pómez mojada, nunca seca.

**No**
- No uses el spray azul de baño dentro del inodoro — para eso es el limpiador dedicado.
- No te subas a una regadera alta para limpiarla.

**Demostración del capacitador:** El capacitador realiza la secuencia completa en un baño, nombrando cada paso en voz alta.

**Práctica del aprendiz:** El aprendiz limpia un baño completo siguiendo la secuencia; el capacitador revisa el resultado final contra los 11 pasos anteriores.

**Esto se conecta con tu evaluación de campo del Día 1:** Baño, De Arriba Hacia Abajo, De Izquierda a Derecha, Seguridad con Químicos, Revisión Final de Calidad.

**Video:** Más adelante se agregará aquí un video real de demostración de un baño de MCC. Esta lección funciona completamente sin uno por ahora. (Las tres lecciones de baño originales tipo placeholder siguen existiendo en la Academia completa y no se ven afectadas.)`,
  },

  // ───────────────────────────── DAY 2 ─────────────────────────────
  {
    key: "day2-kitchen",
    dayNumber: 2,
    kind: "PRACTICAL_LESSON",
    order: 100,
    titleEn: "How MCC Cleans a Kitchen",
    titleEs: "Cómo MCC Limpia una Cocina",
    hasFutureVideoSlot: true,
    estimatedMinutes: 20,
    sourceLessonKeys: ["18-2", "15-1"],
    bodyEn: `**What you're learning:** the full MCC kitchen sequence, including MCC's exact dirty-dishes policy.

**The sequence**
1. **Assess & set up** — bring in yellow degreaser, red multipurpose spray, BKF liquid, stainless steel cleaner, and Dawn dish soap.
2. **Top-to-Bottom** — cabinet tops and upper areas before counters, counters before floors.
3. **Left-to-Right** — work around the kitchen in one direction.
4. **Counters** — red multipurpose spray, sponge first then finish with a rag (Golden Rule 9).
5. **Sink** — BKF liquid, scrubbed and disinfected.
6. **Appliance exteriors** — stainless steel cleaner for stainless surfaces; wipe down the outside of the fridge, oven, dishwasher, microwave (inside the microwave is also cleaned as part of the standard checklist).
7. **Stovetop & drip pans** — yellow degreaser, scrubbed.
8. **Cabinet/detail work** — as applicable per the job notes.
9. **Moving/replacing items** — same care as any other room: move gently, return exactly where found.
10. **Dirty dishes in the sink:** load them into the dishwasher. If the dishwasher already has clean dishes in it, empty the clean ones first, then load the dirty ones.
11. **Floors** — vacuum, then mop last, working backward out of the kitchen.
12. **Reset & final inspection.**

**Product/surface safety:** double-check you're using the right product for the surface — stainless steel cleaner is for appliances/fixtures only, not countertops.

**Do**
- Always empty a dishwasher full of clean dishes before loading dirty ones in.
- Sponge then rag on every countertop.

**Don't**
- Don't leave dirty dishes in the sink instead of dealing with them per policy.
- Don't use degreaser on a surface it's not meant for.

**Trainer demonstration:** Trainer runs the full sequence in one kitchen, including handling dirty dishes correctly.

**Trainee practice:** Trainee cleans a full kitchen using the sequence; trainer checks the dishwasher was handled correctly and the sequence was followed.

**This connects to your Day 2 field checkoff:** Kitchen, Complete Room Flow, Final Quality Check.

**Video:** One real MCC kitchen demonstration video will be added here later. This lesson works completely without one. (The original kitchen placeholder lesson still exists in the full Academy and is unaffected.)`,
    bodyEs: `**Lo que estás aprendiendo:** la secuencia completa de MCC para la cocina, incluyendo la política exacta de MCC sobre platos sucios.

**La secuencia**
1. **Evalúa y prepárate** — trae el desengrasante amarillo, spray multiusos rojo, líquido BKF, limpiador de acero inoxidable y jabón Dawn.
2. **De Arriba Hacia Abajo** — la parte superior de los gabinetes antes que los mostradores, los mostradores antes que los pisos.
3. **De Izquierda a Derecha** — recorre la cocina en una sola dirección.
4. **Mostradores** — spray multiusos rojo, esponja primero y luego termina con un trapo (Regla de Oro 9).
5. **Lavabo** — líquido BKF, tallado y desinfectado.
6. **Exteriores de aparatos** — limpiador de acero inoxidable para superficies de acero; limpia el exterior del refrigerador, horno, lavavajillas, microondas (el interior del microondas también se limpia según la lista estándar).
7. **Estufa y charolas** — desengrasante amarillo, tallado.
8. **Trabajo de detalle en gabinetes** — según lo indiquen las notas del trabajo.
9. **Mover y regresar objetos** — el mismo cuidado que en cualquier otra habitación: mueve con cuidado, regresa exactamente a donde lo encontraste.
10. **Platos sucios en el fregadero:** cárgalos en el lavavajillas. Si el lavavajillas ya tiene platos limpios, primero vacíalos, y luego carga los sucios.
11. **Pisos** — aspira, luego trapea al final, retrocediendo hacia afuera de la cocina.
12. **Reinicio e inspección final.**

**Seguridad de productos/superficies:** verifica dos veces que estás usando el producto correcto para la superficie — el limpiador de acero inoxidable es solo para aparatos/accesorios, no para mostradores.

**Sí**
- Siempre vacía un lavavajillas lleno de platos limpios antes de meter los sucios.
- Esponja y luego trapo en cada mostrador.

**No**
- No dejes platos sucios en el fregadero en lugar de seguir la política.
- No uses desengrasante en una superficie para la que no está pensado.

**Demostración del capacitador:** El capacitador realiza la secuencia completa en una cocina, incluyendo el manejo correcto de platos sucios.

**Práctica del aprendiz:** El aprendiz limpia una cocina completa siguiendo la secuencia; el capacitador revisa que el lavavajillas se haya manejado correctamente y que se haya seguido la secuencia.

**Esto se conecta con tu evaluación de campo del Día 2:** Cocina, Flujo Completo de Habitación, Revisión Final de Calidad.

**Video:** Más adelante se agregará aquí un video real de demostración de una cocina de MCC. Esta lección funciona completamente sin uno por ahora. (La lección de cocina original tipo placeholder sigue existiendo en la Academia completa y no se ve afectada.)`,
  },
  {
    key: "day2-bedrooms-living",
    dayNumber: 2,
    kind: "PRACTICAL_LESSON",
    order: 101,
    titleEn: "Bedrooms & Living Areas — The Mama's Way",
    titleEs: "Recámaras y Salas — Al Estilo Mama's",
    hasFutureVideoSlot: true,
    estimatedMinutes: 15,
    sourceLessonKeys: ["5-1", "5-2", "5-3"],
    bodyEn: `**What you're learning:** how MCC handles bedrooms and living areas — mostly dry-area work, but with its own detail points.

**The sequence**
1. **Assess & plan** — note anything unusual (kids' rooms, home offices, pet areas) before you start.
2. **Top-to-Bottom** — ceiling fans/light fixtures, then shelves and surfaces, then floors last.
3. **Left-to-Right** — one direction around the room.
4. **Dusting** — every reachable surface: dressers, nightstands, shelves, picture frames, blinds, baseboards.
5. **Furniture & property care** — dust and lightly polish furniture; never slide or drag anything across the floor.
6. **Moving/replacing items** — same rule as everywhere else: exactly where you found it, labels facing out.
7. **Beds** — make the bed; change sheets only if the job notes specifically request it.
8. **Mirrors** — green glass cleaner, streak-free.
9. **Details** — lamps, knick-knacks, closet doors.
10. **Floors** — vacuum, then mop if applicable, working backward out of the room.
11. **Reset & final inspection.**

**Do**
- Treat kids' rooms and cluttered spaces with the same care as any other room — ask the client if unsure about anything that looks out of place.
- Keep bedroom doors closed if you found them closed and the client isn't home to ask (see the Field Scenarios lessons).

**Don't**
- Don't assume you should tidy up personal clutter beyond what's on the work order.
- Don't skip checking under/behind furniture just because it's more work — that's exactly where dust hides.

**Trainer demonstration:** Trainer runs the sequence in one bedroom and one living area, pointing out the property-care rule while moving furniture and decor.

**Trainee practice:** Trainee cleans a bedroom and a living area using the sequence; trainer checks the bed, dusting, and reset.

**This connects to your Day 2 field checkoff:** Bedroom, Living Area, Returns Items Correctly, Final Quality Check.

**Video:** One real MCC demonstration video will be added here later. This lesson works completely without one. (The three original placeholder lessons for this room type still exist in the full Academy and are unaffected.)`,
    bodyEs: `**Lo que estás aprendiendo:** cómo MCC maneja las recámaras y las salas — principalmente trabajo de área seca, pero con sus propios puntos de detalle.

**La secuencia**
1. **Evalúa y planea** — nota cualquier cosa fuera de lo normal (cuartos de niños, oficinas en casa, áreas de mascotas) antes de empezar.
2. **De Arriba Hacia Abajo** — ventiladores/lámparas de techo, luego repisas y superficies, y los pisos al final.
3. **De Izquierda a Derecha** — una sola dirección alrededor de la habitación.
4. **Sacudir el polvo** — toda superficie a tu alcance: cómodas, mesas de noche, repisas, marcos de fotos, persianas, zócalos.
5. **Cuidado de muebles y pertenencias** — sacude y pule ligeramente los muebles; nunca deslices ni arrastres nada por el piso.
6. **Mover y regresar objetos** — la misma regla que en todas partes: exactamente a donde lo encontraste, etiquetas hacia afuera.
7. **Camas** — tiende la cama; cambia las sábanas solo si las notas del trabajo lo piden específicamente.
8. **Espejos** — limpiador verde de vidrios, sin rayas.
9. **Detalles** — lámparas, adornos, puertas de clóset.
10. **Pisos** — aspira, luego trapea si aplica, retrocediendo hacia afuera de la habitación.
11. **Reinicio e inspección final.**

**Sí**
- Trata los cuartos de niños y espacios con más objetos con el mismo cuidado que cualquier otra habitación — pregunta al cliente si tienes dudas sobre algo que se ve fuera de lugar.
- Deja las puertas de las recámaras cerradas si las encontraste cerradas y el cliente no está para preguntar (ver las lecciones de Escenarios de Campo).

**No**
- No asumas que debes ordenar objetos personales más allá de lo que dice la orden de trabajo.
- No te saltes revisar debajo o detrás de los muebles solo porque es más trabajo — ahí es justo donde se esconde el polvo.

**Demostración del capacitador:** El capacitador realiza la secuencia en una recámara y una sala, señalando la regla de cuidado de pertenencias mientras mueve muebles y decoración.

**Práctica del aprendiz:** El aprendiz limpia una recámara y una sala siguiendo la secuencia; el capacitador revisa la cama, el sacudido y el reinicio.

**Esto se conecta con tu evaluación de campo del Día 2:** Recámara, Sala, Regresa los Artículos Correctamente, Revisión Final de Calidad.

**Video:** Más adelante se agregará aquí un video real de demostración de MCC. Esta lección funciona completamente sin uno por ahora. (Las tres lecciones originales tipo placeholder para este tipo de habitación siguen existiendo en la Academia completa y no se ven afectadas.)`,
  },
  {
    key: "day2-complete-room-flow",
    dayNumber: 2,
    kind: "PRACTICAL_LESSON",
    order: 102,
    titleEn: "Complete Room Flow",
    titleEs: "Flujo Completo de Habitación",
    hasFutureVideoSlot: true,
    estimatedMinutes: 15,
    sourceLessonKeys: ["6-1", "6-2", "20-1", "20-2", "10-4"],
    bodyEn: `**Why this lesson matters:** the goal is for you to stop thinking of cleaning as a list of unrelated chores, and instead follow ONE repeatable MCC system for any room, every time.

**The flow**

STOP → LOOK → PLAN → TOP-TO-BOTTOM → LEFT-TO-RIGHT → DETAIL → FLOORS → RESET → INSPECT → EXIT

- **STOP** — pause at the doorway before touching anything.
- **LOOK** — take in the whole room: what's here, what's unusual, what the job notes say about it.
- **PLAN** — decide your path through the room so you never backtrack.
- **TOP-TO-BOTTOM** — ceiling down to counters/furniture.
- **LEFT-TO-RIGHT** — one direction, no crisscrossing.
- **DETAIL** — the specific things this room type needs (see Dusting, Floors, Bathroom, Kitchen, or Bedrooms & Living Areas for the specifics).
- **FLOORS** — always last in the room.
- **RESET** — everything back exactly where you found it.
- **INSPECT** — check your own work before you consider the room done.
- **EXIT** — move to the next room without walking back through this one.

**Keep your tools organized in your caddy or bag while in the client's home** — never set cloths or products directly on floors or furniture; return items to the caddy when not in use.

**Trainer demonstration:** WATCH ME — trainer runs the full flow out loud in one room, naming each step as they do it.

**Trainee practice:** NOW YOU DO IT — trainee runs the same flow in a different room. GET COACHED — trainer gives feedback on anything skipped or out of order. REPEAT — trainee runs it again in a third room without prompting.

**This connects to your Day 2 field checkoff:** Complete Room Flow, Team Flow, Care of Client Property, Final Quality Check.

**Video:** A future video could show a complete room start to finish using this flow. This lesson works completely without one.`,
    bodyEs: `**Por qué importa esta lección:** el objetivo es que dejes de pensar en la limpieza como una lista de tareas sueltas, y en su lugar sigas UN solo sistema repetible de MCC para cualquier habitación, cada vez.

**El flujo**

DETENTE → OBSERVA → PLANEA → ARRIBA HACIA ABAJO → IZQUIERDA A DERECHA → DETALLE → PISOS → REINICIO → INSPECCIONA → SAL

- **DETENTE** — haz una pausa en la puerta antes de tocar nada.
- **OBSERVA** — mira toda la habitación: qué hay, qué es inusual, qué dicen las notas del trabajo sobre ella.
- **PLANEA** — decide tu recorrido por la habitación para nunca retroceder.
- **ARRIBA HACIA ABAJO** — del techo hacia los mostradores/muebles.
- **IZQUIERDA A DERECHA** — una sola dirección, sin cruzar el mismo camino.
- **DETALLE** — lo específico que necesita este tipo de habitación (ver Sacudir el Polvo, Pisos, Baño, Cocina, o Recámaras y Salas para los detalles).
- **PISOS** — siempre al final en la habitación.
- **REINICIO** — todo de vuelta exactamente a donde lo encontraste.
- **INSPECCIONA** — revisa tu propio trabajo antes de dar la habitación por terminada.
- **SAL** — pasa a la siguiente habitación sin volver a cruzar esta.

**Mantén tus herramientas organizadas en tu caja o bolsa mientras estés en la casa del cliente** — nunca coloques trapos o productos directamente en pisos o muebles; regresa los objetos a la caja cuando no los uses.

**Demostración del capacitador:** OBSÉRVAME — el capacitador realiza el flujo completo en voz alta en una habitación, nombrando cada paso mientras lo hace.

**Práctica del aprendiz:** AHORA HAZLO TÚ — el aprendiz realiza el mismo flujo en otra habitación. RECIBE RETROALIMENTACIÓN — el capacitador da comentarios sobre lo que se haya saltado o hecho fuera de orden. REPITE — el aprendiz lo realiza de nuevo en una tercera habitación sin que se lo indiquen.

**Esto se conecta con tu evaluación de campo del Día 2:** Flujo Completo de Habitación, Flujo en Equipo, Cuidado de las Pertenencias del Cliente, Revisión Final de Calidad.

**Video:** Un video futuro podría mostrar una habitación completa de principio a fin usando este flujo. Esta lección funciona completamente sin uno por ahora.`,
  },

  // ───────────────────────────── DAY 3 ─────────────────────────────
  {
    key: "day3-complete-home-flow",
    dayNumber: 3,
    kind: "PRACTICAL_LESSON",
    order: 100,
    titleEn: "Complete Home Flow",
    titleEs: "Flujo Completo del Hogar",
    hasFutureVideoSlot: false,
    estimatedMinutes: 15,
    sourceLessonKeys: ["6-2", "16-1", "16-2", "16-16"],
    bodyEn: `**Why this lesson matters:** this connects everything you learned on Days 1 and 2 into how a whole home actually gets cleaned, top to bottom, as a team.

**The flow**

ARRIVAL → TCS/NOTES → ASSESS → PLAN → TEAM SPLIT → CLEAN ASSIGNED AREAS → KITCHEN/BATHROOMS → FLOORS → RESET → QUALITY CHECK → PARTNER CHECK → SUPPLIES → CLIENT/EXIT → TCS

- **ARRIVAL** — both partners arrive together; the first to arrive is the Team Lead for the day.
- **TCS/NOTES** — read every note before starting: entrance instructions, pets, client sensitivities, room-by-room notes, anything limiting scope.
- **ASSESS** — confirm the Dirt Code matches what's in the notes; Slack the office if it doesn't.
- **PLAN** — agree who's taking wet areas (kitchen, bathrooms, mopping) and who's taking dry areas (bedrooms, living areas, dusting, vacuuming).
- **TEAM SPLIT** — work your assigned areas using the Complete Room Flow from Day 2, top floor down to the first floor.
- **CLEAN ASSIGNED AREAS / KITCHEN-BATHROOMS** — each partner applies the practical lessons from Days 1-2 in their assigned rooms.
- **FLOORS** — always last, room by room.
- **RESET** — everything back in place, everywhere.
- **QUALITY CHECK** — check your own work before calling anything done.
- **PARTNER CHECK** — whoever finishes first helps the other finish; check each other's work.
- **SUPPLIES** — gather everything, nothing left behind.
- **CLIENT/EXIT** — final walkthrough if the client is home; thank them for their business.
- **TCS** — check out of the job in TCS/Slack before leaving.

**Along the way, know when to escalate:** call the office immediately for anything urgent or unsafe; Slack the office for anything else non-emergency (running late, incorrect notes, equipment problems). If the notes don't match the home at all, stop and confirm with the office before starting.

**This is a text/diagram lesson plus a trainer demonstration in an actual home — it does not need its own video.**

**Field expectation for today:** you must be given meaningful responsibility without step-by-step prompting. At least one complete area should be planned, cleaned, reset, and inspected primarily by you.

**This connects to your Day 3 field checkoff:** Complete Home Flow, Complete Room Flow, Team Flow, TCS Usage, Office Escalation, Speed With Purpose, Client Etiquette, Final Quality Check.

**Today ends with your Day 3 Readiness Check** — your trainer will mark you Ready for Rookie Schedule, Ready With Coaching, or needing Additional Trainer Time. This is not a certification.`,
    bodyEs: `**Por qué importa esta lección:** esto conecta todo lo que aprendiste en los Días 1 y 2 con cómo realmente se limpia una casa completa, de arriba abajo, en equipo.

**El flujo**

LLEGADA → TCS/NOTAS → EVALÚA → PLANEA → DIVISIÓN DE EQUIPO → LIMPIA ÁREAS ASIGNADAS → COCINA/BAÑOS → PISOS → REINICIO → REVISIÓN DE CALIDAD → REVISIÓN DE COMPAÑERO → SUMINISTROS → CLIENTE/SALIDA → TCS

- **LLEGADA** — ambos compañeros llegan juntos; el primero en llegar es el Team Lead del día.
- **TCS/NOTAS** — lee cada nota antes de empezar: instrucciones de entrada, mascotas, sensibilidades del cliente, notas por habitación, cualquier cosa que limite el alcance.
- **EVALÚA** — confirma que el Dirt Code coincida con lo que dicen las notas; manda Slack a la oficina si no coincide.
- **PLANEA** — acuerden quién toma las áreas húmedas (cocina, baños, trapeado) y quién toma las áreas secas (recámaras, salas, sacudido, aspirado).
- **DIVISIÓN DE EQUIPO** — trabajen sus áreas asignadas usando el Flujo Completo de Habitación del Día 2, del piso de arriba hacia el de abajo.
- **LIMPIA ÁREAS ASIGNADAS / COCINA-BAÑOS** — cada compañero aplica las lecciones prácticas de los Días 1-2 en sus habitaciones asignadas.
- **PISOS** — siempre al final, habitación por habitación.
- **REINICIO** — todo de vuelta en su lugar, en todas partes.
- **REVISIÓN DE CALIDAD** — revisa tu propio trabajo antes de dar algo por terminado.
- **REVISIÓN DE COMPAÑERO** — quien termine primero ayuda al otro a terminar; revisen el trabajo del otro.
- **SUMINISTROS** — reúnan todo, no dejen nada olvidado.
- **CLIENTE/SALIDA** — recorrido final si el cliente está en casa; agradécele su preferencia.
- **TCS** — registren la salida del trabajo en TCS/Slack antes de irse.

**En el camino, sabe cuándo escalar:** llama a la oficina de inmediato para cualquier cosa urgente o insegura; manda Slack a la oficina para cualquier otra cosa que no sea emergencia (llegar tarde, notas incorrectas, problemas de equipo). Si las notas no coinciden con la casa en absoluto, detente y confirma con la oficina antes de empezar.

**Esta es una lección de texto/diagrama más una demostración del capacitador en una casa real — no necesita su propio video.**

**Expectativa de campo para hoy:** se te debe dar responsabilidad real sin que te guíen paso a paso. Al menos un área completa debe ser planeada, limpiada, reiniciada e inspeccionada principalmente por ti.

**Esto se conecta con tu evaluación de campo del Día 3:** Flujo Completo del Hogar, Flujo Completo de Habitación, Flujo en Equipo, Uso de TCS, Escalación a la Oficina, Velocidad con Propósito, Etiqueta con el Cliente, Revisión Final de Calidad.

**Hoy termina con tu Evaluación de Preparación del Día 3** — tu capacitador te marcará como Listo para el Horario Rookie, Listo con Apoyo, o que necesitas Tiempo Adicional del Capacitador. Esto no es una certificación.`,
  },

  // ───────────────────────────── DAY 9 SCENARIOS ─────────────────────────────
  {
    key: "day9-scenario-cant-get-in",
    dayNumber: 9,
    kind: "SCENARIO",
    order: 100,
    titleEn: "Scenario: You Can't Get Into the Home",
    titleEs: "Escenario: No Puedes Entrar a la Casa",
    sourceLessonKeys: ["16-6"],
    promptEn:
      "You arrive at a recurring client's home. You knock, ring the doorbell, and check for a hidden key — nothing works, and it's been a few minutes. What would you do?",
    promptEs:
      "Llegas a la casa de un cliente recurrente. Tocas, timbras y revisas si hay una llave escondida — nada funciona, y ya han pasado varios minutos. ¿Qué harías?",
    revealEn:
      "Check TCS for entry instructions and check if the door is unlocked (if so, announce yourself and do a routine house tour to check if anyone's home). Allow at least 5 minutes total, then contact the office via Slack if you still can't get in. Never force entry, and never just leave without notifying the office.",
    revealEs:
      "Revisa TCS por instrucciones de entrada y verifica si la puerta está abierta (si es así, anúnciate y haz un recorrido de rutina para ver si hay alguien en casa). Espera al menos 5 minutos en total, y luego contacta a la oficina por Slack si sigues sin poder entrar. Nunca fuerces la entrada, y nunca te vayas sin avisar a la oficina.",
    bodyEn: "",
    bodyEs: "",
  },
  {
    key: "day9-scenario-pet-issue",
    dayNumber: 9,
    kind: "SCENARIO",
    order: 101,
    titleEn: "Scenario: An Aggressive Pet Is Loose",
    titleEs: "Escenario: Hay una Mascota Agresiva Suelta",
    sourceLessonKeys: ["16-8"],
    promptEn:
      "You enter a home and hear a dog barking aggressively somewhere inside — it doesn't sound crated, and no one else appears to be home. What would you do?",
    promptEs:
      "Entras a una casa y escuchas a un perro ladrando de forma agresiva en algún lugar adentro — no suena como si estuviera enjaulado, y parece que no hay nadie más en casa. ¿Qué harías?",
    revealEn:
      "Do NOT enter. Go back to your car and call the office for further instructions. Always check the work order for pet notes before entering any home with pets — aggressive animals should be crated according to the notes. If a pet is later found locked in a specific room, don't clean that room (unless the client, if home, confirms it's fine).",
    revealEs:
      "NO entres. Regresa a tu carro y llama a la oficina para más instrucciones. Siempre revisa la orden de trabajo por notas sobre mascotas antes de entrar a cualquier casa con mascotas — los animales agresivos deben estar enjaulados según las notas. Si después encuentras una mascota encerrada en una habitación específica, no limpies esa habitación (a menos que el cliente, si está en casa, confirme que está bien).",
    bodyEn: "",
    bodyEs: "",
  },
  {
    key: "day9-scenario-extra-service",
    dayNumber: 9,
    kind: "SCENARIO",
    order: 102,
    titleEn: "Scenario: Client Asks for Something Extra",
    titleEs: "Escenario: El Cliente Pide Algo Extra",
    sourceLessonKeys: ["16-11"],
    promptEn:
      "A client who's home asks you to also clean out their garage, which isn't on the work order. What would you do?",
    promptEs:
      "Un cliente que está en casa te pide que también limpies su garaje, algo que no está en la orden de trabajo. ¿Qué harías?",
    revealEn:
      'Kindly ask if they already notified the office. If not, and the request would take MORE than 10 minutes, let them know they\'ll need to call the office first so it can be scheduled properly. If it would take LESS than 10 minutes, check in with your Service Manager to confirm you\'re able to do it before starting. A good line: "Let me check with my service manager on this — I don\'t see it on my work order."',
    revealEs:
      'Pregúntale amablemente si ya avisó a la oficina. Si no lo ha hecho, y la tarea tomaría MÁS de 10 minutos, dile que necesita llamar a la oficina primero para que se pueda programar correctamente. Si tomaría MENOS de 10 minutos, confirma con tu Gerente de Servicio antes de empezar. Una buena frase: "Permítame confirmar esto con mi gerente de servicio — no lo veo en mi orden de trabajo."',
    bodyEn: "",
    bodyEs: "",
  },
  {
    key: "day9-scenario-notes-dont-match",
    dayNumber: 9,
    kind: "SCENARIO",
    order: 103,
    titleEn: "Scenario: TCS Notes Don't Match the Home",
    titleEs: "Escenario: Las Notas de TCS No Coinciden con la Casa",
    sourceLessonKeys: ["16-3"],
    promptEn:
      "You arrive and the home doesn't match what's described in TCS at all — different layout, different Dirt Code, maybe even a different address feel. What would you do?",
    promptEs:
      "Llegas y la casa no coincide para nada con lo descrito en TCS — otro diseño, otro Dirt Code, hasta se siente como una dirección diferente. ¿Qué harías?",
    revealEn:
      "Confirm you're at the correct address, confirm the client's name, contact the office immediately via Slack, and wait for instructions before starting. Never guess or assume which notes belong to the home.",
    revealEs:
      "Confirma que estás en la dirección correcta, confirma el nombre del cliente, contacta a la oficina de inmediato por Slack, y espera instrucciones antes de empezar. Nunca adivines ni asumas a qué casa pertenecen las notas.",
    bodyEn: "",
    bodyEs: "",
  },
  {
    key: "day9-scenario-breakage",
    dayNumber: 9,
    kind: "SCENARIO",
    order: 104,
    titleEn: "Scenario: Something Breaks",
    titleEs: "Escenario: Algo se Rompe",
    sourceLessonKeys: ["16-12"],
    promptEn: "You accidentally knock over and break a decorative item while dusting. What would you do?",
    promptEs: "Sin querer tiras y rompes un objeto decorativo mientras sacudes el polvo. ¿Qué harías?",
    revealEn:
      "Breathe — mistakes happen. If the client is home, let them know right away and apologize, and reassure them the office will follow up before end of day. Fill out the breakage report immediately either way. If the client isn't home, take photos, fill out the report with details, and notify your Service Manager immediately.",
    revealEs:
      "Respira — los errores pasan. Si el cliente está en casa, avísale de inmediato y discúlpate, y asegúrale que la oficina dará seguimiento antes de que termine el día. Llena el reporte de daños de inmediato en cualquier caso. Si el cliente no está en casa, toma fotos, llena el reporte con detalles, y notifica a tu Gerente de Servicio de inmediato.",
    bodyEn: "",
    bodyEs: "",
  },
  {
    key: "day9-scenario-running-behind",
    dayNumber: 9,
    kind: "SCENARIO",
    order: 105,
    titleEn: "Scenario: You're Running Behind Schedule",
    titleEs: "Escenario: Vas Retrasado en el Horario",
    sourceLessonKeys: ["16-12", "16-4"],
    promptEn:
      "You're about halfway through a home and you can already tell you won't finish in the scheduled time. What would you do?",
    promptEs:
      "Vas a la mitad de una casa y ya te das cuenta de que no vas a terminar en el tiempo programado. ¿Qué harías?",
    revealEn:
      "Notify the office via Slack immediately — don't wait until you're already late. If you need more time on the current home, request it through TCS and wait for approval. If this is a recurring home that regularly runs long, also flag it to your Service Manager afterward so the Dirt Code or scheduled JTH can be reviewed — don't just quietly keep absorbing the extra time every visit.",
    revealEs:
      "Avisa a la oficina por Slack de inmediato — no esperes hasta que ya vayas tarde. Si necesitas más tiempo en la casa actual, solicítalo por TCS y espera la aprobación. Si esta es una casa recurrente que seguido toma más tiempo, también repórtalo después a tu Gerente de Servicio para que se revise el Dirt Code o las JTH programadas — no sigas absorbiendo el tiempo extra en silencio cada visita.",
    bodyEn: "",
    bodyEs: "",
  },
  {
    key: "day9-scenario-unsafe-condition",
    dayNumber: 9,
    kind: "SCENARIO",
    order: 106,
    titleEn: "Scenario: You Notice an Unsafe Condition",
    titleEs: "Escenario: Notas una Condición Insegura",
    sourceLessonKeys: ["16-14"],
    promptEn:
      "While cleaning, you smell something like gas, or notice something that just feels genuinely dangerous. What would you do?",
    promptEs:
      "Mientras limpias, hueles algo como gas, o notas algo que realmente se siente peligroso. ¿Qué harías?",
    revealEn:
      "Leave immediately and call the office to notify them. Your safety is the number one priority — you are never expected to assess or manage a dangerous situation yourself, and you'll never get in trouble for prioritizing your own safety.",
    revealEs:
      "Sal de inmediato y llama a la oficina para avisar. Tu seguridad es la prioridad número uno — nunca se espera que evalúes o manejes una situación peligrosa tú mismo, y nunca tendrás problemas por priorizar tu propia seguridad.",
    bodyEn: "",
    bodyEs: "",
  },

  // ───────────────────────────── DAY 10 RECAP ─────────────────────────────
  {
    key: "day10-recap",
    dayNumber: 10,
    kind: "RECAP",
    order: 100,
    titleEn: "Your Rookie Journey — A Quick Recap",
    titleEs: "Tu Camino Rookie — Un Repaso Rápido",
    estimatedMinutes: 10,
    sourceLessonKeys: ["1-3", "5-1", "5-2", "5-3", "8-2", "1-6", "6-1"],
    bodyEn: `**You've made it to Day 10.** Here's everything you've been building, in one place:

**MAMAS**
Meticulous. Authentic. Mindful. Allegiant. Sincere. — this is who MCC is, in every home.

**→ Golden Rules**
Safety first. Top-to-Bottom, Left-to-Right. Detail. Focus. Check your work. Speed with purpose. Never sacrifice quality. Use both hands. Put things back exactly as found.

**→ Safety**
Your safety always comes first — if something feels wrong, you're allowed to step outside and call the office, no exceptions.

**→ Quality**
Catch your own mistakes before your trainer does. Inspect before you call anything done.

**→ Hospitality**
"My Pleasure." You're not just cleaning — you're taking care of people.

**→ Teamwork**
Split wet/dry, communicate constantly, help each other finish, check each other's work.

**→ Pace**
Work toward MCC's time expectations without ever sacrificing quality to get there.

**→ Communication**
Know when to call, when to Slack, and when to just handle it yourself — and never guess when you're not sure.

**Field goal for today:** can you repeatedly produce MCC-standard work? Consistency is the whole point of these last ten days.

**Today ends with your Day 10 Rookie Training Review** — your trainer and/or manager will mark this as Rookie Training Complete, Extend Training, or Management Review Required. This is still not a certification — the MCC Seal of Approval comes at Day 30.`,
    bodyEs: `**Llegaste al Día 10.** Aquí está todo lo que has ido construyendo, en un solo lugar:

**MAMAS**
Meticulosa. Auténtica. Consciente. Leal. Sincera. — esto es lo que MCC es, en cada casa.

**→ Reglas de Oro**
Seguridad primero. De Arriba Hacia Abajo, de Izquierda a Derecha. Detalle. Enfoque. Revisa tu trabajo. Velocidad con propósito. Nunca sacrifiques la calidad. Usa ambas manos. Regresa las cosas exactamente a como las encontraste.

**→ Seguridad**
Tu seguridad siempre es lo primero — si algo se siente mal, puedes salir y llamar a la oficina, sin excepciones.

**→ Calidad**
Detecta tus propios errores antes que tu capacitador. Inspecciona antes de dar algo por terminado.

**→ Hospitalidad**
"Es un placer." No solo estás limpiando — estás cuidando de personas.

**→ Trabajo en Equipo**
Divide húmedo/seco, comunícate constantemente, ayúdense a terminar, revisen el trabajo del otro.

**→ Ritmo**
Trabaja hacia las expectativas de tiempo de MCC sin nunca sacrificar la calidad para lograrlo.

**→ Comunicación**
Sabe cuándo llamar, cuándo mandar Slack, y cuándo simplemente resolverlo tú mismo — y nunca adivines cuando no estés seguro.

**Meta de campo para hoy:** ¿puedes producir trabajo del estándar de MCC de forma repetida? La consistencia es todo el propósito de estos últimos diez días.

**Hoy termina con tu Revisión de Entrenamiento Rookie del Día 10** — tu capacitador y/o gerente marcará esto como Entrenamiento Rookie Completo, Extender Entrenamiento, o Revisión de Gerencia Requerida. Esto todavía no es una certificación — el Sello de Aprobación de MCC llega en el Día 30.`,
  },
];
