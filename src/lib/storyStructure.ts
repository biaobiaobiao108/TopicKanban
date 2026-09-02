export interface StoryStructureActs {
  qi: string;
  cheng: string;
  zhuan: string;
  he: string;
}

export type StoryStructureKey = keyof StoryStructureActs;

export interface StoryStructureStep {
  key: StoryStructureKey;
  number: number;
  label: string;
  sectionTitle: string;
  note: string;
  placeholder: string;
  defaultText: string;
}

export const STORY_STRUCTURE_STEPS: readonly StoryStructureStep[] = [
  {
    key: 'qi',
    number: 1,
    label: '开始',
    sectionTitle: '第一段：开始',
    note: '说明背景、人物和问题',
    placeholder: '人物 / 环境 / 现状 / 要回答的问题',
    defaultText: '补充背景、人物、现状，以及故事要回答的问题。',
  },
  {
    key: 'cheng',
    number: 2,
    label: '发展',
    sectionTitle: '第二段：发展',
    note: '写清过程、变化和阻力',
    placeholder: '事情如何发展？出现了哪些变化、行动或阻力？',
    defaultText: '写清事情怎样发展，出现了哪些变化、行动或阻力。',
  },
  {
    key: 'zhuan',
    number: 3,
    label: '转折',
    sectionTitle: '第三段：转折',
    note: '标出改变走向的节点',
    placeholder: '哪个事实、决定或事件改变了走向？',
    defaultText: '补充改变判断或走向的事实、决定或事件。',
  },
  {
    key: 'he',
    number: 4,
    label: '收束',
    sectionTitle: '第四段：收束',
    note: '交代结果、影响和余波',
    placeholder: '事情最后怎样了？留下了什么影响，故事收在哪里？',
    defaultText: '交代结果、影响，以及故事收束的位置。',
  },
] as const;

const EMPTY_STORY_STRUCTURE: StoryStructureActs = {
  qi: '',
  cheng: '',
  zhuan: '',
  he: '',
};

const STORYLINE_MARKERS: Record<StoryStructureKey, string> = {
  qi: '开始',
  cheng: '发展',
  zhuan: '转折',
  he: '收束',
};

const STORYLINE_MARKER_PATTERNS: Record<StoryStructureKey, RegExp> = {
  qi: /【开始[^】]*】\s*([^\n【]*)/,
  cheng: /【发展[^】]*】\s*([^\n【]*)/,
  zhuan: /【转折[^】]*】\s*([^\n【]*)/,
  he: /【收束[^】]*】\s*([^\n【]*)/,
};

export function parseStorylineToActs(storyline: string): StoryStructureActs {
  if (!storyline.trim()) return { ...EMPTY_STORY_STRUCTURE };

  const parsed = STORY_STRUCTURE_STEPS.reduce<StoryStructureActs>((result, step) => {
    const match = storyline.match(STORYLINE_MARKER_PATTERNS[step.key]);
    result[step.key] = match ? match[1].trim() : '';
    return result;
  }, { ...EMPTY_STORY_STRUCTURE });

  if (STORY_STRUCTURE_STEPS.some((step) => parsed[step.key])) return parsed;

  const parts = storyline
    .split(/(?:→|->|\n)/g)
    .map((part) => part.replace(/^第\s*[一二三四1-4]\s*段[:：]\s*/, '').trim())
    .filter(Boolean);

  return {
    qi: parts[0] || '',
    cheng: parts[1] || '',
    zhuan: parts[2] || '',
    he: parts.slice(3).join(' ') || '',
  };
}

export function serializeActsToStoryline(acts: StoryStructureActs): string {
  return STORY_STRUCTURE_STEPS
    .map((step) => ({ step, value: acts[step.key].trim() }))
    .filter(({ value }) => Boolean(value))
    .map(({ step, value }) => `【${STORYLINE_MARKERS[step.key]}】${value}`)
    .join('\n');
}

export function buildStoryStructureSectionsHtml(acts: StoryStructureActs): string {
  return STORY_STRUCTURE_STEPS
    .map((step) => `<h2>${step.sectionTitle}</h2><p>${acts[step.key].trim() || step.defaultText}</p>`)
    .join('');
}

export function buildStoryStructureDraftHtml(topicTitle: string, hookText: string): string {
  return `<h1>【黄金Hook】${topicTitle}</h1><p>${hookText}</p>${buildStoryStructureSectionsHtml({ ...EMPTY_STORY_STRUCTURE })}`;
}

export function buildStoryStructureTimelineSteps(acts: StoryStructureActs): Array<{ title: string; desc: string }> {
  return STORY_STRUCTURE_STEPS.map((step) => ({
    title: step.sectionTitle,
    desc: acts[step.key].trim() || step.defaultText,
  }));
}
