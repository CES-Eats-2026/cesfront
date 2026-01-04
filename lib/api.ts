import { RecommendationRequest, RecommendationResponse, Store } from '@/types';

// 백엔드 API URL (프로덕션: https://ceseats.r-e.kr/api, 로컬: http://localhost:8080/api)
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://ceseats.r-e.kr/api';

export async function getRecommendations(
  request: RecommendationRequest
): Promise<RecommendationResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/recommendations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error:', response.status, errorText);
      throw new Error(`Failed to fetch recommendations: ${response.status} ${errorText}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      throw new Error('백엔드 서버에 연결할 수 없습니다. 백엔드가 실행 중인지 확인하세요.');
    }
    throw error;
  }
}

export function getGoogleMapsDeepLink(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
}

/**
 * 장소 조회수 증가 API 호출
 * @param placeId Google Places place_id
 * @returns 업데이트된 조회수
 */
export async function incrementPlaceView(placeId: string): Promise<number | null> {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://ceseats.r-e.kr/api';
  
  try {
    const response = await fetch(`${API_BASE_URL}/places/${placeId}/view`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Failed to increment view count:', response.status);
      return null;
    }

    // 응답 본문이 있는지 확인
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.error('Response is not JSON:', contentType);
      return null;
    }

    // 응답 본문 텍스트로 먼저 읽어서 확인
    const text = await response.text();
    if (!text || text.trim().length === 0) {
      console.error('Response body is empty');
      return null;
    }

    try {
      const viewCount = JSON.parse(text);
      return typeof viewCount === 'number' ? viewCount : null;
    } catch (parseError) {
      console.error('Failed to parse JSON:', parseError, 'Response text:', text);
      return null;
    }
  } catch (error) {
    console.error('Error incrementing view count:', error);
    return null;
  }
}

/**
 * RAG 기반 자연어 추천 API 호출
 * @param latitude 위도
 * @param longitude 경도
 * @param maxDistanceKm 최대 거리 (km)
 * @param userPreference 사용자 자연어 선호도
 * @returns 추천된 장소 리스트와 이유
 */
export async function getRagRecommendations(
  latitude: number,
  longitude: number,
  maxDistanceKm: number,
  userPreference: string
): Promise<{ stores: Store[]; reason: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/rag/recommendations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        latitude,
        longitude,
        maxDistanceKm,
        userPreference,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('RAG API Error:', response.status, errorText);
      throw new Error(`Failed to fetch RAG recommendations: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return {
      stores: Array.isArray(data.stores) ? data.stores : [],
      reason: data.reason || '추천 장소를 찾았습니다.'
    };
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      throw new Error('백엔드 서버에 연결할 수 없습니다. 백엔드가 실행 중인지 확인하세요.');
    }
    throw error;
  }
}

/**
 * 피드백을 백엔드 API를 통해 Discord로 전송
 * @param feedback 피드백 내용
 * @param image 이미지 파일 (선택사항)
 */
export async function sendFeedbackToDiscord(feedback: string, image: File | null): Promise<void> {
  try {
    let imageBase64: string | undefined;
    let imageName: string | undefined;

    // 이미지가 있으면 base64로 변환
    if (image) {
      imageBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64String = reader.result as string;
          // data:image/jpeg;base64, 부분 제거
          const base64 = base64String.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(image);
      });
      imageName = image.name;
    }

    const response = await fetch(`${API_BASE_URL}/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        feedback,
        imageBase64,
        imageName,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(errorData.message || `피드백 전송 실패: ${response.status}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || '피드백 전송에 실패했습니다.');
    }
  } catch (error) {
    console.error('Error sending feedback:', error);
    throw error;
  }
}

