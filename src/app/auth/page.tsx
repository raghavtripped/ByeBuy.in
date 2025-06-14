// src/app/auth/page.tsx
'use client';

import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SparklesIcon, ShieldCheckIcon, UserGroupIcon, BoltIcon } from '@heroicons/react/24/outline';

export default function AuthPage() {
  const [mounted, setMounted] = useState(false);
  const supabase = createClientComponentClient();

  useEffect(() => {
    setMounted(true); // Indicates client-side rendering is ready
  }, []);

  // Enhanced loading state matching listings page hero spinner
  if (!mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-bye-dark-bg-primary dark:via-bye-dark-bg-primary dark:to-bye-dark-bg-primary flex items-center justify-center p-4">
        <div className="text-center">
          <div className="relative">
            <div className="w-16 h-16 mx-auto mb-6 relative">
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-purple-400 to-indigo-500 animate-spin opacity-20"></div>
              <div className="absolute inset-2 rounded-full bg-gradient-to-r from-purple-400 to-indigo-500 animate-pulse"></div>
              <SparklesIcon className="absolute inset-3 text-white" />
            </div>
            <p className="text-sm text-gray-500 dark:text-bye-dark-text-secondary">Initializing Secure Session...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-bye-dark-bg-primary dark:via-bye-dark-bg-primary dark:to-bye-dark-bg-primary relative overflow-hidden">
      {/* Animated background elements - consistent with listings page */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-4 -right-4 w-96 h-96 bg-gradient-to-br from-purple-300/15 to-indigo-400/15 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-8 -left-8 w-96 h-96 bg-gradient-to-tr from-blue-300/15 to-purple-400/15 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-gradient-to-r from-purple-300/10 to-indigo-400/10 rounded-full blur-2xl animate-pulse delay-500"></div>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8">
          
          {/* Logo/Brand section */}
          <div className="text-center">
            <div className="flex items-center justify-center mb-8">
              <div className="relative">
                {/* Adjusted icon box gradient to be more subtle purple/indigo */}
                <div className="absolute inset-0 bg-gradient-to-r from-purple-400 to-indigo-500 rounded-2xl blur opacity-25 animate-pulse"></div>
                <div className="relative bg-white dark:bg-bye-dark-bg-secondary rounded-2xl p-4 shadow-xl">
                  {/* Adjusted icon color to subtle purple */}
                  <SparklesIcon className="w-10 h-10 text-purple-500 dark:text-purple-400" />
                </div>
              </div>
            </div>
            
            {/* Main Title - Updated gradient to match listings page */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold bg-gradient-to-r from-violet-600 via-purple-600 to-blue-600 bg-clip-text text-transparent mb-4 pb-1 sm:pb-2">
              Welcome to ByeBuy
            </h1>
            
            <p className="text-lg sm:text-xl text-gray-600 dark:text-bye-dark-text-secondary mb-2">
              Join the campus marketplace
            </p>
            
            {/* Email restriction badge - Updated colors to match listings */}
            <div className="inline-flex items-center gap-2 bg-white/80 dark:bg-bye-dark-bg-secondary/80 backdrop-blur-sm rounded-full px-4 py-2 shadow-lg border border-indigo-100 dark:border-indigo-900/30">
              <ShieldCheckIcon className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-bye-dark-text-primary">
                @iimidr.ac.in emails only
              </span>
            </div>
          </div>

          {/* Auth form container */}
          <div className="relative">
            {/* Glassmorphism container */}
            <div className="relative bg-white/90 dark:bg-bye-dark-bg-secondary/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-bye-dark-border-primary/20 p-8 sm:p-10">
              
              {/* Decorative gradient border - Adjusted to subtle purple/indigo */}
              <div className="absolute inset-0 bg-gradient-to-r from-purple-400/10 via-indigo-400/10 to-blue-400/10 rounded-3xl blur-xl opacity-30"></div>
              
              <div className="relative z-10">
                <Auth
                  supabaseClient={supabase}
                  appearance={{
                    theme: ThemeSupa, // Supabase's own theme, good starting point
                    variables: {
                      default: { // Overrides for both light and dark unless specified
                        colors: {
                          brand: '#7c3aed', // Changed to violet-600
                          brandAccent: '#6d28d9', // Changed to violet-700
                          brandButtonText: 'white',
                          defaultButtonBackground: '#f1f5f9', // Changed to match hover state
                          defaultButtonBackgroundHover: '#e2e8f0', // Darker hover state
                          defaultButtonBorder: '#e2e8f0',
                          defaultButtonText: '#334155',
                          dividerBackground: '#e2e8f0',
                          inputBackground: '#ffffff',
                          inputBorder: '#e2e8f0',
                          inputBorderHover: '#c7d2fe',
                          inputBorderFocus: '#7c3aed', // Changed to violet-600
                          inputText: '#1e293b',
                          inputLabelText: '#475569',
                          inputPlaceholder: '#94a3b8',
                          messageText: '#ef4444',
                          messageTextDanger: '#dc2626',
                          anchorTextColor: '#7c3aed', // violet-600
                          anchorTextHoverColor: '#6d28d9', // violet-700
                        },
                        space: { // Keeping space consistent
                          spaceSmall: '4px', spaceMedium: '8px', spaceLarge: '16px',
                          labelBottomMargin: '8px', anchorBottomMargin: '4px',
                          buttonPadding: '10px 15px', inputPadding: '10px 15px',
                        },
                        fontSizes: { // Keeping font sizes consistent
                          baseBodySize: '14px', baseInputSize: '14px',
                          baseLabelSize: '14px', baseButtonSize: '14px',
                        },
                        fonts: { // Using Tailwind's default sans-serif stack
                          bodyFontFamily: `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"`,
                          buttonFontFamily: `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"`,
                          inputFontFamily: `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"`,
                          labelFontFamily: `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"`,
                        },
                        borderWidths: { buttonBorderWidth: '1px', inputBorderWidth: '1px' },
                        radii: { borderRadiusButton: '12px', buttonBorderRadius: '12px', inputBorderRadius: '12px' }, // Slightly larger radius
                      },
                    },
                    className: { // Overriding specific component classes
                      anchor: 'font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 transition-colors hover:underline',
                      button: 'font-semibold shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105 bg-violet-600 hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-700',
                      container: 'space-y-6', // Spacing between elements in the form
                      input: 'transition-all duration-200 focus:ring-2 focus:ring-violet-500/30 dark:focus:ring-violet-500/30 focus:border-violet-600 dark:focus:border-violet-600 bg-white dark:bg-bye-dark-bg-hover border-gray-300 dark:border-bye-dark-border-primary text-gray-900 dark:text-bye-dark-text-primary placeholder-gray-400 dark:placeholder-bye-dark-text-secondary',
                      label: 'font-medium text-gray-700 dark:text-bye-dark-text-primary',
                      message: 'text-sm p-3 rounded-md bg-red-50 dark:bg-red-900/25 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700/50', // For error messages
                    },
                  }}
                  providers={['google']}
                  socialLayout="horizontal"
                  theme={typeof window !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light'} // Dynamically set theme
                  localization={{
                    variables: {
                      sign_in: {
                        email_label: 'Institutional Email (@iimidr.ac.in)',
                        password_label: 'Password',
                        button_label: 'Sign in to ByeBuy',
                        social_provider_text: 'Continue with {{provider}}',
                      },
                      sign_up: {
                        email_label: 'Institutional Email (@iimidr.ac.in)',
                        password_label: 'Create password',
                        button_label: 'Join ByeBuy',
                        social_provider_text: 'Continue with {{provider}}',
                      },
                    },
                  }}
                />
              </div>
            </div>
          </div>

          {/* Features section */}
          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="text-center p-4 bg-white/60 dark:bg-bye-dark-bg-secondary/60 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20">
              <div className="w-12 h-12 bg-gradient-to-r from-violet-500 to-purple-600 rounded-xl flex items-center justify-center mx-auto mb-3">
                <BoltIcon className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-bye-dark-text-primary text-sm mb-1">
                Fast Bidding
              </h3>
              <p className="text-xs text-gray-600 dark:text-bye-dark-text-secondary">
                Real-time auctions
              </p>
            </div>
            
            <div className="text-center p-4 bg-white/60 dark:bg-bye-dark-bg-secondary/60 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20">
              <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-3">
                <ShieldCheckIcon className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-bye-dark-text-primary text-sm mb-1">
                Secure
              </h3>
              <p className="text-xs text-gray-600 dark:text-bye-dark-text-secondary">
                Campus verified
              </p>
            </div>
            
            <div className="text-center p-4 bg-white/60 dark:bg-bye-dark-bg-secondary/60 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20">
              <div className="w-12 h-12 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center mx-auto mb-3">
                <UserGroupIcon className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-bye-dark-text-primary text-sm mb-1">
                Community
              </h3>
              <p className="text-xs text-gray-600 dark:text-bye-dark-text-secondary">
                Students only
              </p>
            </div>
          </div>

          {/* Footer text - Updated link colors */}
          <div className="text-center">
            <p className="text-xs text-gray-500 dark:text-bye-dark-text-secondary">
              By continuing, you agree to our{' '}
              <Link href="/terms" className="text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 font-medium transition-colors">
                Terms of Service
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}