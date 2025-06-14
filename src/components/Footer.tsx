/* -------------------------------------------------------------------------- */
/*  src/components/Footer.tsx                                                 */
/* -------------------------------------------------------------------------- */
'use client'; // Needed for client-side interactivity (Disclosure)

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Disclosure } from '@headlessui/react'; // Import Disclosure for collapsible sections
import { ChevronDownIcon } from '@heroicons/react/24/outline'; // Import Chevron icon

const APP_NAME = 'ByeBuy';

/* ---------- Helper: footer links ---------- */
const FooterLink: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => (
  <Link
    href={href}
    className="text-sm text-slate-600 hover:text-indigo-600
               dark:text-bye-dark-text-secondary dark:hover:text-indigo-400
               transition-colors hover:underline"
  >
    {children}
  </Link>
);

/* ---------- Helper: social icon wrapper ---------- */
const SocialIcon: React.FC<{ href: string; iconSrc: string; label: string }> = ({
  href,
  iconSrc,
  label,
}) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    aria-label={label}
    className="text-slate-500 hover:text-indigo-600
               dark:text-bye-dark-text-secondary dark:hover:text-indigo-400
               transition-colors"
  >
    <Image src={iconSrc} alt={label} width={20} height={20} unoptimized={true} />
  </a>
);

/* ---------- Helper: Collapsible Footer Section for Mobile (using Headless UI Disclosure) ---------- */
interface FooterSectionProps {
  title: string;
  children: React.ReactNode;
}

const FooterSection: React.FC<FooterSectionProps> = ({ title, children }) => {
  return (
    <Disclosure as="div" className="border-b border-slate-200 dark:border-bye-dark-border-primary">
      {({ open }) => (
        <>
          <Disclosure.Button className="flex justify-between items-center w-full py-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-indigo-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-bye-dark-bg-secondary">
            <h5 className="text-sm font-semibold text-slate-700
                           dark:text-bye-dark-text-primary
                           tracking-wider uppercase">
              {title}
            </h5>
            <ChevronDownIcon
              className={`w-5 h-5 text-slate-500 dark:text-bye-dark-text-secondary transition-transform duration-200 ${
                open ? 'rotate-180' : ''
              }`}
            />
          </Disclosure.Button>
          <Disclosure.Panel className="pt-2 pb-3"> {/* Adjusted padding for compactness */}
            {children}
          </Disclosure.Panel>
        </>
      )}
    </Disclosure>
  );
};


/* ---------- Component ------------------------------------------------------ */
const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const placeholderHref = '/coming-soon';

  return (
    // MODIFIED: Reduced pt and pb for overall compactness
    <footer className="bg-slate-50 dark:bg-bye-dark-bg-secondary
                       border-t border-slate-200 dark:border-bye-dark-border-primary
                       pt-4 pb-4 mt-6">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* ---------- Desktop Top grid (hidden on mobile) ---------- */}
        {/* MODIFIED: Reduced gap-x for tighter columns, added hidden md:grid */}
        <div className="hidden md:grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-x-3 gap-y-8 mb-6">
          {/* Brand */}
          <div className="col-span-2 sm:col-span-3 md:col-span-1">
            <Link href="/" className="flex items-center space-x-2 mb-2 group"> {/* Changed mb-3 to mb-2 */}
              <Image
                src="/bidly-logo.svg"
                alt={`${APP_NAME} logo`}
                width={32}
                height={32}
                className="h-8 w-auto group-hover:opacity-90 transition-opacity"
                unoptimized={true}
                priority={true}
              />
              <span className="font-bold text-xl text-slate-800
                               dark:text-bye-dark-text-primary
                               group-hover:text-indigo-600 dark:group-hover:text-indigo-400
                               transition-colors">
                {APP_NAME}
              </span>
            </Link>
            <p className="text-sm text-slate-500 dark:text-bye-dark-text-secondary">
              Your campus marketplace.
            </p>
          </div>

          {/* Company */}
          <div className="md:justify-self-center">
            <h5 className="text-xs font-semibold text-slate-700
                           dark:text-bye-dark-text-primary
                           tracking-wider uppercase mb-2"> {/* Changed mb-3 to mb-2 */}
              Company
            </h5>
            <ul className="space-y-1.5"> {/* Changed space-y-2.5 to space-y-1.5 */}
              <li><FooterLink href="/about">About Us</FooterLink></li>
              {/* Removed: Our Story, Blog */}
            </ul>
          </div>

          {/* Support */}
          <div className="md:justify-self-center">
            <h5 className="text-xs font-semibold text-slate-700
                           dark:text-bye-dark-text-primary
                           tracking-wider uppercase mb-2"> {/* Changed mb-3 to mb-2 */}
              Support
            </h5>
            <ul className="space-y-1.5"> {/* Changed space-y-2.5 to space-y-1.5 */}
              <li><FooterLink href="/help">Help Center</FooterLink></li>
              {/* Removed: Contact Us, FAQ */}
            </ul>
          </div>

          {/* Legal */}
          <div className="md:justify-self-center">
            <h5 className="text-xs font-semibold text-slate-700
                           dark:text-bye-dark-text-primary
                           tracking-wider uppercase mb-2"> {/* Changed mb-3 to mb-2 */}
              Legal
            </h5>
            <ul className="space-y-1.5"> {/* Changed space-y-2.5 to space-y-1.5 */}
              <li><FooterLink href="/terms">Terms of Service</FooterLink></li>
              {/* Removed: Privacy Policy, Cookie Policy */}
            </ul>
          </div>

          {/* Connect / Social */}
          <div className="md:justify-self-end">
            <h5 className="text-xs font-semibold text-slate-700
                           dark:text-bye-dark-text-primary
                           tracking-wider uppercase mb-2"> {/* Changed mb-3 to mb-2 */}
              Connect
            </h5>
            <div className="flex space-x-5">
              <SocialIcon href={placeholderHref} label="Facebook" iconSrc="/icons/facebook.svg" />
              <SocialIcon href={placeholderHref} label="Instagram" iconSrc="/icons/instagram.svg" />
              <SocialIcon href={placeholderHref} label="X (formerly Twitter)" iconSrc="/icons/x-logo.svg" />
            </div>
          </div>
        </div>

        {/* ---------- Mobile Collapsible Sections (hidden on desktop) ---------- */}
        {/* MODIFIED: Added md:hidden, space-y for sections, pb for bottom spacing */}
        <div className="md:hidden space-y-4 pb-4">
            {/* Brand for Mobile (placed outside collapsible sections) */}
            <div className="flex items-center space-x-2 mb-4"> {/* Changed mb-3 to mb-4 for spacing */}
                <Link href="/" className="flex items-center space-x-2 group">
                    <Image
                        src="/bidly-logo.svg"
                        alt={`${APP_NAME} logo`}
                        width={32}
                        height={32}
                        className="h-8 w-auto group-hover:opacity-90 transition-opacity"
                        unoptimized={true}
                        priority={true}
                    />
                    <span className="font-bold text-xl text-slate-800
                                   dark:text-bye-dark-text-primary
                                   group-hover:text-indigo-600 dark:group-hover:text-indigo-400
                                   transition-colors">
                        {APP_NAME}
                    </span>
                </Link>
            </div>
            <p className="text-sm text-slate-500 dark:text-bye-dark-text-secondary mb-6"> {/* Added mb-6 for spacing */}
              Your campus marketplace.
            </p>

            {/* Using the new FooterSection component for mobile collapsibles */}
            <FooterSection title="Company">
              <ul className="space-y-1.5">
                <li><FooterLink href="/about">About Us</FooterLink></li>
              </ul>
            </FooterSection>

            <FooterSection title="Support">
              <ul className="space-y-1.5">
                <li><FooterLink href="/help">Help Center</FooterLink></li>
              </ul>
            </FooterSection>

            <FooterSection title="Legal">
              <ul className="space-y-1.5">
                <li><FooterLink href="/terms">Terms of Service</FooterLink></li>
              </ul>
            </FooterSection>

            {/* Connect section for mobile (not collapsible, but part of mobile layout) */}
            <div className="pt-4"> {/* Added padding top to separate from last collapsible */}
                <h5 className="text-sm font-semibold text-slate-700
                               dark:text-bye-dark-text-primary
                               tracking-wider uppercase mb-3">
                  Connect
                </h5>
                <div className="flex space-x-5">
                  <SocialIcon href={placeholderHref} label="Facebook" iconSrc="/icons/facebook.svg" />
                  <SocialIcon href={placeholderHref} label="Instagram" iconSrc="/icons/instagram.svg" />
                  <SocialIcon href={placeholderHref} label="X (formerly Twitter)" iconSrc="/icons/x-logo.svg" />
                </div>
            </div>
        </div>


        {/* ---------- Bottom line ---------- */}
        {/* MODIFIED: Reduced pt for compactness */}
        <div className="mt-4 pt-2 border-t border-slate-200
                        dark:border-bye-dark-border-primary text-center">
          <p className="text-sm text-slate-500 dark:text-bye-dark-text-secondary">
            © {currentYear} {APP_NAME}. All rights reserved.
          </p>
          <p className="text-xs text-slate-400 dark:text-bye-dark-text-secondary opacity-75 mt-1">
            Built with passion by students, for students.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;