import { describe, expect, it } from 'bun:test';
import {
  buildStoryStructureDraftHtml,
  buildStoryStructureSectionsHtml,
  buildStoryStructureTimelineSteps,
  parseStorylineToActs,
  serializeActsToStoryline,
  type StoryStructureActs,
} from '../src/lib/storyStructure';

const acts: StoryStructureActs = {
  qi: '人物和环境已经明确。',
  cheng: '事情沿着时间线逐步发展。',
  zhuan: '一条新信息改变了原来的判断。',
  he: '结果和后续影响已经落定。',
};

describe('storyStructure', () => {
  it('parses the modern marker format', () => {
    expect(parseStorylineToActs(
      '【开始】人物和环境已经明确。\n【发展】事情沿着时间线逐步发展。\n【转折】一条新信息改变了原来的判断。\n【收束】结果和后续影响已经落定。'
    )).toEqual(acts);
  });

  it('serializes only filled sections with modern markers', () => {
    expect(serializeActsToStoryline(acts)).toBe(
      '【开始】人物和环境已经明确。\n【发展】事情沿着时间线逐步发展。\n【转折】一条新信息改变了原来的判断。\n【收束】结果和后续影响已经落定。'
    );
    expect(serializeActsToStoryline({ ...acts, cheng: '', he: '结果已明确。' })).toBe(
      '【开始】人物和环境已经明确。\n【转折】一条新信息改变了原来的判断。\n【收束】结果已明确。'
    );
  });

  it('supports arrow, newline, and numbered segment fallbacks', () => {
    expect(parseStorylineToActs('第一段：背景\n第 2 段：发展\n第3段：转折\n第4段：结果')).toEqual({
      qi: '背景',
      cheng: '发展',
      zhuan: '转折',
      he: '结果',
    });
    expect(parseStorylineToActs('背景 → 发展 -> 转折 → 结果')).toEqual({
      qi: '背景',
      cheng: '发展',
      zhuan: '转折',
      he: '结果',
    });
  });

  it('uses the same neutral copy for draft sections and timeline steps', () => {
    const sectionsHtml = buildStoryStructureSectionsHtml(acts);
    const draftHtml = buildStoryStructureDraftHtml('测试选题', '测试看点');
    const timelineSteps = buildStoryStructureTimelineSteps(acts);

    expect(sectionsHtml).toContain('<h2>第一段：开始</h2>');
    expect(sectionsHtml).toContain('<h2>第四段：收束</h2>');
    expect(draftHtml).toContain('<h2>第二段：发展</h2>');
    expect(timelineSteps.map((step) => step.title)).toEqual([
      '第一段：开始',
      '第二段：发展',
      '第三段：转折',
      '第四段：收束',
    ]);

    const generatedCopy = `${draftHtml}${timelineSteps.map((step) => step.desc).join('')}`;
    expect(generatedCopy).not.toMatch(/荒诞|人设崩塌|名场面|流量讽刺|滑竿/);
  });
});
