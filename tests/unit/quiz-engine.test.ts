import { describe, expect, it } from 'vitest';
import ca from '../../src/content/states/ca.json';
import national from '../../src/content/questions/national.json';
import { buildMockExam, buildPracticeSet, scoreExam, shuffle } from '../../src/lib/quiz-engine';
import type { ExamVariant, Question } from '../../src/lib/types';
const questions=national as Question[];
describe('quiz engine',()=>{
 it('shuffles deterministically',()=>{expect(shuffle([1,2,3,4],12)).toEqual(shuffle([1,2,3,4],12));expect(shuffle([1,2,3,4],12)).not.toEqual(shuffle([1,2,3,4],13));});
 it('builds category practice sets',()=>{const set=buildPracticeSet(questions,{category:'right-of-way',count:1,seed:1});expect(set).toHaveLength(1);expect(set[0]?.category).toBe('right-of-way');});
 it('scores at the pass threshold',()=>{const variant={variantId:'x',label:'X',numQuestions:2,numToPass:1,languages:['en'],onlineAvailable:false} satisfies ExamVariant;const bank=questions.slice(0,2);expect(scoreExam(bank,{[bank[0]!.id]:bank[0]!.correctIndex},variant).passed).toBe(true);expect(scoreExam(bank,{},variant).passed).toBe(false);});
 it('enforces subrequirements',()=>{const bank=questions.slice(0,2).map((q)=>({...q,category:'road-signs' as const}));const variant={variantId:'ny',label:'NY',numQuestions:2,numToPass:1,languages:['en'],onlineAvailable:false,subRequirements:[{category:'road-signs',minCorrect:2,outOf:2}]} satisfies ExamVariant;expect(scoreExam(bank,{[bank[0]!.id]:bank[0]!.correctIndex},variant).passed).toBe(false);});
 it('respects requested exam size up to available bank',()=>{const variant={variantId:'x',label:'X',numQuestions:5,numToPass:4,languages:['en'],onlineAvailable:false} satisfies ExamVariant;expect(buildMockExam('CA',variant,questions,1)).toHaveLength(5);});
 it('maps California variants',()=>{const minor=ca.examVariants.find(v=>v.variantId==='under-18')!;const adult=ca.examVariants.find(v=>v.variantId==='adult')!;expect([minor.numQuestions,minor.numToPass]).toEqual([46,38]);expect([adult.numQuestions,adult.numToPass]).toEqual([36,30]);});
});
