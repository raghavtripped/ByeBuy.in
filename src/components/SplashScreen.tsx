// src/components/SplashScreen.tsx
'use client';

import { useState, useEffect } from 'react';

interface SplashScreenProps {
  onHidden: () => void; // Renamed for clarity: called when splash is ready to be unmounted
  minDisplayTime?: number;
}

const SplashScreen = ({ onHidden, minDisplayTime = 2500 }: SplashScreenProps) => {
  const [animationPhase, setAnimationPhase] = useState('enter'); // 'enter', 'show', 'exit'

  useEffect(() => {
    const enterDuration = 400;
    const exitAnimationDuration = 500; // Duration of the opacity/scale out animation
    const showDuration = Math.max(0, minDisplayTime - enterDuration - exitAnimationDuration);

    const timer1 = setTimeout(() => {
      setAnimationPhase('show');
    }, enterDuration);

    const timer2 = setTimeout(() => {
      setAnimationPhase('exit');
    }, enterDuration + showDuration);

    const timer3 = setTimeout(() => {
      onHidden(); // Signal to parent that it can be unmounted
    }, enterDuration + showDuration + exitAnimationDuration);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [onHidden, minDisplayTime]);

  let phaseClasses = '';
  if (animationPhase === 'enter') phaseClasses = 'opacity-0 scale-90';
  else if (animationPhase === 'show') phaseClasses = 'opacity-100 scale-100';
  else phaseClasses = 'opacity-0 scale-110'; // exit

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-br from-indigo-700 via-purple-700 to-pink-700 transition-all duration-500 ease-in-out ${phaseClasses}`}
      aria-hidden="true" // It's decorative and temporary
    >
      {/* Visuals (Copied from your last version, ensure theme colors are what you want) */}
      <div className="absolute inset-0 overflow-hidden">
        <div className={`absolute -top-1/4 -right-1/4 w-1/2 h-1/2 bg-pink-500/10 rounded-full blur-3xl transition-all duration-2000 ${animationPhase === 'show' ? 'animate-pulse opacity-60' : 'opacity-0'}`} style={{ animationDelay: '0.2s' }}></div>
        <div className={`absolute -bottom-1/4 -left-1/4 w-7/12 h-7/12 bg-indigo-500/15 rounded-full blur-3xl transition-all duration-2000 ${animationPhase === 'show' ? 'animate-pulse opacity-60' : 'opacity-0'}`} style={{ animationDelay: '0.5s' }}></div>
      </div>
      <div className="relative z-10 text-center px-6 max-w-md mx-auto">
        <div className={`transition-all duration-700 ease-out ${animationPhase === 'show' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`} style={{ transitionDelay: animationPhase === 'show' ? '100ms' : '0ms' }}>
          <h1 className="text-6xl sm:text-7xl font-bold text-white mb-2 tracking-tight drop-shadow-lg">
            Bye<span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-orange-400 to-pink-400">Buy</span>
          </h1>
        </div>
        <div className={`transition-all duration-700 ease-out ${animationPhase === 'show' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`} style={{ transitionDelay: animationPhase === 'show' ? '300ms' : '0ms' }}>
          <p className="text-xl sm:text-2xl text-white/80 font-light mb-8 leading-relaxed">
            Discover great finds on campus
          </p>
        </div>
        <div className={`transition-all duration-700 ease-out ${animationPhase === 'show' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`} style={{ transitionDelay: animationPhase === 'show' ? '500ms' : '0ms' }}>
          <p className="text-base text-white/70 font-medium tracking-wide">
            Buy • Sell • Bid • Win
          </p>
        </div>
        <div className={`mt-10 transition-opacity duration-500 ${animationPhase === 'show' ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDelay: animationPhase === 'show' ? '700ms' : '0ms' }}>
          <div className="flex justify-center space-x-1.5">
            <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;