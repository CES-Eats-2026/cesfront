'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

interface SplashScreenProps {
  onComplete: () => void;
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // 2초 후 splash 화면 숨김
    const timer = setTimeout(() => {
      setIsVisible(false);
      // 페이드아웃 애니메이션 후 완료 콜백 호출
      setTimeout(() => {
        onComplete();
      }, 500); // 페이드아웃 애니메이션 시간
    }, 2000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-white flex flex-col items-center justify-center animate-fade-out">
      <div className="flex flex-col items-center justify-center space-y-6">
        {/* 로고 */}
        <div className="relative w-32 h-32 md:w-40 md:h-40">
          <Image
            src="/ces-eats-logo.png"
            alt="CES EATS Logo"
            fill
            className="object-contain"
            priority
          />
        </div>

        {/* CES EATS 2026 */}
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900">
          CES EATS 2026
        </h1>

        {/* 서브타이틀 */}
        <p className="text-base md:text-lg text-gray-600 text-center px-4">
          Quickly decide what to eat
        </p>
      </div>
    </div>
  );
}

