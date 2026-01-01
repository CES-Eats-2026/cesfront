# CESEats 2026

Las Vegas 2026 1/6 ~ 1/9 CES 전시장에서 빠른 식사 선택을 돕는 웹 애플리케이션입니다.

## 기능

- 🗺️ Google Maps 기반 지도 표시
- 📍 현재 위치 기반 음식점 추천
- 🚶 도보 시간 계산
- 📸 장소 사진 슬라이드
- ⭐ 리뷰 및 평점 표시
- 💬 피드백 기능

## 시작하기

### 필수 요구사항

- Node.js 18 이상
- npm 또는 yarn

### 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev
```


## 환경 변수 설정

### 로컬 개발 (.env.local)

```env
# Google Maps API 키 (필수)
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key

# 백엔드 API URL (필수)
# 로컬 개발: http://localhost:8080/api
# 프로덕션: https://ceseats.r-e.kr/api (백엔드 서버)
NEXT_PUBLIC_API_URL=http://localhost:8080/api

# Discord 웹훅 URL (선택, 피드백 기능용)
NEXT_PUBLIC_DISCORD_WEBHOOK_URL=your_discord_webhook_url
```

### Vercel 프로덕션 배포

Vercel 대시보드 → Settings → Environment Variables에서 설정:

```env
# Google Maps API 키 (필수)
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key

# 백엔드 API URL (필수)
NEXT_PUBLIC_API_URL=https://ceseats.r-e.kr/api

# Discord 웹훅 URL (선택, 피드백 기능용)
NEXT_PUBLIC_DISCORD_WEBHOOK_URL=your_discord_webhook_url
```

**참고**: 자세한 설정 방법은 `VERCEL_ENV_SETUP.md` 참고

## 기술 스택

- **Framework**: Next.js 16
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Maps**: Google Maps JavaScript API
- **UI**: React 19

## 프로젝트 구조

```
front/
├── app/              # Next.js App Router 페이지
├── components/       # React 컴포넌트
├── lib/             # 유틸리티 함수
├── types/           # TypeScript 타입 정의
└── public/          # 정적 파일
```