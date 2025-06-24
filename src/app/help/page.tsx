// src/app/help/page.tsx
'use client';

import Link from 'next/link';
import React, { useState, useEffect, useRef } from 'react';

// Import Heroicons
import {
  LightBulbIcon,
  ExclamationCircleIcon,
  ChatBubbleLeftRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  MagnifyingGlassIcon,
  ShoppingCartIcon,
  TagIcon,
  UserGroupIcon,
  QuestionMarkCircleIcon, // Used in Hero Section
  SparklesIcon, // Used in Additional Resources
  HeartIcon, // Used in Footer
} from '@heroicons/react/24/outline';

// Helper component for highlighting text
interface HighlightTextProps {
  text: string;
  highlight: string;
}

const HighlightText: React.FC<HighlightTextProps> = ({ text, highlight }) => {
  if (!highlight.trim()) {
    return <>{text}</>;
  }
  const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === highlight.toLowerCase() ? (
          <span key={i} className="bg-yellow-200 dark:bg-yellow-600/50 rounded px-0.5">
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  );
};

// FAQ Item Component with Accordion
interface FAQItemProps {
  question: string;
  answer: (searchTerm: string) => React.ReactNode; // Answer is now a function
  isOpen: boolean;
  onToggle: () => void;
  searchTerm: string; // Pass searchTerm to FAQItem
}

const FAQItem: React.FC<FAQItemProps> = ({ question, answer, isOpen, onToggle, searchTerm }) => (
  // Updated borders, backgrounds, and shadows for dark mode
  <div className="border border-gray-200 dark:border-bye-dark-border-primary rounded-xl overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-300 bg-white dark:bg-bye-dark-bg-secondary">
    <button
      onClick={onToggle}
      // Removed focus:ring-2 and related classes for seamless look
      className="w-full px-6 py-5 text-left flex justify-between items-center hover:bg-gray-50 dark:hover:bg-bye-dark-bg-hover transition-colors duration-200 focus:outline-none"
    >
      <span className="text-lg font-semibold text-gray-900 dark:text-bye-dark-text-primary pr-4">
        <HighlightText text={question} highlight={searchTerm} />
      </span>
      {isOpen ? (
        <ChevronUpIcon className="w-5 h-5 text-indigo-500 dark:text-indigo-400 flex-shrink-0" />
      ) : (
        <ChevronDownIcon className="w-5 h-5 text-gray-400 dark:text-bye-dark-text-secondary flex-shrink-0" />
      )}
    </button>
    <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
      {/* Ensure answer content has the same background as the outer div for seamlessness */}
      <div className="px-6 pb-5 text-gray-700 dark:text-bye-dark-text-primary leading-relaxed bg-white dark:bg-bye-dark-bg-secondary">
        {answer(searchTerm)} {/* Call answer function with searchTerm */}
      </div>
    </div>
  </div>
);

// Contact Card Component
interface ContactCardProps {
  href: string;
  icon: React.ElementType;
  title: string;
  description: string;
  color: string; // This will be mapped to our theme colors
}

const ContactCard: React.FC<ContactCardProps> = ({ href, icon: Icon, title, description, color }) => (
  <Link
    href={href}
    className="group block p-6 bg-white dark:bg-bye-dark-bg-secondary border border-gray-200 dark:border-bye-dark-border-primary rounded-2xl hover:shadow-xl hover:-translate-y-1 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:ring-offset-2 dark:focus:ring-offset-bye-dark-bg-primary"
  >
    <div className={`w-12 h-12 ${color} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300
      ${color === 'bg-yellow-500' ? 'dark:bg-yellow-500' :
        color === 'bg-red-500' ? 'dark:bg-red-500' :
        color === 'bg-blue-500' ? 'dark:bg-indigo-500' : ''}
    `}>
      <Icon className="w-6 h-6 text-white" />
    </div>
    <h3 className="text-xl font-bold text-gray-900 dark:text-bye-dark-text-primary mb-2 group-hover:text-indigo-500 transition-colors">
      {title}
    </h3>
    <p className="text-gray-600 dark:text-bye-dark-text-secondary text-sm leading-relaxed">
      {description}
    </p>
  </Link>
);

// Feature Card Component (now a Link)
interface FeatureCardProps {
  href: string; // Added href prop
  icon: React.ElementType;
  title: string;
  description: string;
  color: string; // This will be mapped to our theme colors
}

const FeatureCard: React.FC<FeatureCardProps> = ({ href, icon: Icon, title, description, color }) => (
  <Link // Changed from div to Link
    href={href}
    className="group block p-6 bg-white dark:bg-bye-dark-bg-secondary border border-gray-200 dark:border-bye-dark-border-primary rounded-2xl hover:shadow-lg hover:-translate-y-1 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:ring-offset-2 dark:focus:ring-offset-bye-dark-bg-primary"
  >
    <div className={`w-10 h-10 ${color} rounded-lg flex items-center justify-center mb-4 group-hover:scale-105 transition-transform duration-300
      ${color === 'bg-blue-500' ? 'dark:bg-indigo-500' :
        color === 'bg-green-500' ? 'dark:bg-green-500' :
        color === 'bg-purple-500' ? 'dark:bg-purple-500' : ''}
    `}>
      <Icon className="w-5 h-5 text-white" />
    </div>
    <h3 className="text-lg font-semibold text-gray-900 dark:text-bye-dark-text-primary mb-2">{title}</h3>
    <p className="text-gray-600 dark:text-bye-dark-text-secondary text-sm leading-relaxed">{description}</p>
  </Link>
);

export default function HelpCenterPage() {
  const contactEmail = 'raghav@byebuy.in';
  const [searchTerm, setSearchTerm] = useState('');
  const [openFAQ, setOpenFAQ] = useState<number | null>(null);
  const faqRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Stable helper to extract string from ReactNode for searching
  const getReactNodeString = React.useCallback((node: React.ReactNode): string => {
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(getReactNodeString).join(' ');
    if (React.isValidElement(node)) {
      const element = node as React.ReactElement<{ children?: React.ReactNode }, string | React.JSXElementConstructor<unknown>>;
      if (element.props && element.props.children) {
        return getReactNodeString(element.props.children);
      }
    }
    return '';
  }, []);

  const allFAQs = React.useMemo(() => {
    const buyerFAQs = [
      {
        question: "How do I find items on ByeBuy?",
        answer: (searchTerm: string) => (
          <p>
            <HighlightText text="Browse all active auctions on the " highlight={searchTerm} />
            <Link href="/listings" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium hover:underline">
              <HighlightText text="Home page" highlight={searchTerm} />
            </Link>
            . <HighlightText text="Use our smart category filters to find exactly what you're looking for. You can also save items to your watchlist for later!" highlight={searchTerm} />
          </p>
        ),
      },
      {
        question: "How does the bidding process work?",
        answer: (searchTerm: string) => (
          <div className="space-y-3">
            <p><HighlightText text="Bidding on ByeBuy is simple and exciting:" highlight={searchTerm} /></p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li><HighlightText text="Navigate to any listing's detail page" highlight={searchTerm} /></li>
              <li><HighlightText text="Enter your bid amount (must be higher than current bid)" highlight={searchTerm} /></li>
              <li><HighlightText text="Confirm your bid - it's live immediately!" highlight={searchTerm} /></li>
              <li><HighlightText text="Monitor the auction in real-time" highlight={searchTerm} /></li>
            </ul>
            <p className="font-semibold text-indigo-600 dark:text-indigo-400">
              <HighlightText text="Remember: All bids are binding commitments!" highlight={searchTerm} />
            </p>
          </div>
        ),
      },
      {
        question: "What is the 'Buy Now' feature?",
        answer: (searchTerm: string) => (
          <p>
            <HighlightText text="Some sellers offer a 'Buy Now' price for instant purchases. When you bid at or above this amount, you automatically win the auction and it closes immediately - no waiting required!" highlight={searchTerm} />
          </p>
        ),
      },
      {
        question: "How can I track my bids?",
        answer: (searchTerm: string) => (
          <p>
            <HighlightText text="Visit your " highlight={searchTerm} />
            <Link href="/my-bids" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium hover:underline">
              <HighlightText text="My Bids page" highlight={searchTerm} />
            </Link>
            {' '}<HighlightText text="to see all your auction activity. You'll see whether you're winning, losing, or if auctions have ended." highlight={searchTerm} />
          </p>
        ),
      },
      {
        question: "What happens after I win an auction?",
        answer: (searchTerm: string) => (
          <p>
            <HighlightText text="Congratulations! 🎉 Once you win, you'll be notified immediately. Use the chat feature on the listing page to coordinate payment and pickup/delivery directly with the seller." highlight={searchTerm} />
          </p>
        ),
      },
    ];

    const sellerFAQs = [
      {
        question: "How do I create a listing?",
        answer: (searchTerm: string) => (
          <div className="space-y-3">
            <p><HighlightText text="Creating a listing is quick and easy:" highlight={searchTerm} /></p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li><HighlightText text={'Click the "Create Listing" button in the navigation'} highlight={searchTerm} /></li>
              <li><HighlightText text="Upload high-quality photos of your item" highlight={searchTerm} /></li>
              <li><HighlightText text="Fill in item details and description" highlight={searchTerm} /></li>
              <li><HighlightText text="Set your minimum bid and optional Buy Now price" highlight={searchTerm} /></li>
              <li><HighlightText text="Choose your auction end time" highlight={searchTerm} /></li>
              <li><HighlightText text="Publish and start receiving bids!" highlight={searchTerm} /></li>
            </ul>
          </div>
        ),
      },
      {
        question: "Can I edit my listing after it goes live?",
        answer: (searchTerm: string) => (
          <p>
            <HighlightText text="Yes! You can edit most details from your " highlight={searchTerm} />
            <Link href="/my-listings" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium hover:underline">
              <HighlightText text="My Listings page" highlight={searchTerm} />
            </Link>
            . <HighlightText text="However, once bids are placed, you cannot change the minimum bid or Buy Now price to maintain fairness." highlight={searchTerm} />
          </p>
        ),
      },
      {
        question: "How do auctions end?",
        answer: (searchTerm: string) => (
          <p>
            <HighlightText text="Auctions automatically end at your specified time. The system determines the winner instantly. You can also manually finalize auctions that have passed their end time from your listings dashboard." highlight={searchTerm} />
          </p>
        ),
      },
      {
        question: "Can I cancel a listing?",
        answer: (searchTerm: string) => (
          <p>
            <HighlightText text="You can delete a listing from your " highlight={searchTerm} />
            <Link href="/my-listings" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium hover:underline">
              <HighlightText text="My Listings page" highlight={searchTerm} />
            </Link>
            , <HighlightText text="but only if no bids have been placed yet. This ensures fairness for all bidders." highlight={searchTerm} />
          </p>
        ),
      },
    ];

    const generalFAQs = [
      {
        question: "How do I manage my account settings?",
        answer: (searchTerm: string) => (
          <p>
            <HighlightText text="Update your profile, change your password, and manage preferences in " highlight={searchTerm} />
            <Link href="/account/settings" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium hover:underline">
              <HighlightText text="Account Settings" highlight={searchTerm} />
            </Link>
            . <HighlightText text='On mobile, access this through the "Profile" tab in the bottom navigation.' highlight={searchTerm} />
          </p>
        ),
      },
      {
        question: "Is my data secure on ByeBuy?",
        answer: (searchTerm: string) => (
          <p>
            <HighlightText text="Absolutely! We use enterprise-grade security with Supabase, including Row Level Security (RLS) to protect your personal information. Your privacy and security are our top priorities." highlight={searchTerm} />
          </p>
        ),
      },
      {
        question: "Who can use ByeBuy?",
        answer: (searchTerm: string) => (
          <p>
            <HighlightText text="ByeBuy is designed specifically for campus communities. We strictly verify student status, our platform is built to serve the unique needs of campus buyers and sellers." highlight={searchTerm} />
          </p>
        ),
      },
    ];

    return [
      ...buyerFAQs.map(faq => ({ ...faq, category: 'buyer', answerString: getReactNodeString(faq.answer('')) })),
      ...sellerFAQs.map(faq => ({ ...faq, category: 'seller', answerString: getReactNodeString(faq.answer('')) })),
      ...generalFAQs.map(faq => ({ ...faq, category: 'general', answerString: getReactNodeString(faq.answer('')) })),
    ];
  }, [getReactNodeString]); // <-- include getReactNodeString

  const filteredFAQs = allFAQs.filter(faq =>
    faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
    faq.answerString.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Scroll to first matching FAQ item
  useEffect(() => {
    if (searchTerm.trim() && filteredFAQs.length > 0) {
      const firstMatchingIndex = allFAQs.findIndex(faq =>
        faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
        faq.answerString.toLowerCase().includes(searchTerm.toLowerCase())
      );
      if (firstMatchingIndex !== -1 && faqRefs.current[firstMatchingIndex]) {
        faqRefs.current[firstMatchingIndex]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setOpenFAQ(firstMatchingIndex); // Open the first matching FAQ
      }
    } else if (!searchTerm.trim()) {
      setOpenFAQ(null); // Close all if search term is cleared
    }
  }, [searchTerm, filteredFAQs.length, allFAQs]); // Depend on filteredFAQs.length to re-trigger when results change

  return (
    // Updated page background for dark mode
    <div className="min-h-screen bg-gray-50 dark:bg-bye-dark-bg-primary">
      {/* Hero Section */}
      {/* Added rounded-2xl to the hero section */}
      <section className="relative bg-gradient-to-r from-indigo-600 to-purple-700 overflow-hidden rounded-2xl lg:w-1/2 lg:mx-auto lg:my-8">
        <div className="absolute inset-0 bg-black/20 dark:bg-black/40"></div>
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 p-8 sm:p-12 text-center text-white">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white/20 backdrop-blur-sm rounded-2xl mb-8">
            <QuestionMarkCircleIcon className="w-8 h-8" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-4 tracking-tight">
            ByeBuy Help Center
          </h1>
          <p className="text-lg sm:text-xl text-white/90 mb-6 max-w-2xl mx-auto leading-relaxed">
            Your complete guide to buying and selling amazing finds on campus
          </p>
          
          {/* Search Bar */}
          <div className="max-w-2xl mx-auto relative">
            <div className="absolute left-4 top-1/2 transform -translate-y-1/2 z-10">
              <MagnifyingGlassIcon className="w-5 h-5 text-white" />
            </div>
            <input
              type="text"
              placeholder="Search help articles..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-white/10 backdrop-blur-sm border-0 rounded-2xl text-white placeholder-white/70 text-lg focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-transparent shadow-xl
                         dark:bg-white/10 dark:text-bye-dark-text-primary dark:placeholder-bye-dark-text-secondary"
            />
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Quick Start Features */}
        <section className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-bye-dark-text-primary mb-4">
              Get Started in Minutes
            </h2>
            <p className="text-xl text-gray-600 dark:text-bye-dark-text-secondary max-w-3xl mx-auto">
              Everything you need to know to start your ByeBuy journey
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              href="/auth" // Hyperlinked
              icon={UserGroupIcon}
              title="Join the Community"
              description="Sign up with your email or Google account to join your campus marketplace"
              color="bg-indigo-600"
            />
            <FeatureCard
              href="/listings" // Hyperlinked
              icon={ShoppingCartIcon}
              title="Start Bidding"
              description="Browse active auctions and place bids on items you love"
              color="bg-green-600"
            />
            <FeatureCard
              href="/listings/new" // Hyperlinked
              icon={TagIcon}
              title="Sell Your Items"
              description="Create listings with photos and watch the bids roll in"
              color="bg-purple-600"
            />
          </div>
        </section>

        {/* Contact Section */}
        <section className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-bye-dark-text-primary mb-4">
              Get In Touch
            </h2>
            <p className="text-xl text-gray-600 dark:text-bye-dark-text-secondary max-w-3xl mx-auto">
              We&apos;d love to hear from you! Choose the option that best describes your message
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <ContactCard
              href={`mailto:${contactEmail}?subject=${encodeURIComponent('[ByeBuy Feature Request]')}`}
              icon={LightBulbIcon}
              title="Feature Request"
              description="Got an amazing idea? Share your suggestions to make ByeBuy even better!"
              color="bg-yellow-600"
            />
            <ContactCard
              href={`mailto:${contactEmail}?subject=${encodeURIComponent('[ByeBuy Complaint]')}`}
              icon={ExclamationCircleIcon}
              title="Report an Issue"
              description="Experiencing problems? Let us know so we can fix it quickly."
              color="bg-red-600"
            />
            <ContactCard
              href={`mailto:${contactEmail}?subject=${encodeURIComponent('[ByeBuy General Feedback]')}`}
              icon={ChatBubbleLeftRightIcon}
              title="General Feedback"
              description="Share your thoughts, suggestions, or any other comments with us."
              color="bg-indigo-600"
            />
          </div>
        </section>

        {/* FAQ Section */}
        <section className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-bye-dark-text-primary mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-xl text-gray-600 dark:text-bye-dark-text-secondary max-w-3xl mx-auto">
              Find quick answers to common questions
            </p>
          </div>

          <div className="space-y-4">
            {filteredFAQs.map((faq, index) => (
              <div ref={el => { faqRefs.current[index] = el; }} key={index}> {/* Attach ref to outer div */}
                <FAQItem
                  question={faq.question}
                  answer={faq.answer}
                  isOpen={openFAQ === index}
                  onToggle={() => setOpenFAQ(openFAQ === index ? null : index)}
                  searchTerm={searchTerm} // Pass searchTerm to FAQItem
                />
              </div>
            ))}
          </div>

          {filteredFAQs.length === 0 && searchTerm && (
            <div className="text-center py-12">
              <MagnifyingGlassIcon className="w-16 h-16 text-gray-300 dark:text-bye-dark-text-secondary opacity-50 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 dark:text-bye-dark-text-primary mb-2">
                No results found
              </h3>
              <p className="text-gray-600 dark:text-bye-dark-text-secondary">
                Try adjusting your search terms or browse all questions above
              </p>
            </div>
          )}
        </section>

        {/* Additional Resources */}
        <section className="mb-20">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-700 rounded-3xl p-12 sm:p-16 text-center text-white">
            <SparklesIcon className="w-16 h-16 mx-auto mb-6 opacity-90" />
            <h2 className="text-3xl font-bold mb-4">Still need help?</h2>
            <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto">
              Can&#39;t find what you&#39;re looking for? Our community is here to help you succeed on ByeBuy.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/terms"
                className="inline-flex items-center justify-center px-6 py-3 bg-white text-indigo-600 font-semibold rounded-xl hover:bg-gray-100 transition-colors duration-200
                           dark:bg-bye-dark-bg-primary dark:text-indigo-400 dark:hover:bg-bye-dark-bg-hover"
              >
                View Terms of Service
              </Link>
              <a
                href={`mailto:${contactEmail}`}
                className="inline-flex items-center justify-center px-6 py-3 bg-white/20 backdrop-blur-sm text-white font-semibold rounded-xl hover:bg-white/30 transition-colors duration-200 border border-white/30
                           dark:bg-white/10 dark:text-bye-dark-text-primary dark:hover:bg-white/20 dark:border-white/20"
              >
                Contact Support
              </a>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center py-8 border-t border-gray-200 dark:border-bye-dark-border-primary">
          <div className="flex justify-center items-center space-x-2 mb-4">
            <HeartIcon className="w-5 h-5 text-red-500 dark:text-red-400" />
            <span className="text-gray-600 dark:text-bye-dark-text-secondary">Made with love for the campus community</span>
          </div>
          <p className="text-sm text-gray-500 dark:text-bye-dark-text-secondary">
            ByeBuy Help Center • Your friendly campus marketplace
          </p>
        </footer>
      </div>
    </div>
  );
}