import { TopicStatus } from '../../types';

export const COLUMNS: { status: TopicStatus; label: string; description: string; isArchive?: boolean }[] = [
  { status: 'inbox', label: '收集箱', description: '刚发现的线索或灵感' },
  { status: 'approved', label: '已立项', description: '故事线确立，准备开工' },
  { status: 'scripting', label: '写稿中', description: '正在撰写视频文案' },
  { status: 'production', label: '待制作', description: '文案就绪，等待剪辑录音' },
  { status: 'published', label: '已发布', description: '视频已上线，沉淀数据', isArchive: true },
  { status: 'icebox', label: '搁置', description: '暂缓或条件不成熟', isArchive: true },
];

export const ACTIVE_COLUMNS = COLUMNS.filter((column) => !column.isArchive);

