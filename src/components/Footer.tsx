// src/components/Footer.tsx
import Link from 'next/link';
import Image from 'next/image'; // For your logo

// Reusable FooterLink component adapted for Next.js
const FooterLink: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => (
  <Link
    href={href}
    className="text-sm text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 transition-colors hover:underline"
  >
    {children}
  </Link>
);

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const APP_NAME = "ByeBuy"; // Or import from a constants file if you have one

  return (
    <footer className="bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700/80 pt-12 pb-8 mt-auto">
      {/* mt-auto will help push footer to bottom if content is short, assuming a flex layout in layout.tsx */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 mb-10">
          {/* Logo & Brand Column */}
          <div className="sm:col-span-2 md:col-span-1 mb-6 md:mb-0">
            <Link href="/" className="flex items-center space-x-2 mb-3 group">
              <Image
                src="/bidly-logo.svg" // Assuming this is your logo path from Navbar
                alt={`${APP_NAME} Logo`}
                width={32}
                height={32}
                className="h-8 w-auto group-hover:opacity-90 transition-opacity" // Match Navbar logo style
              />
              <span className="font-bold text-xl text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                {APP_NAME}
              </span>
            </Link>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Your campus marketplace for great finds.
            </p>
          </div>

          {/* Platform Links Column */}
          <div>
            <h5 className="text-sm font-semibold text-slate-700 dark:text-slate-200 tracking-wider uppercase mb-4">
              Platform
            </h5>
            <ul className="space-y-3">
              <li><FooterLink href="/">Active Auctions</FooterLink></li>
              <li><FooterLink href="/listings/archive">Auction Archive</FooterLink></li>
              <li><FooterLink href="/listings/new">List an Item</FooterLink></li>
              {/* Add more relevant links like "How it Works" if you have such pages */}
            </ul>
          </div>

          {/* Legal & Support Column */}
          <div>
            <h5 className="text-sm font-semibold text-slate-700 dark:text-slate-200 tracking-wider uppercase mb-4">
              Resources
            </h5>
            <ul className="space-y-3">
              <li><FooterLink href="/terms">Terms of Service</FooterLink></li>
              <li><FooterLink href="/privacy">Privacy Policy</FooterLink></li>
              {/* <li><FooterLink href="/contact">Contact Us</FooterLink></li> */}
              {/* <li><FooterLink href="/faq">FAQ</FooterLink></li> */}
            </ul>
          </div>

          {/*
          // Example for adding Social Links later:
          <div>
            <h5 className="text-sm font-semibold text-slate-700 dark:text-slate-200 tracking-wider uppercase mb-4">Connect</h5>
            <div className="flex space-x-4 mt-3">
              <a href="#" aria-label="Facebook" className="text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">...</svg>
              </a>
              // Add other social icons
            </div>
          </div>
          */}

        </div>

        <div className="mt-10 pt-8 border-t border-slate-200 dark:border-slate-700/80 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            © {currentYear} {APP_NAME}. All rights reserved.
            {/* Consider adding "This is a student project." or similar if applicable. */}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
            Built with passion by students, for students.
          </p>
        </div>
      </div>
    </footer>
  );
}