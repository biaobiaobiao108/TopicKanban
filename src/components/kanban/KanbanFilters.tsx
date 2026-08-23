import React from 'react';
import { Priority, Tag, Person } from '../../types';
import { Filter, ArrowUpDown, X } from 'lucide-react';
import { CustomSelect } from '../ui/CustomSelect';

export type SortField = 'sort_order' | 'updated_at' | 'created_at' | 'priority' | 'score';

interface KanbanFiltersProps {
  priorityFilter: Priority | 'all';
  onPriorityFilterChange: (p: Priority | 'all') => void;
  selectedTagId: string | 'all';
  onTagFilterChange: (tagId: string | 'all') => void;
  selectedPersonId: string | 'all';
  onPersonFilterChange: (personId: string | 'all') => void;
  sortBy: SortField;
  onSortByChange: (sort: SortField) => void;
  availableTags: Tag[];
  availablePeople: Person[];
  onResetFilters: () => void;
  hasActiveFilters: boolean;
}

export const KanbanFilters: React.FC<KanbanFiltersProps> = ({
  priorityFilter,
  onPriorityFilterChange,
  selectedTagId,
  onTagFilterChange,
  selectedPersonId,
  onPersonFilterChange,
  sortBy,
  onSortByChange,
  availableTags,
  availablePeople,
  onResetFilters,
  hasActiveFilters,
}) => {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-stone-200 dark:border-stone-800 transition-colors">
      <div className="flex items-center gap-2.5 flex-wrap text-xs">
        <span className="font-semibold text-stone-500 dark:text-stone-400 flex items-center gap-1">
          <Filter className="w-3.5 h-3.5" />
          筛选:
        </span>

        {/* Priority Filter */}
        <CustomSelect
          value={priorityFilter}
          onChange={(val) => onPriorityFilterChange(val as Priority | 'all')}
          size="sm"
          options={[
            { value: 'all', label: '所有优先级' },
            { value: 'high', label: '高优', dot: 'bg-rose-500', description: '重点攻坚' },
            { value: 'medium', label: '中优', dot: 'bg-amber-500', description: '标准节奏' },
            { value: 'low', label: '低优', dot: 'bg-blue-500', description: '空闲跟进' },
            { value: 'none', label: '无优先级', dot: 'bg-stone-300 dark:bg-stone-600', description: '未设定' },
          ]}
        />

        {/* Tag Filter */}
        <CustomSelect
          value={selectedTagId}
          onChange={(val) => onTagFilterChange(val)}
          size="sm"
          options={[
            { value: 'all', label: '所有标签' },
            ...availableTags.map((t) => ({ value: t.id, label: `#${t.name}` })),
          ]}
        />

        {/* Person Filter */}
        {availablePeople.length > 0 && (
          <CustomSelect
            value={selectedPersonId}
            onChange={(val) => onPersonFilterChange(val)}
            size="sm"
            options={[
              { value: 'all', label: '所有关联人物' },
              ...availablePeople.map((p) => ({ value: p.id, label: `👤 ${p.name}` })),
            ]}
          />
        )}

        {hasActiveFilters && (
          <button
            onClick={onResetFilters}
            className="flex items-center gap-1 text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-900/60 px-2 py-1 rounded-md font-medium cursor-pointer transition-colors"
          >
            <X className="w-3 h-3" />
            重置筛选
          </button>
        )}
      </div>

      {/* Sorting dropdown */}
      <div className="flex items-center gap-2 text-xs">
        <span className="font-semibold text-stone-500 dark:text-stone-400 flex items-center gap-1">
          <ArrowUpDown className="w-3.5 h-3.5" />
          排序:
        </span>
        <CustomSelect
          value={sortBy}
          onChange={(val) => onSortByChange(val as SortField)}
          size="sm"
          align="right"
          options={[
            { value: 'sort_order', label: '看板自定义排序' },
            { value: 'updated_at', label: '最近更新时间' },
            { value: 'created_at', label: '创建时间' },
            { value: 'priority', label: '优先级最高' },
            { value: 'score', label: '综合评分最高' },
          ]}
        />
      </div>
    </div>
  );
};
