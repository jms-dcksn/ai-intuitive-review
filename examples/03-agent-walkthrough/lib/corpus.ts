// The corpus: 30 leases the agent must analyze for exit options. Compact records
// — enough to make the decisions legible and to back checkpoints with a real
// source snippet. The planted ambiguities:
//
//   • MERIDIAN class (8 leases): identical "six (6) months' notice" wording whose
//     calendar-vs-business reading is ambiguous → one policy call resolves all 8.
//   • #12: original + two amendments → which document is operative? (scope)
//   • #19: break penalty depends on a rent figure that's illegible in the scan.
//   • #22: "surrender for convenience with landlord consent" → is that a real
//     exit option? (classification / judgment)
//   • #5, #14, #27: no exit mechanism at all.

export interface Lease {
  id: string; // "#7"
  property: string;
  landlord: string;
  classId?: string;
  hasExit: boolean;
  note: string; // one-liner used in triage receipts
  clause?: string; // the operative snippet, for checkpoints / evidence
}

const MERIDIAN = "meridian-notice";

export const LEASES: Lease[] = [
  { id: "#1", property: "Austin — 200 Congress Ave", landlord: "Highline REIT", hasExit: true, note: "Break clause §11, 3 months' notice" },
  { id: "#2", property: "Austin — 88 E 5th St", landlord: "Highline REIT", hasExit: true, note: "Break clause §11, 3 months' notice" },
  { id: "#3", property: "Denver — 1600 Market St", landlord: "Front Range Props", hasExit: true, note: "Break at month 24; governing law blank → assume CO" },
  { id: "#4", property: "Chicago — 30 N LaSalle", landlord: "Meridian Estates", classId: MERIDIAN, hasExit: true, note: "Break clause §12, 'six (6) months' notice'", clause: "§12.2 Either party may terminate upon not less than six (6) months' notice to the other." },
  { id: "#5", property: "Boston — 101 Federal St", landlord: "Bay State Holdings", hasExit: false, note: "No break clause; fixed term to 2031" },
  { id: "#6", property: "Seattle — 400 Fairview", landlord: "Cascade Assets", hasExit: true, note: "Break at month 36, 4 months' notice" },
  { id: "#7", property: "Chicago — 155 N Wacker", landlord: "Meridian Estates", classId: MERIDIAN, hasExit: true, note: "Break clause §12, 'six (6) months' notice'", clause: "§12.2 Either party may terminate upon not less than six (6) months' notice to the other." },
  { id: "#8", property: "NYC — 1201 Broadway", landlord: "Gotham Realty", hasExit: true, note: "Break at month 18, 6 months' notice (business days stated)" },
  { id: "#9", property: "Atlanta — 1180 Peachtree", landlord: "Southface LP", hasExit: true, note: "Break at month 30, 3 months' notice" },
  { id: "#10", property: "Austin — 501 Congress", landlord: "Highline REIT", hasExit: true, note: "Break clause §11, 3 months' notice" },
  { id: "#11", property: "Dallas — 2100 Ross Ave", landlord: "Meridian Estates", classId: MERIDIAN, hasExit: true, note: "Break clause §12, 'six (6) months' notice'", clause: "§12.2 Either party may terminate upon not less than six (6) months' notice to the other." },
  {
    id: "#12",
    property: "Denver — 707 17th St",
    landlord: "Front Range Props",
    hasExit: true,
    note: "3 documents on file — operative version unclear",
    clause:
      "On file: (a) Original Lease (2019) — break at month 60; (b) First Amendment (2021) — break at month 36; (c) Second Amendment (2023) — silent on break, amends rent only. Later amendment does not restate the break term.",
  },
  { id: "#13", property: "Miami — 801 Brickell", landlord: "Biscayne Capital", hasExit: true, note: "Break at month 24, 3 months' notice" },
  { id: "#14", property: "Boston — 1 Beacon St", landlord: "Bay State Holdings", hasExit: false, note: "No break clause; fixed term to 2030" },
  { id: "#15", property: "Chicago — 71 S Wacker", landlord: "Meridian Estates", classId: MERIDIAN, hasExit: true, note: "Break clause §12, 'six (6) months' notice'", clause: "§12.2 Either party may terminate upon not less than six (6) months' notice to the other." },
  { id: "#16", property: "Seattle — 1201 2nd Ave", landlord: "Cascade Assets", hasExit: true, note: "Break at month 36, 4 months' notice" },
  { id: "#17", property: "Phoenix — 2390 E Camelback", landlord: "Desert Ridge Cos", hasExit: true, note: "Break at month 24, 3 months' notice" },
  { id: "#18", property: "Dallas — 1717 McKinney", landlord: "Meridian Estates", classId: MERIDIAN, hasExit: true, note: "Break clause §12, 'six (6) months' notice'", clause: "§12.2 Either party may terminate upon not less than six (6) months' notice to the other." },
  {
    id: "#19",
    property: "NYC — 55 Water St",
    landlord: "Gotham Realty",
    hasExit: true,
    note: "Break exists, but penalty formula rests on an illegible figure",
    clause:
      "§9.4 Break fee = the greater of (i) three months' rent or (ii) the unamortized fit-out balance of $[̶i̶l̶l̶e̶g̶i̶b̶l̶e̶ ̶i̶n̶ ̶s̶c̶a̶n̶]. The scanned page is degraded; the second figure cannot be read.",
  },
  { id: "#20", property: "Austin — 111 Congress", landlord: "Highline REIT", hasExit: true, note: "Break clause §11, 3 months' notice" },
  { id: "#21", property: "SF — 555 California", landlord: "Embarcadero Trust", hasExit: true, note: "Break at month 30, 6 months' notice (calendar stated)" },
  {
    id: "#22",
    property: "SF — 101 California",
    landlord: "Embarcadero Trust",
    hasExit: true,
    note: "No break clause, but a 'surrender for convenience' provision",
    clause:
      "§14.1 Tenant may surrender the premises for convenience subject to Landlord's prior written consent, such consent not to be unreasonably withheld. No fixed exit date or fee is specified.",
  },
  { id: "#23", property: "Chicago — 227 W Monroe", landlord: "Meridian Estates", classId: MERIDIAN, hasExit: true, note: "Break clause §12, 'six (6) months' notice'", clause: "§12.2 Either party may terminate upon not less than six (6) months' notice to the other." },
  { id: "#24", property: "Denver — 1401 Lawrence", landlord: "Front Range Props", hasExit: true, note: "Break at month 24, 3 months' notice" },
  { id: "#25", property: "Miami — 1450 Brickell", landlord: "Biscayne Capital", hasExit: true, note: "Break at month 24, 3 months' notice" },
  { id: "#26", property: "Dallas — 500 N Akard", landlord: "Meridian Estates", classId: MERIDIAN, hasExit: true, note: "Break clause §12, 'six (6) months' notice'", clause: "§12.2 Either party may terminate upon not less than six (6) months' notice to the other." },
  { id: "#27", property: "Boston — 60 State St", landlord: "Bay State Holdings", hasExit: false, note: "No break clause; fixed term to 2032" },
  { id: "#28", property: "Seattle — 701 5th Ave", landlord: "Cascade Assets", hasExit: true, note: "Break at month 36, 4 months' notice" },
  { id: "#29", property: "Chicago — 353 N Clark", landlord: "Meridian Estates", classId: MERIDIAN, hasExit: true, note: "Break clause §12, 'six (6) months' notice'", clause: "§12.2 Either party may terminate upon not less than six (6) months' notice to the other." },
  { id: "#30", property: "Phoenix — 100 W Washington", landlord: "Desert Ridge Cos", hasExit: true, note: "Break at month 24, 3 months' notice" },
];

export const MERIDIAN_IDS = LEASES.filter((l) => l.classId === MERIDIAN).map((l) => l.id);
export const NO_EXIT_IDS = LEASES.filter((l) => !l.hasExit).map((l) => l.id);
export const TASK = `Across our ${LEASES.length}-property lease portfolio, which leases can we exit within 18 months, by when, and at what cost? Produce a ranked exit plan.`;
