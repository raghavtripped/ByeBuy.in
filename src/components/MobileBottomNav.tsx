
/* -------------------------------------------------------------------------- */
/*  src/components/MobileBottomNav.tsx                                        */
/* -------------------------------------------------------------------------- */
'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/* ---------- Icons (react-icons) ----------- */
import { AiOutlineHome, AiFillHome } from 'react-icons/ai';
import { FiHeart, FiUser }          from 'react-icons/fi';
import { FaHeart, FaUserAlt }       from 'react-icons/fa';
import { IoAddCircleSharp }         from 'react-icons/io5';
import { BsListTask, BsListStars }  from 'react-icons/bs';

/* ---------- Types ------------------------- */
interface NavItem {
  href: string;
  label: string;
  inactiveIcon: React.ElementType;
  activeIcon: React.ElementType;
  isCreateButton?: boolean;               // special styling
}

/* ---------- Config ------------------------ */
const navItems: NavItem[] = [
  { href: '/listings',     label: 'Home',      inactiveIcon: AiOutlineHome,  activeIcon: AiFillHome },
  { href: '/my-watchlist', label: 'Watchlist', inactiveIcon: FiHeart,        activeIcon: FaHeart },
  { href: '/listings/new', label: 'Create',    inactiveIcon: IoAddCircleSharp, activeIcon: IoAddCircleSharp, isCreateButton: true },
  { href: '/my-bids',      label: 'My Bids',   inactiveIcon: BsListTask,     activeIcon: BsListStars },
  { href: '/profile',      label: 'Profile',   inactiveIcon: FiUser,         activeIcon: FaUserAlt },
];

/* ---------- Component --------------------- */
const MobileBottomNav: React.FC = () => {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40
                    bg-white dark:bg-bye-dark-bg-secondary
                    border-t border-slate-200 dark:border-bye-dark-border-primary
                    shadow-top-nav">
      {/* shadow-top-nav → define in globals or replace with a Tailwind shadow util */}
      <div className="max-w-md mx-auto flex justify-around items-center h-16">
        {navItems.map(({ href, label, inactiveIcon, activeIcon, isCreateButton }) => {
          const isActive   = pathname === href || (href === '/listings' && pathname === '/');
          const Icon       = isActive ? activeIcon : inactiveIcon;

          return (
            <Link
              key={label}
              href={href}
              className={`
                flex flex-col items-center justify-center flex-1 h-full
                text-xs font-medium transition-colors duration-150
                ${isActive
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-slate-500 dark:text-bye-dark-text-secondary hover:text-indigo-500 dark:hover:text-indigo-400'}
                ${isCreateButton ? '-mt-1' : ''}
              `}
            >
              <Icon
                className={`
                  mb-0.5
                  ${isCreateButton
                    ? 'w-8 h-8 text-indigo-600 dark:text-indigo-400'
                    : 'w-6 h-6'}
                `}
              />
              <span className={isCreateButton ? 'font-semibold' : ''}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileBottomNav;
