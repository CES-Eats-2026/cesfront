import { RecommendationRequest, RecommendationResponse } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api';

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
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api';
  
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

export async function sendFeedbackToDiscord(feedback: string, image: File | null): Promise<void> {
  const webhookUrl = process.env.NEXT_PUBLIC_DISCORD_WEBHOOK_URL;
  
  if (!webhookUrl) {
    throw new Error('Discord 웹훅 URL이 설정되지 않았습니다.');
  }

  try {
    if (image) {
      // 이미지가 있는 경우 multipart/form-data로 전송
      const payload = {
        content: `**새 피드백이 도착했습니다!**\n\n${feedback}`,
        embeds: [
          {
            title: '피드백 내용',
            description: feedback,
            color: 0x3498db, // 파란색
            timestamp: new Date().toISOString(),
          },
        ],
      };

      const formData = new FormData();
      formData.append('payload_json', JSON.stringify(payload));
      formData.append('file', image, image.name);

      const response = await fetch(webhookUrl, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Discord 웹훅 전송 실패: ${response.status} ${errorText}`);
      }
    } else {
      // 이미지가 없는 경우 JSON만 전송
      const payload = {
        content: `**새 피드백이 도착했습니다!**\n\n${feedback}`,
        embeds: [
          {
            title: '피드백 내용',
            description: feedback,
            color: 0x3498db,
            timestamp: new Date().toISOString(),
          },
        ],
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Discord 웹훅 전송 실패: ${response.status} ${errorText}`);
      }
    }
  } catch (error) {
    console.error('Error sending feedback to Discord:', error);
    throw error;
  }
}

