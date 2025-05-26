// src/components/SplashScreen.tsx
'use client';

import { useState, useEffect } from 'react';

interface SplashScreenProps {
  onHidden: () => void;
  minDisplayTime?: number;
}

const SplashScreen = ({ onHidden, minDisplayTime = 3500 }: SplashScreenProps) => { // Adjusted minDisplayTime to match your original
  const [animationPhase, setAnimationPhase] = useState('enter'); // 'enter', 'show', 'exit'

  useEffect(() => {
    const enterDuration = 500;  // Time for initial content to start appearing
    const contentShowDuration = 2500; // Time content is primarily visible and animating
    const exitDuration = 500;   // Time for fade-out

    // Ensure total visibility meets minDisplayTime
    const totalCalculatedDuration = enterDuration + contentShowDuration + exitDuration;
    const actualContentShowDuration = minDisplayTime > totalCalculatedDuration 
                                      ? contentShowDuration + (minDisplayTime - totalCalculatedDuration) 
                                      : contentShowDuration;

    const timer1 = setTimeout(() => {
      setAnimationPhase('show');
    }, enterDuration);

    const timer2 = setTimeout(() => {
      setAnimationPhase('exit');
    }, enterDuration + actualContentShowDuration);

    const timer3 = setTimeout(() => {
      onHidden(); // Signal to parent that it can be unmounted
    }, enterDuration + actualContentShowDuration + exitDuration);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [onHidden, minDisplayTime]);

  let phaseClasses = '';
  if (animationPhase === 'enter') phaseClasses = 'opacity-0 scale-90';
  else if (animationPhase === 'show') phaseClasses = 'opacity-100 scale-100';
  else phaseClasses = 'opacity-0 scale-110';

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center 
                 bg-gradient-to-br from-bye-dark-bg-primary via-bye-dark-bg-secondary to-bye-dark-bg-primary 
                 transition-all duration-1000 ease-in-out ${phaseClasses}`} // Main transition for the whole splash
      aria-hidden="true"
    >
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className={`absolute -top-40 -right-40 w-80 h-80 bg-bye-dark-bg-hover/20 rounded-full blur-3xl transition-all duration-3000 ${animationPhase === 'show' ? 'animate-pulse opacity-50' : 'opacity-0'}`} style={{ animationDelay: '0.2s' }}></div>
        <div className={`absolute -bottom-40 -left-40 w-96 h-96 bg-bye-dark-border-primary/10 rounded-full blur-3xl transition-all duration-3000 ${animationPhase === 'show' ? 'animate-pulse opacity-50' : 'opacity-0'}`} style={{ animationDelay: '0.5s' }}></div>
        <div className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-500/5 rounded-full blur-2xl transition-all duration-3000 ${animationPhase === 'show' ? 'animate-ping opacity-30' : 'opacity-0'}`}></div>
      </div>

      {/* Main content */}
      <div className="relative z-10 text-center px-8 max-w-2xl mx-auto">
        {/* Logo/Brand name */}
        <div className={`transition-all duration-1000 ease-out ${
          animationPhase === 'show' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`} style={{ transitionDelay: animationPhase === 'show' ? '300ms' : '0ms' }}>
          <h1 className="text-6xl md:text-8xl font-bold text-white mb-4 tracking-tight drop-shadow-lg">
            Bye<span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-400 to-pink-400">Buy</span>
          </h1>
        </div>

        {/* Subtitle */}
        <div className={`transition-all duration-1000 ease-out ${
          animationPhase === 'show' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`} style={{ transitionDelay: animationPhase === 'show' ? '500ms' : '0ms' }}>
          <p className="text-2xl md:text-3xl text-white/90 font-light mb-8 leading-relaxed">
            Discover Great Deals On IIM Indore Campus
          </p>
        </div>

        {/* Animated rupee symbol - Restored */}
        <div className={`transition-all duration-1000 ease-out ${
          animationPhase === 'show' ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
        }`} style={{ transitionDelay: animationPhase === 'show' ? '700ms' : '0ms' }}>
          <div className="inline-flex items-center justify-center w-24 h-24 bg-white/10 backdrop-blur-md rounded-full border border-white/20 mb-8 shadow-lg">
            <span className="text-4xl text-white">₹</span>
          </div>
        </div>

        {/* Tagline - Restored */}
        <div className={`transition-all duration-1000 ease-out ${
          animationPhase === 'show' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`} style={{ transitionDelay: animationPhase === 'show' ? '1000ms' : '0ms' }}>
          <p className="text-lg text-white/70 font-medium tracking-wide">
            Buy • Sell • Bid • Win
          </p>
        </div>

        {/* Loading dots - Restored */}
        <div className={`mt-12 transition-opacity duration-1000 ${
          animationPhase === 'show' ? 'opacity-100' : 'opacity-0'
        }`} style={{ transitionDelay: animationPhase === 'show' ? '1200ms' : '0ms' }}>
          <div className="flex justify-center space-x-2">
            <div className="w-3 h-3 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-3 h-3 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-3 h-3 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>

      {/* Floating particles - Restored */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className={`absolute w-2 h-2 bg-white/20 rounded-full transition-all duration-3000 ${
              animationPhase === 'show' ? 'animate-float' : 'opacity-0'
            }`}
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${3 + Math.random() * 2}s`
            }}
          ></div>
        ))}
      </div>

      <style jsx>{`
        @keyframes float {
          0%, 100% { 
            transform: translateY(0px) rotate(0deg); 
            opacity: 0.2; /* Subtle start/end opacity */
          }
          50% { 
            transform: translateY(-25px) rotate(180deg); /* Increased float distance */
            opacity: 0.7; /* Brighter at peak */
          }
        }
        .animate-float {
          animation: float 4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default SplashScreen;