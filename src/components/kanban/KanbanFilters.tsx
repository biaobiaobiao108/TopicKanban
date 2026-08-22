import React from 'react';
import { Priority, Tag, Person } from '../../types';
import { Filter, ArrowUpDown, X } from 'lucide-react';

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
        <select
          value={priorityFilter}
          onChange={(e) => onPriorityFilterChange(e.target.value as Priority | 'all')}
          className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 rounded-lg px-2.5 py-1.5 font-medium focus:outline-none focus:border-stone-400 dark:focus:border-stone-500 shadow-2xs transition-colors cursor-pointer"
        >
          <option value="all" className="dark:bg-stone-800 dark:text-stone-200">所有优先级</option>
          <option value="high" className="dark:bg-stone-800 dark:text-stone-200">🔥 高优先级</option>
          <option value="medium" className="dark:bg-stone-800 dark:text-stone-200">⚡ 中优先级</option>
          <option value="low" className="dark:bg-stone-800 dark:text-stone-200">🌱 低优先级</option>
          <option value="none" className="dark:bg-stone-800 dark:text-stone-200">无优先级</option>
        </select>

        {/* Tag Filter */}
        <select
          value={selectedTagId}
          onChange={(e) => onTagFilterChange(e.target.value)}
          className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 rounded-lg px-2.5 py-1.5 font-medium focus:outline-none focus:border-stone-400 dark:focus:border-stone-500 shadow-2xs transition-colors cursor-pointer"
        >
          <option value="all" className="dark:bg-stone-800 dark:text-stone-200">所有标签</option>
          {availableTags.map((t) => (
            <option key={t.id} value={t.id} className="dark:bg-stone-800 dark:text-stone-200">
              #{t.name}
            </option>
          ))}
        </select>

        {/* Person Filter */}
        {availablePeople.length > 0 && (
          <select
            value={selectedPersonId}
            onChange={(e) => onPersonFilterChange(e.target.value)}
            className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 rounded-lg px-2.5 py-1.5 font-medium focus:outline-none focus:border-stone-400 dark:focus:border-stone-500 shadow-2xs transition-colors cursor-pointer"
          >
            <option value="all" className="dark:bg-stone-800 dark:text-stone-200">所有关联人物</option>
            {availablePeople.map((p) => (
              <option key={p.id} value={p.id} className="dark:bg-stone-800 dark:text-stone-200">
                👤 {p.name}
              </option>
            ))}
          </select>
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
        <select
          value={sortBy}
          onChange={(e) => onSortByChange(e.target.value as SortField)}
          className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 rounded-lg px-2.5 py-1.5 font-medium focus:outline-none focus:border-stone-400 dark:focus:border-stone-500 shadow-2xs transition-colors cursor-pointer"
        >
          <option value="sort_order" className="dark:bg-stone-800 dark:text-stone-200">看板自定义排序</option>
          <option value="updated_at" className="dark:bg-stone-800 dark:text-stone-200">最近更新时间</option>
          <option value="created_at" className="dark:bg-stone-800 dark:text-stone-200">创建时间</option>
          <option value="priority" className="dark:bg-stone-800 dark:text-stone-200">优先级最高</option>
          <option value="score" className="dark:bg-stone-800 dark:text-stone-200">综合评分最高</option>
        </select>
      </div>
    </div>
  );
};
