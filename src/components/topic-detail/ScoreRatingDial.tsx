import React from 'react';
import { Topic } from '../../types';
import { Sparkles } from 'lucide-react';

interface ScoreRatingDialProps {
  topic: Topic;
  onUpdateScores: (scores: Partial<Topic>) => Promise<void>;
}

export const ScoreRatingDial: React.FC<ScoreRatingDialProps> = ({ topic, onUpdateScores }) => {
  const dimensions = [
    {
      key: 'score_character' as keyof Topic,
      label: '人物辨识度',
      desc: '0=无明显人物 / 1=人物普通 / 2=人物鲜明强烈且有故事',
    },
    {
      key: 'score_conflict' as keyof Topic,
      label: '矛盾与冲突',
      desc: '0=无冲突 / 1=有一定矛盾 / 2=冲突激烈且有升级过程',
    },
    {
      key: 'score_contrast' as keyof Topic,
      label: '反差与荒诞',
      desc: '0=平铺直叙 / 1=微小反差 / 2=强烈荒诞感与喜剧/讽刺效果',
    },
    {
      key: 'score_material' as keyof Topic,
      label: '原始素材度',
      desc: '0=缺少原片 / 1=仅有二手截图 / 2=有充足原片/直播/第一手画面',
    },
    {
      key: 'score_story' as keyof Topic,
      label: '完整故事性',
      desc: '0=短快讯 / 1=结构零散 / 2=能支撑8-15分钟叙事大长篇',
    },
  ];

  const currentScore =
    (topic.score_character || 0) +
    (topic.score_conflict || 0) +
    (topic.score_contrast || 0) +
    (topic.score_material || 0) +
    (topic.score_story || 0);

  const getScoreAssessment = (score: number) => {
    if (score >= 9) return { text: 'S级 绝佳爆款相，立刻写稿！', color: 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/10' };
    if (score >= 7) return { text: 'A级 优质选题，故事闭环完整', color: 'text-blue-700 dark:text-blue-300 bg-blue-500/10' };
    if (score >= 5) return { text: 'B级 尚有短板，建议深挖素材', color: 'text-amber-700 dark:text-amber-300 bg-amber-500/10' };
    return { text: 'C级 风险较大，需补齐人物或冲突', color: 'text-stone-600 dark:text-stone-400 bg-stone-500/10' };
  };

  const assessment = getScoreAssessment(currentScore);

  return (
    <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/70 dark:border-stone-800 p-5 space-y-4 shadow-2xs transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-amber-500" />
          <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100">选题 5 维评估评分</h4>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xl font-mono font-extrabold text-stone-900 dark:text-stone-100">{currentScore}</span>
          <span className="text-xs text-stone-400 dark:text-stone-500 font-mono">/ 10</span>
        </div>
      </div>

      {/* Assessment Pill */}
      <div className={`p-2.5 rounded-xl text-xs font-semibold text-center select-none ${assessment.color}`}>
        {assessment.text}
      </div>

      {/* Rating Sliders/Radios */}
      <div className="space-y-3 pt-1">
        {dimensions.map((dim) => {
          const val = (topic[dim.key] as number) || 0;
          return (
            <div key={dim.key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-stone-700 dark:text-stone-300">{dim.label}</span>
                <span className="font-mono font-bold text-stone-900 dark:text-stone-100">{val} / 2 分</span>
              </div>
              <p className="text-[11px] text-stone-400 dark:text-stone-500 leading-tight">{dim.desc}</p>
              <div className="grid grid-cols-3 gap-1.5 pt-1">
                {[0, 1, 2].map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => onUpdateScores({ [dim.key]: opt })}
                    className={`py-1.5 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer ${
                      val === opt
                        ? 'bg-stone-900 dark:bg-rose-600 text-white shadow-2xs'
                        : 'bg-stone-100/80 dark:bg-stone-800 hover:bg-stone-200/70 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300'
                    }`}
                  >
                    {opt} 分
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
