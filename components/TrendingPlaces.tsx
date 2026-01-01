'use client';

import { useEffect, useState, useMemo } from 'react';
import { Store } from '@/types';

interface TrendingPlacesProps {
  stores: Store[];
  onPlaceClick?: (store: Store) => void;
  isCollapsed?: boolean; // 외부에서 접기/펼치기 제어
  onCollapseChange?: (collapsed: boolean) => void; // 접기/펼치기 상태 변경 콜백
}

interface RankedStore extends Store {
  currentRank: number;
  viewCountIncrease: number; // 조회수 증가량
}

export default function TrendingPlaces({ stores, onPlaceClick, isCollapsed, onCollapseChange }: TrendingPlacesProps) {
  const [previousViewCounts, setPreviousViewCounts] = useState<{ [key: string]: number }>({});
  const [internalExpanded, setInternalExpanded] = useState(true); // 내부 접기/펼치기 상태
  
  // 외부에서 제어되는 경우 외부 상태 사용, 아니면 내부 상태 사용
  const isExpanded = isCollapsed !== undefined ? !isCollapsed : internalExpanded;
  
  const setIsExpanded = (expanded: boolean) => {
    if (isCollapsed !== undefined && onCollapseChange) {
      // 외부 제어 모드
      onCollapseChange(!expanded);
    } else {
      // 내부 제어 모드
      setInternalExpanded(expanded);
    }
  };

  // 순위와 조회수에 따른 동적 메시지 생성
  const getTrendingMessage = (rank: number, viewCount: number, viewCountIncrease: number): string => {
    if (rank === 1) {
      // 1위: 조회수에 따라 메시지 변경
      if (viewCount >= 50) {
        return '가장 많은 사람이 보고 있어요!';
      } else if (viewCount >= 20) {
        return '많은 사람들이 관심을 보이고 있어요!';
      } else {
        return '인기 있는 곳이에요!';
      }
    } else if (rank === 2) {
      // 2위: 조회수 증가량에 따라 메시지 변경
      if (viewCountIncrease >= 5) {
        return `급상승! 10분 동안 ${viewCountIncrease}명이 더 봤어요!`;
      } else if (viewCountIncrease > 0) {
        return `인기 상승 중! ${viewCountIncrease}명이 더 봤어요!`;
      } else {
        return '인기 있는 곳이에요!';
      }
    } else if (rank === 3) {
      // 3위: 조회수 증가량에 따라 메시지 변경
      if (viewCountIncrease >= 3) {
        return `10분 동안 조회수가 ${viewCountIncrease}명이 넘게 보고 있어요!`;
      } else if (viewCountIncrease > 0) {
        return `${viewCountIncrease}명이 더 찾고 있어요!`;
      } else {
        return '많은 사람들이 찾고 있어요!';
      }
    }
    return '많은 사람들이 찾고 있어요!';
  };

  // 조회수 증가량 기준으로 정렬하여 상위 3개 선택 (실시간 급상승)
  const topStores = useMemo(() => {
    // 백엔드에서 제공하는 viewCountIncrease 사용 (없으면 계산)
    const storesWithIncrease = stores.map(store => {
      // 백엔드에서 제공하는 증가량이 있으면 사용, 없으면 계산
      let viewCountIncrease = store.viewCountIncrease ?? 0;
      
      if (viewCountIncrease === 0 && store.viewCount !== undefined) {
        // 백엔드 증가량이 없으면 프론트엔드에서 계산 (fallback)
        const currentViewCount = store.viewCount ?? 0;
        const previousViewCount = previousViewCounts[store.id] ?? currentViewCount;
        viewCountIncrease = Math.max(0, currentViewCount - previousViewCount);
      }

      return {
        ...store,
        viewCountIncrease: viewCountIncrease,
      } as RankedStore;
    });

    // 조회수 증가량 기준으로 정렬 (증가량이 같으면 전체 조회수로 정렬)
    const sortedStores = storesWithIncrease
      .sort((a, b) => {
        // 먼저 증가량으로 정렬
        if (b.viewCountIncrease !== a.viewCountIncrease) {
          return b.viewCountIncrease - a.viewCountIncrease;
        }
        // 증가량이 같으면 전체 조회수로 정렬
        const aCount = a.viewCount ?? 0;
        const bCount = b.viewCount ?? 0;
        return bCount - aCount;
      })
      .slice(0, 3);

    // 순위 부여
    return sortedStores.map((store, index) => ({
      ...store,
      currentRank: index + 1,
    }));
  }, [stores, previousViewCounts]);

  // localStorage에서 이전 조회수 불러오기 및 초기화
  useEffect(() => {
    if (stores.length === 0 || Object.keys(previousViewCounts).length > 0) return; // 이미 설정되었으면 실행하지 않음
    
    try {
      const savedViewCounts = localStorage.getItem('placeViewCounts');
      const savedTimestamp = localStorage.getItem('placeViewCountsTimestamp');
      
      if (savedViewCounts && savedTimestamp) {
        const timestamp = parseInt(savedTimestamp, 10);
        const now = Date.now();
        const tenMinutes = 10 * 60 * 1000; // 10분 (밀리초)
        
        // 10분이 지났으면 리셋, 아니면 이전 조회수 사용
        if (now - timestamp < tenMinutes) {
          setPreviousViewCounts(JSON.parse(savedViewCounts));
        } else {
          // 10분이 지났으면 현재 조회수를 기준으로 리셋
          const currentViewCounts: { [key: string]: number } = {};
          stores.forEach(store => {
            currentViewCounts[store.id] = store.viewCount ?? 0;
          });
          setPreviousViewCounts(currentViewCounts);
          localStorage.setItem('placeViewCounts', JSON.stringify(currentViewCounts));
          localStorage.setItem('placeViewCountsTimestamp', now.toString());
        }
      } else {
        // 처음 로드 시 현재 조회수를 기준으로 설정
        const currentViewCounts: { [key: string]: number } = {};
        stores.forEach(store => {
          currentViewCounts[store.id] = store.viewCount ?? 0;
        });
        setPreviousViewCounts(currentViewCounts);
        localStorage.setItem('placeViewCounts', JSON.stringify(currentViewCounts));
        localStorage.setItem('placeViewCountsTimestamp', Date.now().toString());
      }
    } catch (e) {
      console.error('Failed to load view counts from localStorage:', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores]); // stores가 로드될 때 실행

  // 10분마다 이전 조회수를 현재 조회수로 리셋
  useEffect(() => {
    const interval = setInterval(() => {
      const newViewCounts: { [key: string]: number } = {};
      stores.forEach(store => {
        newViewCounts[store.id] = store.viewCount ?? 0;
      });
      
      setPreviousViewCounts(newViewCounts);
      localStorage.setItem('placeViewCounts', JSON.stringify(newViewCounts));
      localStorage.setItem('placeViewCountsTimestamp', Date.now().toString());
    }, 10 * 60 * 1000); // 10분마다 실행

    return () => clearInterval(interval);
  }, [stores]);

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
                  <span className="text-xs font-medium text-gray-600">
                    {getTrendingMessage(store.currentRank, store.viewCount ?? 0, store.viewCountIncrease)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

