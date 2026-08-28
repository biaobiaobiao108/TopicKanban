import React from 'react';
import { Topic } from '../../types';
import { Sparkles, AlertCircle, ArrowRight, CheckCircle2, Zap } from 'lucide-react';
import { useToast } from '../ui/Toast';

interface ScoreRatingDialProps {
  topic: Topic;
  onUpdateScores: (scores: Partial<Topic>) => Promise<void>;
  onNavigateToTab?: (tab: 'sources' | 'timeline' | 'script' | 'people') => void;
}

export const ScoreRatingDial: React.FC<ScoreRatingDialProps> = ({ topic, onUpdateScores, onNavigateToTab }) => {
  const { showToast } = useToast();
  const dimensions = [
    {
      key: 'score_character' as keyof Topic,
      label: '人物张力',
      hint: '主角反差、性格标签、争议性与记忆点',
      actionText: `补充「${topic.title}」核心主角档案与外号背景`,
      tab: 'people' as const,
    },
    {
      key: 'score_conflict' as keyof Topic,
      label: '矛盾冲突',
      hint: '对立阵营、利益博弈、阻碍与不断升级的矛盾',
      actionText: `梳理「${topic.title}」核心对立面与关键升级节点`,
      tab: 'timeline' as const,
    },
    {
      key: 'score_contrast' as keyof Topic,
      label: '荒诞反差',
      hint: '预期与现实的巨大落差、幽默/荒诞/社会讽刺感',
      actionText: `提炼「${topic.title}」人设崩塌与现实打脸反差点`,
      tab: 'script' as const,
    },
    {
      key: 'score_material' as keyof Topic,
      label: '素材充足度',
      hint: '直播录屏、原始切片、第一手高清视频与事实证据',
      actionText: `搜集「${topic.title}」原版直播录屏与第一手素材`,
      tab: 'sources' as const,
    },
    {
      key: 'score_story' as keyof Topic,
      label: '主线成立度',
      hint: '起承转合完整、能支撑8-15分钟叙事大长篇',
      actionText: `细化「${topic.title}」四幕故事大纲与起承转合`,
      tab: 'script' as const,
    },
  ];

  const currentScore =
    (topic.score_character || 0) +
    (topic.score_conflict || 0) +
    (topic.score_contrast || 0) +
    (topic.score_material || 0) +
    (topic.score_story || 0);

  // Find lowest score dimension for actionable bottleneck diagnosis
  const scoredDims = dimensions.map((d) => ({
    ...d,
    val: (topic[d.key] as number) || 0,
  }));

  const lowestDim = scoredDims.reduce((prev, curr) => (curr.val < prev.val ? curr : prev), scoredDims[0]);

  const getAssessment = (score: number) => {
    if (score >= 9) {
      return {
        level: 'S 级',
        title: '爆款潜质拉满',
        desc: '全维度无明显短板，叙事张力极强，建议立刻开工写稿！',
        badgeColor: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
      };
    }
    if (score >= 7) {
      return {
        level: 'A 级',
        title: '优质成熟选题',
        desc: '故事主线闭环完整，抓紧补充弱项即可进入生产。',
        badgeColor: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20',
      };
    }
    if (score >= 5) {
      return {
        level: 'B 级',
        title: '存在制作短板',
        desc: '核心反差或素材尚有欠缺，建议先攻坚瓶颈再开写。',
        badgeColor: 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/20',
      };
    }
    return {
      level: 'C 级',
      title: '立项风险较高',
      desc: '暂不建议盲目开稿，需重点补齐人物形象或事件冲突。',
      badgeColor: 'bg-stone-200/60 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-300 dark:border-stone-700',
    };
  };

  const assessment = getAssessment(currentScore);

  const handleApplyDiagnosisAsAction = async () => {
    if (!lowestDim.actionText) return;
    try {
      await onUpdateScores({
        next_action: lowestDim.actionText,
        next_action_updated_at: new Date().toISOString(),
        next_action_deferred_until: null,
      });
      showToast({ message: `已将「${lowestDim.label}」短板突破策略设为当前下一步行动！`, tone: 'success' });
    } catch {
      showToast({ message: '设置行动失败，请重试', tone: 'error' });
    }
  };

  return (
    <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/70 dark:border-stone-800 p-5 space-y-4 shadow-2xs transition-colors">
      {/* Header & Total Score */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100">选题健康度与五维诊断</h4>
          </div>
        </div>

        <div className="flex items-center gap-1.5 bg-stone-100 dark:bg-stone-800/80 px-3 py-1 rounded-xl">
          <span className="text-lg font-mono font-extrabold text-stone-900 dark:text-stone-100">{currentScore}</span>
          <span className="text-xs text-stone-400 dark:text-stone-500 font-mono">/ 10</span>
        </div>
      </div>

      {/* Assessment Level Banner */}
      <div className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 select-none ${assessment.badgeColor}`}>
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-sm px-1.5 py-0.5 rounded-lg bg-white/60 dark:bg-black/20 font-mono">
            {assessment.level}
          </span>
          <div>
            <span className="font-bold">{assessment.title}</span>
            <span className="hidden sm:inline text-stone-600 dark:text-stone-300 ml-1.5">· {assessment.desc}</span>
          </div>
        </div>
      </div>

      {/* Bottleneck Diagnostic Card */}
      {lowestDim.val < 2 && currentScore < 10 && (
        <div className="rounded-xl border border-rose-200/60 dark:border-rose-900/40 bg-rose-500/[0.04] dark:bg-rose-950/20 p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-rose-800 dark:text-rose-300">
              <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
              <span>当前主要制作瓶颈：【{lowestDim.label}】</span>
            </div>
            {onNavigateToTab && (
              <button
                type="button"
                onClick={() => onNavigateToTab(lowestDim.tab)}
                className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-700 flex items-center gap-0.5 cursor-pointer"
              >
                <span>前往对应模块</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
          <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed">
            建议破局策略：{lowestDim.actionText}
          </p>
          <div className="pt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={handleApplyDiagnosisAsAction}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-all shadow-2xs cursor-pointer active:scale-[0.98]"
            >
              <Zap className="w-3 h-3 text-amber-300 fill-amber-300" />
              <span>将此诊断设为下一步行动</span>
            </button>
          </div>
        </div>
      )}

      {/* 5-Dimension Diagnostic Sliders */}
      <div className="space-y-2.5 pt-1">
        {dimensions.map((dim) => {
          const val = (topic[dim.key] as number) || 0;
          return (
            <div
              key={dim.key}
              className="space-y-2 bg-stone-500/[0.02] dark:bg-stone-800/30 p-3 rounded-xl border border-stone-200/50 dark:border-stone-800/50 transition-colors"
            >
              <div className="flex items-center justify-between text-xs gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-bold text-stone-900 dark:text-stone-100">{dim.label}</span>
                  <div className="flex items-center gap-0.5">
                    <span
                      className={`h-1.5 w-3.5 rounded-full transition-colors ${
                        val >= 1 ? (val === 2 ? 'bg-rose-500' : 'bg-emerald-500') : 'bg-stone-200 dark:bg-stone-700'
                      }`}
                    />
                    <span
                      className={`h-1.5 w-3.5 rounded-full transition-colors ${
                        val === 2 ? 'bg-rose-500' : 'bg-stone-200 dark:bg-stone-700'
                      }`}
                    />
                  </div>
                </div>
                <span className="text-[11px] font-mono shrink-0 text-stone-500 dark:text-stone-400">
                  {val === 2 ? '🔥 爆点 (2分)' : val === 1 ? '✓ 达标 (1分)' : '⚠ 欠缺 (0分)'}
                </span>
              </div>

              <p className="text-[11px] text-stone-400 dark:text-stone-500 leading-snug">{dim.hint}</p>

              <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                {[
                  { score: 0, label: '0 欠缺' },
                  { score: 1, label: '1 达标' },
                  { score: 2, label: '2 爆点' },
                ].map((opt) => (
                  <button
                    key={opt.score}
                    type="button"
                    onClick={() => onUpdateScores({ [dim.key]: opt.score })}
                    className={`py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      val === opt.score
                        ? opt.score === 2
                          ? 'bg-rose-600 text-white shadow-2xs font-bold'
                          : opt.score === 1
                          ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-2xs font-bold'
                          : 'bg-amber-500/15 text-amber-900 dark:text-amber-200 border border-amber-500/30 font-bold'
                        : 'bg-white dark:bg-stone-800 border border-stone-200/60 dark:border-stone-700/60 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
