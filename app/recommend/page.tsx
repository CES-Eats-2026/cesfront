'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import StoreCard from '@/components/StoreCard';
import { getRecommendations } from '@/lib/api';
import { Store, StoreType, TimeOption } from '@/types';

export default function RecommendPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRecommendations = async () => {
      const lat = parseFloat(searchParams.get('lat') || '0');
      const lng = parseFloat(searchParams.get('lng') || '0');
      const time = (searchParams.get('time') || '30') as TimeOption;
      const type = (searchParams.get('type') || 'all') as StoreType;

      if (!lat || !lng) {
        setError('위치 정보가 없습니다.');
        setLoading(false);
        return;
      }

      try {
        const response = await getRecommendations({
          latitude: lat,
          longitude: lng,
          timeOption: time,
          type: type,
        });
        setStores(response.stores);
      } catch (err) {
        setError('추천 결과를 가져오는데 실패했습니다.');
        console.error('Error fetching recommendations:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchRecommendations();
  }, [searchParams]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">추천 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md mx-4">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="mb-6">
          <button
            onClick={() => router.push('/')}
            className="text-blue-600 hover:text-blue-700 font-medium mb-4"
          >
            ← 뒤로 가기
          </button>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            추천 결과 (Top {stores.length})
          </h1>
          <p className="text-gray-600">
            카드를 클릭하면 Google Maps로 이동합니다
          </p>
        </div>

        <div className="space-y-4">
          {stores.length === 0 ? (
            <div className="bg-white rounded-xl shadow-md p-8 text-center">
              <p className="text-gray-600">추천할 장소가 없습니다.</p>
            </div>
          ) : (
            stores.map((store) => (
              <StoreCard key={store.id} store={store} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

