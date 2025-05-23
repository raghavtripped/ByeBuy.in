
/* -------------------------------------------------------------------------- */
/*  src/components/Footer.tsx                                                 */
/* -------------------------------------------------------------------------- */
import React from 'react';
import Link from 'next/link';
import Image from 'next/image';

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
    <Image src={iconSrc} alt={label} width={20} height={20} />
  </a>
);

/* ---------- Component ------------------------------------------------------ */
const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const placeholderHref = '/coming-soon';

  return (
    <footer className="bg-slate-50 dark:bg-bye-dark-bg-secondary
                       border-t border-slate-200 dark:border-bye-dark-border-primary
                       pt-6 pb-6 mt-6">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* ---------- Top grid ---------- */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-x-6 gap-y-8 mb-6">
          {/* Brand */}
          <div className="col-span-2 sm:col-span-3 md:col-span-1">
            <Link href="/" className="flex items-center space-x-2 mb-3 group">
              <Image
                src="/bidly-logo.svg"
                alt={`${APP_NAME} logo`}
                width={32}
                height={32}
                className="h-8 w-auto group-hover:opacity-90 transition-opacity"
              />
              <span className="font-bold text-xl text-slate-800
                               dark:text-bye-dark-text-primary
                               group-hover:text-indigo-600 dark:group-hover:text-indigo-400
                               transition-colors">
                {APP_NAME}
              </span>
            </Link>
            <p className="text-sm text-slate-500 dark:text-bye-dark-text-secondary">
              Your campus marketplace for buying and selling amazing finds.
            </p>
          </div>

          {/* Company */}
          <div className="md:justify-self-center">
            <h5 className="text-xs font-semibold text-slate-700
                           dark:text-bye-dark-text-primary
                           tracking-wider uppercase mb-3">
              Company
            </h5>
            <ul className="space-y-2.5">
              <li><FooterLink href="/about">About Us</FooterLink></li>
              <li><FooterLink href={placeholderHref}>Our Story</FooterLink></li>
              <li><FooterLink href={placeholderHref}>Blog</FooterLink></li>
            </ul>
          </div>

          {/* Support */}
          <div className="md:justify-self-center">
            <h5 className="text-xs font-semibold text-slate-700
                           dark:text-bye-dark-text-primary
                           tracking-wider uppercase mb-3">
              Support
            </h5>
            <ul className="space-y-2.5">
              <li><FooterLink href="/help">Help Center</FooterLink></li>
              <li><FooterLink href="/contact">Contact Us</FooterLink></li>
              <li><FooterLink href="/faq">FAQ</FooterLink></li>
            </ul>
          </div>

          {/* Legal */}
          <div className="md:justify-self-center">
            <h5 className="text-xs font-semibold text-slate-700
                           dark:text-bye-dark-text-primary
                           tracking-wider uppercase mb-3">
              Legal
            </h5>
            <ul className="space-y-2.5">
              <li><FooterLink href="/terms">Terms of Service</FooterLink></li>
              <li><FooterLink href="/privacy">Privacy Policy</FooterLink></li>
              <li><FooterLink href="/cookies">Cookie Policy</FooterLink></li>
            </ul>
          </div>

          {/* Connect / Social */}
          <div className="md:justify-self-end">
            <h5 className="text-xs font-semibold text-slate-700
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
        <div className="mt-6 pt-4 border-t border-slate-200
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

