import {
  Loader2,
  Zap,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../ui/button';
import SourceIcon from './SourceIcon';
import type { NewsSourceKey, SourceInfo } from './useNewsDashboardData';

const SOURCE_LABEL_KEYS: Record<NewsSourceKey, string> = {
  arxiv: 'sources.arxiv',
  huggingface: 'sources.huggingface',
  x: 'sources.x',
  xiaohongshu: 'sources.xiaohongshu',
};

const SOURCE_INACTIVE_COLORS: Record<NewsSourceKey, string> = {
  arxiv: 'bg-rose-100/70 text-rose-800 hover:bg-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/60',
  huggingface: 'bg-yellow-100/70 text-yellow-800 hover:bg-yellow-200/80 dark:bg-yellow-950/40 dark:text-yellow-300 dark:hover:bg-yellow-950/60',
  x: 'bg-gray-200/70 text-gray-800 hover:bg-gray-300/80 dark:bg-gray-800/50 dark:text-gray-300 dark:hover:bg-gray-700/60',
  xiaohongshu: 'bg-red-100/70 text-red-600 hover:bg-red-200/80 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60',
};

const SOURCE_ACTIVE_COLORS: Record<NewsSourceKey, string> = {
  arxiv: 'bg-rose-600 text-white shadow-sm hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-600',
  huggingface: 'bg-yellow-500 text-white shadow-sm hover:bg-yellow-600 dark:bg-yellow-600 dark:hover:bg-yellow-500',
  x: 'bg-gray-800 text-white shadow-sm hover:bg-gray-900 dark:bg-gray-600 dark:hover:bg-gray-500',
  xiaohongshu: 'bg-red-500 text-white shadow-sm hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-500',
};

const ALL_SOURCES: NewsSourceKey[] = ['arxiv', 'huggingface', 'x', 'xiaohongshu'];

export default function SourceFilterBar({
  activeSources,
  onToggleSource,
  sources,
  isSearching,
  onSearchAll,
  isSearchingAll,
}: {
  activeSources: Set<NewsSourceKey>;
  onToggleSource: (key: NewsSourceKey) => void;
  sources: SourceInfo[];
  isSearching: Record<NewsSourceKey, boolean>;
  onSearchAll: () => void;
  isSearchingAll: boolean;
}) {
  const { t } = useTranslation('news');

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-card/80 p-2 shadow-sm backdrop-blur">
      {ALL_SOURCES.map((key) => {
        const label = t(SOURCE_LABEL_KEYS[key]);
        const isActive = activeSources.has(key);
        const info = sources.find((s) => s.key === key);
        const needsCred = info?.requiresCredentials && info.credentialStatus === 'missing';
        const searching = isSearching[key];

        return (
          <button
            key={key}
            onClick={() => onToggleSource(key)}
            className={`relative flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
              isActive
                ? SOURCE_ACTIVE_COLORS[key]
                : SOURCE_INACTIVE_COLORS[key]
            }`}
          >
            {searching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SourceIcon sourceKey={key} className="h-4 w-4" inverted={isActive} />
            )}
            <span className="hidden sm:inline">{label}</span>
            {needsCred && (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500" title={t('settings.credentialRequired')} />
            )}
          </button>
        );
      })}

      <div className="ml-auto">
        <Button
          onClick={onSearchAll}
          disabled={isSearchingAll}
          className="h-8 gap-1.5 rounded-xl text-xs"
          size="sm"
        >
          {isSearchingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
          {t('actions.searchAll')}
        </Button>
      </div>
    </div>
  );
}
