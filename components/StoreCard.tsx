'use client';

import { Store } from '@/types';
import { getGoogleMapsDeepLink, incrementPlaceView } from '@/lib/api';

interface StoreCardProps {
  store: Store;
  isSelected?: boolean; // 선택되었는지 여부
  onViewCountUpdate?: (placeId: string, viewCount: number) => void; // 조회수 업데이트 콜백
}

export default function StoreCard({ store, isSelected = false, onViewCountUpdate }: StoreCardProps) {
  const handleNavigate = async () => {
    // 조회수 증가 (길찾기 버튼 클릭 시) 및 실시간 업데이트
    const updatedViewCount = await incrementPlaceView(store.id);
    if (updatedViewCount !== null && onViewCountUpdate) {
      onViewCountUpdate(store.id, updatedViewCount);
    }
    
    const deepLink = getGoogleMapsDeepLink(store.latitude, store.longitude);
    window.open(deepLink, '_blank');
  };

  return (
    <div
      className="bg-white rounded-xl shadow-md border border-gray-200 hover:shadow-lg transition-shadow overflow-hidden"
    >
      <div className="p-5">
        <div className="flex justify-between items-start mb-3">
          <h3 className="text-xl font-bold text-gray-900">{store.name}</h3>
        </div>

      <div className="mb-4">
        <div className="flex items-center text-sm text-gray-600">
          <span className="font-medium">도보:</span>
          <span className="ml-2">{store.walkingTime}분</span>
        </div>
      </div>

      {/* 리뷰 표시 */}
      {store.reviews && store.reviews.length > 0 ? (
        <div className="mb-4 space-y-2">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">리뷰</h4>
          <div className="space-y-3 max-h-48 overflow-y-auto">
            {store.reviews.slice(0, 3).map((review, index) => (
              <div key={index} className="border-l-2 border-blue-200 pl-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-gray-800">
                    {review.authorName || '익명'}
                  </span>
                  {review.rating && (
                    <div className="flex items-center">
                      {[...Array(5)].map((_, i) => (
                        <span
                          key={i}
                          className={`text-xs ${
                            i < review.rating
                              ? 'text-yellow-400'
                              : 'text-gray-300'
                          }`}
                        >
                          ★
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {review.text && (
                  <p className="text-xs text-gray-600 line-clamp-2">{review.text}</p>
                )}
                {review.relativeTimeDescription && (
                  <span className="text-xs text-gray-400 block mt-1">
                    {review.relativeTimeDescription}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="pt-3 border-t border-gray-200">
        <p className="text-sm text-gray-700 leading-relaxed">
          <span className="font-semibold text-blue-600">한줄평:</span>{' '}
          {store.cesReason}
        </p>
      </div>

      <button
        onClick={handleNavigate}
        className="mt-4 w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
      >
        길찾기
      </button>
      </div>
    </div>
  );
}

