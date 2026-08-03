import type { Question } from './types';

type QuestionCategory = Question['category'];

export interface LessonBinding {
  unitId: string;
  module: string;
  moduleOrder: number;
  order: number;
  quizCategories: QuestionCategory[];
  quizTags: string[];
}

const units = (
  module: string,
  moduleOrder: number,
  definitions: Array<[string, QuestionCategory[], string]>,
): LessonBinding[] =>
  definitions.map(([unitId, quizCategories, quizTag], order) => ({
    unitId,
    module,
    moduleOrder,
    order,
    quizCategories,
    quizTags: [quizTag],
  }));

export const LESSON_BINDINGS: LessonBinding[] = [
  ...units('signs', 0, [
    ['shapes-and-colors', ['road-signs'], 'sign-shapes-colors'],
    ['regulatory', ['road-signs'], 'sign-regulatory'],
    ['warning', ['road-signs'], 'sign-warning'],
    ['guide-and-services', ['road-signs'], 'sign-guide-services'],
    ['work-zone', ['road-signs'], 'sign-work-zone'],
  ]),
  ...units('signals-markings', 1, [
    ['traffic-signals', ['traffic-signals'], 'signal-steady'],
    ['flashing-and-special-signals', ['traffic-signals'], 'signal-flashing-special'],
    ['pavement-markings', ['pavement-markings'], 'markings-lines-colors'],
  ]),
  ...units('right-of-way', 2, [
    ['intersections-and-stops', ['right-of-way'], 'row-intersections'],
    ['left-turns', ['right-of-way'], 'row-left-turns'],
    ['roundabouts', ['right-of-way'], 'row-roundabouts'],
    ['pedestrians-crosswalks', ['right-of-way'], 'row-pedestrians'],
    ['emergency-vehicles', ['right-of-way'], 'row-emergency-vehicles'],
  ]),
  ...units('speed', 3, [
    ['basic-speed-law', ['speed-limits'], 'speed-basic-law'],
    ['posted-limits', ['speed-limits'], 'speed-posted-limits'],
    ['school-and-work-zones', ['speed-limits', 'road-signs'], 'speed-school-work-zones'],
  ]),
  ...units('lane-use', 4, [
    ['lane-position-and-changing', ['traffic-laws'], 'lane-position'],
    ['turning', ['traffic-laws'], 'lane-turning'],
    ['passing', ['traffic-laws'], 'lane-passing'],
    ['freeway-entry-exit', ['traffic-laws'], 'lane-freeway'],
  ]),
  ...units('parking', 5, [
    ['parallel-and-angle', ['parking'], 'parking-maneuvers'],
    ['where-you-may-not-park', ['parking'], 'parking-prohibited'],
  ]),
  ...units('sharing-the-road', 6, [
    ['motorcycles-bicycles', ['sharing-the-road'], 'share-motorcycles-bicycles'],
    ['trucks-buses', ['sharing-the-road'], 'share-trucks-buses'],
    ['pedestrians-scooters-animals', ['sharing-the-road'], 'share-pedestrians-scooters'],
  ]),
  ...units('safe-driving', 7, [
    ['following-and-scanning', ['safe-driving'], 'safe-following-scanning'],
    ['weather-and-night', ['safe-driving'], 'safe-weather-night'],
    ['skids-and-emergencies', ['safe-driving'], 'safe-skids-emergencies'],
    ['distraction-and-fatigue', ['safe-driving'], 'safe-distraction-fatigue'],
  ]),
  ...units('alcohol-drugs', 8, [
    ['impairment-and-bac', ['alcohol-drugs'], 'alcohol-impairment-bac'],
    [
      'implied-consent-and-penalties',
      ['alcohol-drugs', 'penalties-points'],
      'alcohol-implied-consent',
    ],
  ]),
  ...units('collisions-insurance', 9, [
    ['at-the-scene', ['traffic-laws', 'safe-driving'], 'collision-at-scene'],
    ['insurance-and-reporting', ['traffic-laws'], 'collision-insurance-reporting'],
  ]),
  ...units('licensing-gdl', 10, [
    ['permit-rules', ['gdl-teen'], 'gdl-permit-rules'],
    ['to-full-license', ['gdl-teen'], 'gdl-to-full-license'],
  ]),
];
