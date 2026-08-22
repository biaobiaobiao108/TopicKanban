import { PublishedVideo, Topic } from '../types';

export interface VideoDeepMetrics {
  tripleRate: number; // (likes + coins + favorites) / views %
  coinRate: number; // coins / views %
  favoriteRate: number; // favorites / views %
  likeRate: number; // likes / views %
  commentRate: number; // comments / views %
  engagementScore: number; // 0 - 100
  viewsPerKWord: number; // views / (word_count / 1000)
  coinGrade: 'S' | 'A' | 'B' | 'C';
  tripleGrade: 'S' | 'A' | 'B' | 'C';
}

export interface ChannelOverviewMetrics {
  totalVideos: number;
  totalViews: number;
  totalLikes: number;
  totalCoins: number;
  totalFavorites: number;
  totalComments: number;
  avgViews: number;
  avgCoinRate: number;
  avgTripleRate: number;
  avgFavoriteRate: number;
  avgEngagementScore: number;
  topViewedVideo: PublishedVideo | null;
  topCoinedVideo: PublishedVideo | null;
}

export interface DimensionComparison {
  key: 'score_character' | 'score_conflict' | 'score_contrast' | 'score_material' | 'score_story';
  label: string;
  allAverage: number;
  topHitsAverage: number;
  difference: number;
}

export interface FiveDModelCorrelation {
  hasData: boolean;
  dimensions: DimensionComparison[];
  strongestHitFactor: string;
  topHitsCount: number;
}

export interface EntityPerformance {
  id: string;
  name: string;
  videoCount: number;
  totalViews: number;
  avgViews: number;
  avgCoinRate: number;
  avgTripleRate: number;
  topVideoTitle?: string;
}

export interface AnalyticsInsight {
  id: string;
  type: 'success' | 'highlight' | 'warning' | 'tip';
  title: string;
  description: string;
  badgeText?: string;
}

const roundPercent = (val: number) => Math.round(val * 100) / 100;

export function calculateDeepMetrics(video: PublishedVideo, topic?: Topic | null): VideoDeepMetrics {
  const views = Math.max(0, video.views || 0);
  const likes = Math.max(0, video.likes || 0);
  const coins = Math.max(0, video.coins || 0);
  const favorites = Math.max(0, video.favorites || 0);
  const comments = Math.max(0, video.comments || 0);

  if (views === 0) {
    return {
      tripleRate: 0,
      coinRate: 0,
      favoriteRate: 0,
      likeRate: 0,
      commentRate: 0,
      engagementScore: 0,
      viewsPerKWord: 0,
      coinGrade: 'C',
      tripleGrade: 'C',
    };
  }

  const tripleRate = roundPercent(((likes + coins + favorites) / views) * 100);
  const coinRate = roundPercent((coins / views) * 100);
  const favoriteRate = roundPercent((favorites / views) * 100);
  const likeRate = roundPercent((likes / views) * 100);
  const commentRate = roundPercent((comments / views) * 100);

  // Engagement Score calculation (weighted Bilibili interaction score 0~100)
  // Coin (weight 40), Like (weight 25), Favorite (weight 25), Comment (weight 10)
  const rawScore = (coinRate / 2.5) * 40 + (likeRate / 8.0) * 25 + (favoriteRate / 3.5) * 25 + (commentRate / 0.8) * 10;
  const engagementScore = Math.min(100, Math.max(0, Math.round(rawScore)));

  // Word count efficiency
  const wordCount = topic?.draft_word_count || 0;
  const viewsPerKWord = wordCount > 0 ? Math.round((views / wordCount) * 1000) : 0;

  // Grade evaluations
  let coinGrade: VideoDeepMetrics['coinGrade'] = 'C';
  if (coinRate >= 2.5) coinGrade = 'S';
  else if (coinRate >= 1.5) coinGrade = 'A';
  else if (coinRate >= 0.8) coinGrade = 'B';

  let tripleGrade: VideoDeepMetrics['tripleGrade'] = 'C';
  if (tripleRate >= 10.0) tripleGrade = 'S';
  else if (tripleRate >= 6.0) tripleGrade = 'A';
  else if (tripleRate >= 3.5) tripleGrade = 'B';

  return {
    tripleRate,
    coinRate,
    favoriteRate,
    likeRate,
    commentRate,
    engagementScore,
    viewsPerKWord,
    coinGrade,
    tripleGrade,
  };
}

export function calculateChannelOverview(videos: PublishedVideo[], topics: Topic[]): ChannelOverviewMetrics {
  const topicMap = new Map(topics.map((t) => [t.id, t]));

  if (!videos.length) {
    return {
      totalVideos: 0,
      totalViews: 0,
      totalLikes: 0,
      totalCoins: 0,
      totalFavorites: 0,
      totalComments: 0,
      avgViews: 0,
      avgCoinRate: 0,
      avgTripleRate: 0,
      avgFavoriteRate: 0,
      avgEngagementScore: 0,
      topViewedVideo: null,
      topCoinedVideo: null,
    };
  }

  let totalViews = 0;
  let totalLikes = 0;
  let totalCoins = 0;
  let totalFavorites = 0;
  let totalComments = 0;

  let maxViews = -1;
  let topViewedVideo: PublishedVideo | null = null;

  let maxCoinRate = -1;
  let topCoinedVideo: PublishedVideo | null = null;

  const allMetrics: VideoDeepMetrics[] = [];

  videos.forEach((v) => {
    totalViews += v.views || 0;
    totalLikes += v.likes || 0;
    totalCoins += v.coins || 0;
    totalFavorites += v.favorites || 0;
    totalComments += v.comments || 0;

    if ((v.views || 0) > maxViews) {
      maxViews = v.views;
      topViewedVideo = v;
    }

    const topic = v.topic_id ? topicMap.get(v.topic_id) : undefined;
    const m = calculateDeepMetrics(v, topic);
    allMetrics.push(m);

    if (m.coinRate > maxCoinRate && (v.views || 0) >= 500) {
      maxCoinRate = m.coinRate;
      topCoinedVideo = v;
    }
  });

  if (!topCoinedVideo && videos.length > 0) {
    topCoinedVideo = videos[0];
  }

  const n = videos.length;
  const avgViews = Math.round(totalViews / n);
  const avgCoinRate = roundPercent(totalViews > 0 ? (totalCoins / totalViews) * 100 : 0);
  const avgTripleRate = roundPercent(totalViews > 0 ? ((totalLikes + totalCoins + totalFavorites) / totalViews) * 100 : 0);
  const avgFavoriteRate = roundPercent(totalViews > 0 ? (totalFavorites / totalViews) * 100 : 0);
  const avgEngagementScore = Math.round(allMetrics.reduce((sum, m) => sum + m.engagementScore, 0) / n);

  return {
    totalVideos: n,
    totalViews,
    totalLikes,
    totalCoins,
    totalFavorites,
    totalComments,
    avgViews,
    avgCoinRate,
    avgTripleRate,
    avgFavoriteRate,
    avgEngagementScore,
    topViewedVideo,
    topCoinedVideo,
  };
}

export function analyzeTopicModelCorrelation(videos: PublishedVideo[], topics: Topic[]): FiveDModelCorrelation {
  const topicMap = new Map(topics.map((t) => [t.id, t]));

  // Attach topics to videos
  const pairs = videos
    .map((v) => ({ video: v, topic: v.topic_id ? topicMap.get(v.topic_id) : undefined }))
    .filter((p): p is { video: PublishedVideo; topic: Topic } => Boolean(p.topic));

  const dimConfigs: Array<{
    key: DimensionComparison['key'];
    label: string;
  }> = [
    { key: 'score_character', label: '人物张力' },
    { key: 'score_conflict', label: '戏剧冲突' },
    { key: 'score_contrast', label: '荒诞反差' },
    { key: 'score_material', label: '素材完整' },
    { key: 'score_story', label: '主线成立' },
  ];

  if (pairs.length === 0) {
    return {
      hasData: false,
      dimensions: [],
      strongestHitFactor: '',
      topHitsCount: 0,
    };
  }

  // Sort pairs by views descending to find top 30% hits (at least 1)
  const sortedByViews = [...pairs].sort((a, b) => (b.video.views || 0) - (a.video.views || 0));
  const topHitsCount = Math.max(1, Math.ceil(pairs.length * 0.35));
  const topHits = sortedByViews.slice(0, topHitsCount);

  let maxDiff = -Infinity;
  let strongestHitFactor = '荒诞反差';

  const dimensions: DimensionComparison[] = dimConfigs.map((d) => {
    const allSum = pairs.reduce((sum, p) => sum + (p.topic[d.key] || 0), 0);
    const allAverage = roundPercent(allSum / pairs.length);

    const hitSum = topHits.reduce((sum, p) => sum + (p.topic[d.key] || 0), 0);
    const topHitsAverage = roundPercent(hitSum / topHits.length);

    const difference = roundPercent(topHitsAverage - allAverage);

    if (difference > maxDiff) {
      maxDiff = difference;
      strongestHitFactor = d.label;
    }

    return {
      key: d.key,
      label: d.label,
      allAverage,
      topHitsAverage,
      difference,
    };
  });

  return {
    hasData: true,
    dimensions,
    strongestHitFactor,
    topHitsCount,
  };
}

export function analyzePeoplePerformance(videos: PublishedVideo[], topics: Topic[]): EntityPerformance[] {
  const topicMap = new Map(topics.map((t) => [t.id, t]));
  const peopleMap = new Map<
    string,
    {
      id: string;
      name: string;
      videoCount: number;
      totalViews: number;
      totalCoins: number;
      totalLikes: number;
      totalFavorites: number;
      topViews: number;
      topVideoTitle: string;
    }
  >();

  videos.forEach((video) => {
    const topic = video.topic_id ? topicMap.get(video.topic_id) : undefined;
    if (!topic || !topic.people?.length) return;

    topic.people.forEach((person) => {
      let entry = peopleMap.get(person.id);
      if (!entry) {
        entry = {
          id: person.id,
          name: person.name,
          videoCount: 0,
          totalViews: 0,
          totalCoins: 0,
          totalLikes: 0,
          totalFavorites: 0,
          topViews: -1,
          topVideoTitle: '',
        };
        peopleMap.set(person.id, entry);
      }

      const views = video.views || 0;
      entry.videoCount += 1;
      entry.totalViews += views;
      entry.totalCoins += video.coins || 0;
      entry.totalLikes += video.likes || 0;
      entry.totalFavorites += video.favorites || 0;

      if (views > entry.topViews) {
        entry.topViews = views;
        entry.topVideoTitle = video.title;
      }
    });
  });

  return Array.from(peopleMap.values())
    .map((entry) => {
      const avgViews = Math.round(entry.totalViews / entry.videoCount);
      const avgCoinRate = roundPercent(entry.totalViews > 0 ? (entry.totalCoins / entry.totalViews) * 100 : 0);
      const avgTripleRate = roundPercent(
        entry.totalViews > 0 ? ((entry.totalLikes + entry.totalCoins + entry.totalFavorites) / entry.totalViews) * 100 : 0
      );

      return {
        id: entry.id,
        name: entry.name,
        videoCount: entry.videoCount,
        totalViews: entry.totalViews,
        avgViews,
        avgCoinRate,
        avgTripleRate,
        topVideoTitle: entry.topVideoTitle,
      };
    })
    .sort((a, b) => b.totalViews - a.totalViews);
}

export function analyzeTagPerformance(videos: PublishedVideo[], topics: Topic[]): EntityPerformance[] {
  const topicMap = new Map(topics.map((t) => [t.id, t]));
  const tagMap = new Map<
    string,
    {
      id: string;
      name: string;
      videoCount: number;
      totalViews: number;
      totalCoins: number;
      totalLikes: number;
      totalFavorites: number;
    }
  >();

  videos.forEach((video) => {
    const topic = video.topic_id ? topicMap.get(video.topic_id) : undefined;
    if (!topic || !topic.tags?.length) return;

    topic.tags.forEach((tag) => {
      let entry = tagMap.get(tag.id);
      if (!entry) {
        entry = {
          id: tag.id,
          name: tag.name,
          videoCount: 0,
          totalViews: 0,
          totalCoins: 0,
          totalLikes: 0,
          totalFavorites: 0,
        };
        tagMap.set(tag.id, entry);
      }

      const views = video.views || 0;
      entry.videoCount += 1;
      entry.totalViews += views;
      entry.totalCoins += video.coins || 0;
      entry.totalLikes += video.likes || 0;
      entry.totalFavorites += video.favorites || 0;
    });
  });

  return Array.from(tagMap.values())
    .map((entry) => {
      const avgViews = Math.round(entry.totalViews / entry.videoCount);
      const avgCoinRate = roundPercent(entry.totalViews > 0 ? (entry.totalCoins / entry.totalViews) * 100 : 0);
      const avgTripleRate = roundPercent(
        entry.totalViews > 0 ? ((entry.totalLikes + entry.totalCoins + entry.totalFavorites) / entry.totalViews) * 100 : 0
      );

      return {
        id: entry.id,
        name: entry.name,
        videoCount: entry.videoCount,
        totalViews: entry.totalViews,
        avgViews,
        avgCoinRate,
        avgTripleRate,
      };
    })
    .sort((a, b) => b.totalViews - a.totalViews);
}

export function generateAnalyticsInsights(videos: PublishedVideo[], topics: Topic[]): AnalyticsInsight[] {
  const insights: AnalyticsInsight[] = [];
  if (videos.length === 0) return insights;

  const correlation = analyzeTopicModelCorrelation(videos, topics);
  const people = analyzePeoplePerformance(videos, topics);
  const tags = analyzeTagPerformance(videos, topics);
  const overview = calculateChannelOverview(videos, topics);

  // 1. Five-dimensional story model insight
  if (correlation.topHitsCount > 0) {
    const strongest = correlation.dimensions.reduce((max, d) => (d.difference > max.difference ? d : max), correlation.dimensions[0]);
    if (strongest.difference > 0.3) {
      insights.push({
        id: '5d-strongest',
        type: 'highlight',
        title: `爆款核心密码：${strongest.label}`,
        description: `在频道的 Top ${correlation.topHitsCount} 部高播放视频中，【${strongest.label}】平均得分高达 ${strongest.topHitsAverage} 分（高出全频道均值 +${strongest.difference} 分）。新选题立项时请优先打磨该维度！`,
        badgeText: `爆款溢出 +${strongest.difference}分`,
      });
    }
  }

  // 2. High-performance figure insight
  if (people.length > 0) {
    const topPerson = people[0];
    if (topPerson.videoCount >= 1 && topPerson.avgViews > 0) {
      insights.push({
        id: 'people-champion',
        type: 'success',
        title: `票房号召力人物：${topPerson.name}`,
        description: `围绕【${topPerson.name}】的视频累计播放达 ${formatViewsText(topPerson.totalViews)}，平均播放量 ${formatViewsText(topPerson.avgViews)}，三连率达 ${topPerson.avgTripleRate}%。可继续挖掘其延伸事件或关联关系网。`,
        badgeText: `总播放 ${formatViewsText(topPerson.totalViews)}`,
      });
    }
  }

  // 3. High coin rate recognition insight
  if (overview.avgCoinRate >= 1.5) {
    insights.push({
      id: 'coin-quality',
      type: 'success',
      title: '高硬币率与算法推荐健康度极佳',
      description: `全频道平均投币率达到 ${overview.avgCoinRate}%（高于 B 站叙事视频 1.2% 的优秀基准线），说明内容干货度与主线叙事得到了观众的高度认可。`,
      badgeText: `硬币率 ${overview.avgCoinRate}%`,
    });
  } else if (overview.avgCoinRate > 0 && overview.avgCoinRate < 1.0) {
    insights.push({
      id: 'coin-boost-tip',
      type: 'tip',
      title: '提升片尾行动号召与投币引导',
      description: `当前全频道平均投币率为 ${overview.avgCoinRate}%。建议在视频高潮叙事结束后 15 秒内，配合专属文案与总结性思考唤起观众的认同感投币。`,
      badgeText: '建议优化',
    });
  }

  // 4. Tag performance insight
  if (tags.length > 0) {
    const topTag = tags[0];
    insights.push({
      id: 'tag-focus',
      type: 'highlight',
      title: `优势题材赛道：#${topTag.name}`,
      description: `【#${topTag.name}】题材共沉淀 ${topTag.videoCount} 期视频，总播放量 ${formatViewsText(topTag.totalViews)}，是目前观众粘性最强的题材切口。`,
      badgeText: `#${topTag.name}`,
    });
  }

  return insights;
}

export function formatViewsText(views: number): string {
  if (views >= 100000000) return `${(views / 100000000).toFixed(1)}亿`;
  if (views >= 10000) return `${(views / 10000).toFixed(1)}万`;
  return views.toLocaleString();
}
