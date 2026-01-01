'use client';

import { useEffect, useState, useMemo } from 'react';
import { Store } from '@/types';

interface TrendingPlacesProps {
  stores: Store[];
  onPlaceClick?: (store: Store) => void;
}

interface RankedStore extends Store {
  currentRank: number;
  previousRank: number | null;
  rankChange: number | null; // 양수면 up, 음수면 down
}

export default function TrendingPlaces({ stores, onPlaceClick }: TrendingPlacesProps) {
  const [previousRanks, setPreviousRanks] = useState<{ [key: string]: number }>({});
  const [isExpanded, setIsExpanded] = useState(true); // 접기/펼치기 상태

  // 조회수 기준으로 정렬하여 상위 3개 선택 (previousRanks에 의존하지 않음)
  const topStoresData = useMemo(() => {
    // 디버깅: stores 배열과 viewCount 확인
    console.log('TrendingPlaces - stores:', stores.length);
    console.log('TrendingPlaces - stores with viewCount:', stores.filter(s => s.viewCount !== undefined && s.viewCount !== null).length);
    console.log('TrendingPlaces - sample store:', stores[0] ? { name: stores[0].name, viewCount: stores[0].viewCount } : 'no stores');
    
    // 조회수 기준으로 정렬 (조회수가 없거나 0이어도 포함)
    const sortedStores = [...stores]
      .sort((a, b) => {
        const aCount = a.viewCount ?? 0;
        const bCount = b.viewCount ?? 0;
        return bCount - aCount;
      })
      .slice(0, 3);

    console.log('TrendingPlaces - topStores:', sortedStores.map(s => ({ name: s.name, viewCount: s.viewCount ?? 0 })));

    return sortedStores.map((store, index) => ({
      ...store,
      currentRank: index + 1,
    }));
  }, [stores]);

  // 이전 순위와 비교하여 순위 변화 계산
  const topStores = useMemo(() => {
    return topStoresData.map(store => {
      const previousRank = previousRanks[store.id] || null;
      const rankChange = previousRank !== null ? previousRank - store.currentRank : null;

      return {
        ...store,
        previousRank,
        rankChange,
      } as RankedStore;
    });
  }, [topStoresData, previousRanks]);

  // 컴포넌트 마운트 시 localStorage에서 이전 순위 불러오기
  useEffect(() => {
    try {
      const savedRanks = localStorage.getItem('placeRanks');
      if (savedRanks) {
        setPreviousRanks(JSON.parse(savedRanks));
      }
    } catch (e) {
      console.error('Failed to load ranks from localStorage:', e);
    }
  }, []);

  // 현재 순위를 localStorage에 저장 (순위가 실제로 변경되었을 때만)
  useEffect(() => {
    if (topStoresData.length === 0) return;
    
    const newRanks: { [key: string]: number } = {};
    topStoresData.forEach(store => {
      newRanks[store.id] = store.currentRank;
    });
    
    // 이전 순위와 비교하여 실제로 변경되었는지 확인
    const ranksString = JSON.stringify(newRanks);
    const previousRanksString = JSON.stringify(previousRanks);
    
    if (ranksString !== previousRanksString) {
      setPreviousRanks(newRanks);
      
      // localStorage에도 저장 (페이지 새로고침 시에도 유지)
      try {
        localStorage.setItem('placeRanks', ranksString);
      } catch (e) {
        console.error('Failed to save ranks to localStorage:', e);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topStoresData]); // topStoresData만 의존성으로 사용 (previousRanks는 비교용으로만 사용)

  if (topStores.length === 0) {
    return null;
  }

  return (
    <div className="absolute top-4 left-4 z-10 bg-white rounded-lg shadow-lg max-w-xs overflow-hidden">
      {/* 헤더 - 클릭 가능 */}
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
          <h3 className="text-sm font-bold text-gray-900">실시간 조회수 급상승</h3>
        </div>
        <svg 
          className={`w-4 h-4 text-gray-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      
      {/* 내용 - 접기/펼치기 */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-2">
          {topStores.map((store) => (
            <div
              key={store.id}
              className="flex items-center justify-between p-2 rounded hover:bg-gray-50 transition-colors cursor-pointer"
              onClick={(e) => {
                e.stopPropagation(); // 헤더 클릭 이벤트 전파 방지
                if (onPlaceClick) {
                  onPlaceClick(store);
                }
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-700">#{store.currentRank}</span>
                  <span className="text-sm font-medium text-gray-900 truncate">{store.name}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {store.rankChange !== null && store.rankChange !== 0 ? (
                    <span
                      className={`text-xs font-semibold ${
                        store.rankChange > 0
                          ? 'text-red-500'
                          : 'text-blue-500'
                      }`}
                    >
                      {Math.abs(store.rankChange)} {store.rankChange > 0 ? '↑' : '↓'}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">
                      -
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

