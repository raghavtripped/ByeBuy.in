// src/components/MobileBottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';

// Icon Imports from react-icons
import { AiOutlineHome, AiFillHome } from 'react-icons/ai';
import { FiHeart, FiUser } from 'react-icons/fi';
import { FaHeart, FaUserAlt } from 'react-icons/fa';
import { IoAddCircleSharp } from 'react-icons/io5'; // For Create
import { BsListTask, BsListStars } from 'react-icons/bs'; // For My Bids

interface NavItem {
  href: string;
  label: string;
  inactiveIcon: React.ElementType;
  activeIcon: React.ElementType;
  isCreateButton?: boolean; // Optional flag for special styling
}

const navItems: NavItem[] = [
  { href: '/listings', label: 'Home', inactiveIcon: AiOutlineHome, activeIcon: AiFillHome },
  { href: '/my-watchlist', label: 'Watchlist', inactiveIcon: FiHeart, activeIcon: FaHeart },
  { href: '/listings/new', label: 'Create', inactiveIcon: IoAddCircleSharp, activeIcon: IoAddCircleSharp, isCreateButton: true },
  { href: '/my-bids', label: 'My Bids', inactiveIcon: BsListTask, activeIcon: BsListStars },
  { href: '/profile', label: 'Profile', inactiveIcon: FiUser, activeIcon: FaUserAlt },
];

const MobileBottomNav: React.FC = () => {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 shadow-top-nav">
      <div className="max-w-md mx-auto flex justify-around items-center h-16">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href === '/listings' && pathname === '/'); // Treat /listings and / as same for Home

          const IconComponent = isActive ? item.activeIcon : item.inactiveIcon;

          return (
            <Link
              key={item.label}
              href={item.href}
              className={`
                flex flex-col items-center justify-center flex-1 
                text-xs font-medium transition-colors duration-150
                h-full 
                ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-300'}
                ${item.isCreateButton ? '-mt-1' : ''} // Slightly raise the create button if desired
              `}
            >
              <IconComponent
                className={`
                  mb-0.5 
                  ${item.isCreateButton ? 'w-8 h-8 text-indigo-600 dark:text-indigo-400' : 'w-6 h-6'}
                `}
              />
              <span className={item.isCreateButton ? 'font-semibold' : ''}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileBottomNav;