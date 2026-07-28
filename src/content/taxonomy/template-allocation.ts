import type { TypedFactKey } from "../../content.config";

type QuestionCategory = typeof import("../../content.config").QUESTION_CATEGORIES[number];

export interface TemplateAllocation {
  id: string;
  category: QuestionCategory;
  requires: readonly TypedFactKey[];
  instancesPerState: 1 | 2;
}

/**
 * Encodes §2.1 T2 targets. The sum of instancesPerState per category matches
 * the exact T2 per-state quotas defined in the spec.
 * Total T2 questions per state: 70
 */
export const TEMPLATE_ALLOCATION: TemplateAllocation[] = [
  // traffic-signals: 2
  { id: "tpl-signals-right-on-red", category: "traffic-signals", requires: ["rightTurnOnRed"], instancesPerState: 2 },

  // right-of-way: 4
  { id: "tpl-row-left-on-red", category: "right-of-way", requires: ["leftTurnOnRedFromOneWay"], instancesPerState: 2 },
  { id: "tpl-row-move-over", category: "right-of-way", requires: ["moveOver"], instancesPerState: 2 },

  // parking: 6
  { id: "tpl-park-hydrant", category: "parking", requires: ["parkFtFromHydrant"], instancesPerState: 2 },
  { id: "tpl-park-crosswalk", category: "parking", requires: ["parkFtFromCrosswalk"], instancesPerState: 1 },
  { id: "tpl-park-stop-sign", category: "parking", requires: ["parkFtFromStopSign"], instancesPerState: 2 },
  { id: "tpl-park-railroad", category: "parking", requires: ["parkFtFromRailroad"], instancesPerState: 1 },

  // speed-limits: 14
  { id: "tpl-speed-rural-1", category: "speed-limits", requires: ["ruralInterstateMaxMph"], instancesPerState: 2 },
  { id: "tpl-speed-rural-2", category: "speed-limits", requires: ["ruralInterstateMaxMph"], instancesPerState: 2 },
  { id: "tpl-speed-urban-1", category: "speed-limits", requires: ["urbanInterstateMaxMph"], instancesPerState: 2 },
  { id: "tpl-speed-res-1", category: "speed-limits", requires: ["residentialDefaultMph"], instancesPerState: 2 },
  { id: "tpl-speed-school-1", category: "speed-limits", requires: ["schoolZoneMph"], instancesPerState: 2 },
  { id: "tpl-speed-school-2", category: "speed-limits", requires: ["schoolZoneMph"], instancesPerState: 2 },
  { id: "tpl-speed-basic-1", category: "speed-limits", requires: ["basicSpeedLaw"], instancesPerState: 2 },

  // alcohol-drugs: 14
  { id: "tpl-dui-adult-1", category: "alcohol-drugs", requires: ["bacAdult"], instancesPerState: 2 },
  { id: "tpl-dui-adult-2", category: "alcohol-drugs", requires: ["bacAdult"], instancesPerState: 2 },
  { id: "tpl-dui-under21", category: "alcohol-drugs", requires: ["bacUnder21"], instancesPerState: 2 },
  { id: "tpl-dui-commercial", category: "alcohol-drugs", requires: ["bacCommercial"], instancesPerState: 2 },
  { id: "tpl-dui-implied", category: "alcohol-drugs", requires: ["impliedConsentRefusal"], instancesPerState: 2 },
  { id: "tpl-dui-open", category: "alcohol-drugs", requires: ["openContainerProhibited"], instancesPerState: 2 },
  { id: "tpl-dui-suspension", category: "alcohol-drugs", requires: ["duiFirstSuspensionDays"], instancesPerState: 2 },

  // traffic-laws: 6
  { id: "tpl-law-seatbelt", category: "traffic-laws", requires: ["seatBeltEnforcement"], instancesPerState: 1 },
  { id: "tpl-law-phone", category: "traffic-laws", requires: ["handheldPhone"], instancesPerState: 1 },
  { id: "tpl-law-texting", category: "traffic-laws", requires: ["texting"], instancesPerState: 2 },
  { id: "tpl-law-headlights", category: "traffic-laws", requires: ["headlightsRequired"], instancesPerState: 2 },

  // penalties-points: 10
  { id: "tpl-penalties-system", category: "penalties-points", requires: ["pointSystem"], instancesPerState: 2 },
  { id: "tpl-penalties-susp-1", category: "penalties-points", requires: ["pointSuspension"], instancesPerState: 2 },
  { id: "tpl-penalties-susp-2", category: "penalties-points", requires: ["pointSuspension"], instancesPerState: 2 },
  { id: "tpl-penalties-liab", category: "penalties-points", requires: ["minLiability"], instancesPerState: 2 },
  { id: "tpl-penalties-crash", category: "penalties-points", requires: ["crashReportThresholdUsd"], instancesPerState: 2 },

  // gdl-teen: 14
  { id: "tpl-gdl-age-1", category: "gdl-teen", requires: ["permitMinAgeMonths"], instancesPerState: 2 },
  { id: "tpl-gdl-age-2", category: "gdl-teen", requires: ["permitMinAgeMonths"], instancesPerState: 2 },
  { id: "tpl-gdl-holding", category: "gdl-teen", requires: ["permitHoldingMonths"], instancesPerState: 2 },
  { id: "tpl-gdl-hours-tot", category: "gdl-teen", requires: ["supervisedHoursTotal"], instancesPerState: 2 },
  { id: "tpl-gdl-hours-night", category: "gdl-teen", requires: ["supervisedHoursNight"], instancesPerState: 2 },
  { id: "tpl-gdl-curfew", category: "gdl-teen", requires: ["gdlNightCurfew"], instancesPerState: 2 },
  { id: "tpl-gdl-passenger", category: "gdl-teen", requires: ["gdlPassengerPhase1"], instancesPerState: 2 }
];
