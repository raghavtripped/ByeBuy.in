// src/app/help/page.tsx
'use client';

import Link from 'next/link';
import React, { useState } from 'react';

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

// FAQ Item Component with Accordion
interface FAQItemProps {
  question: string;
  answer: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}

const FAQItem: React.FC<FAQItemProps> = ({ question, answer, isOpen, onToggle }) => (
  // Updated borders, backgrounds, and shadows for dark mode
  <div className="border border-gray-200 dark:border-bye-dark-border-primary rounded-xl overflow-hidden hover:shadow-lg transition-all duration-300 bg-white dark:bg-bye-dark-bg-secondary">
    <button
      onClick={onToggle}
      // Updated hover background and focus ring for dark mode
      className="w-full px-6 py-5 text-left flex justify-between items-center hover:bg-gray-50 dark:hover:bg-bye-dark-bg-hover transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:ring-inset"
    >
      {/* Updated text color for dark mode */}
      <span className="text-lg font-semibold text-gray-900 dark:text-bye-dark-text-primary pr-4">{question}</span>
      {isOpen ? (
        // Updated icon color for dark mode
        <ChevronUpIcon className="w-5 h-5 text-indigo-500 dark:text-indigo-400 flex-shrink-0" />
      ) : (
        // Updated icon color for dark mode
        <ChevronDownIcon className="w-5 h-5 text-gray-400 dark:text-bye-dark-text-secondary flex-shrink-0" />
      )}
    </button>
    <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
      {/* Updated text color for dark mode */}
      <div className="px-6 pb-5 text-gray-700 dark:text-bye-dark-text-primary leading-relaxed">
        {answer}
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
    // Updated backgrounds, borders, and focus rings for dark mode
    className="group block p-6 bg-white dark:bg-bye-dark-bg-secondary border border-gray-200 dark:border-bye-dark-border-primary rounded-2xl hover:shadow-xl hover:-translate-y-1 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:ring-offset-2 dark:focus:ring-offset-bye-dark-bg-primary"
  >
    {/* Updated icon background color mapping for dark mode */}
    <div className={`w-12 h-12 ${color} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300
      ${color === 'bg-yellow-500' ? 'dark:bg-yellow-500' :
        color === 'bg-red-500' ? 'dark:bg-red-500' :
        color === 'bg-blue-500' ? 'dark:bg-indigo-500' : ''}
    `}>
      <Icon className="w-6 h-6 text-white" />
    </div>
    {/* Updated text colors and hover for dark mode */}
    <h3 className="text-xl font-bold text-gray-900 dark:text-bye-dark-text-primary mb-2 group-hover:text-indigo-500 transition-colors">
      {title}
    </h3>
    <p className="text-gray-600 dark:text-bye-dark-text-secondary text-sm leading-relaxed">
      {description}
    </p>
  </Link>
);

// Feature Card Component
interface FeatureCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
  color: string; // This will be mapped to our theme colors
}

const FeatureCard: React.FC<FeatureCardProps> = ({ icon: Icon, title, description, color }) => (
  // Updated backgrounds and borders for dark mode
  <div className="group p-6 bg-white dark:bg-bye-dark-bg-secondary border border-gray-200 dark:border-bye-dark-border-primary rounded-2xl hover:shadow-lg transition-all duration-300">
    {/* Updated icon background color mapping for dark mode */}
    <div className={`w-10 h-10 ${color} rounded-lg flex items-center justify-center mb-4 group-hover:scale-105 transition-transform duration-300
      ${color === 'bg-blue-500' ? 'dark:bg-indigo-500' :
        color === 'bg-green-500' ? 'dark:bg-green-500' :
        color === 'bg-purple-500' ? 'dark:bg-purple-500' : ''}
    `}>
      <Icon className="w-5 h-5 text-white" />
    </div>
    {/* Updated text colors for dark mode */}
    <h3 className="text-lg font-semibold text-gray-900 dark:text-bye-dark-text-primary mb-2">{title}</h3>
    <p className="text-gray-600 dark:text-bye-dark-text-secondary text-sm leading-relaxed">{description}</p>
  </div>
);

// (Removed unused HelpQuestionCard component)


export default function HelpCenterPage() {
  const contactEmail = 'raghav@byebuy.in';
  const [searchTerm, setSearchTerm] = useState('');
  const [openFAQ, setOpenFAQ] = useState<number | null>(null);

  // FAQ Data
  const buyerFAQs = [
    {
      question: "How do I find items on ByeBuy?",
      answer: (
        <p>
          Browse all active auctions on the{' '}
          <Link href="/listings" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium hover:underline">
            Home page
          </Link>
          . Use our smart category filters to find exactly what you&#39;re looking for. You can also save items to your watchlist for later!
        </p>
      ),
    },
    {
      question: "How does the bidding process work?",
      answer: (
        <div className="space-y-3">
          <p>Bidding on ByeBuy is simple and exciting:</p>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>Navigate to any listing&#39;s detail page</li>
            <li>Enter your bid amount (must be higher than current bid)</li>
            <li>Confirm your bid - it&#39;s live immediately!</li>
            <li>Monitor the auction in real-time</li>
          </ul>
          <p className="font-semibold text-indigo-600 dark:text-indigo-400">
            Remember: All bids are binding commitments!
          </p>
        </div>
      ),
    },
    {
      question: "What is the 'Buy Now' feature?",
      answer: (
        <p>
          Some sellers offer a &#39;Buy Now&#39; price for instant purchases. When you bid at or above this amount, 
          you automatically win the auction and it closes immediately - no waiting required!
        </p>
      ),
    },
    {
      question: "How can I track my bids?",
      answer: (
        <p>
          Visit your{' '}
          <Link href="/my-bids" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium hover:underline">
            My Bids page
          </Link>
          {' '}to see all your auction activity. You&#39;ll see whether you&#39;re winning, losing, or if auctions have ended.
        </p>
      ),
    },
    {
      question: "What happens after I win an auction?",
      answer: (
        <p>
          Congratulations! 🎉 Once you win, you&#39;ll be notified immediately. Use the chat feature on the listing 
          page to coordinate payment and pickup/delivery directly with the seller.
        </p>
      ),
    },
  ];

  const sellerFAQs = [
    {
      question: "How do I create a listing?",
      answer: (
        <div className="space-y-3">
          <p>Creating a listing is quick and easy:</p>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>Click the &quot;Create Listing&quot; button in the navigation</li>
            <li>Upload high-quality photos of your item</li>
            <li>Fill in item details and description</li>
            <li>Set your minimum bid and optional Buy Now price</li>
            <li>Choose your auction end time</li>
            <li>Publish and start receiving bids!</li>
          </ul>
        </div>
      ),
    },
    {
      question: "Can I edit my listing after it goes live?",
      answer: (
        <p>
          Yes! You can edit most details from your{' '}
          <Link href="/my-listings" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium hover:underline">
            My Listings page
          </Link>
          . However, once bids are placed, you cannot change the minimum bid or Buy Now price to maintain fairness.
        </p>
      ),
    },
    {
      question: "How do auctions end?",
      answer: (
        <p>
          Auctions automatically end at your specified time. The system determines the winner instantly. 
          You can also manually finalize auctions that have passed their end time from your listings dashboard.
        </p>
      ),
    },
    {
      question: "Can I cancel a listing?",
      answer: (
        <p>
          You can delete a listing from your{' '}
          <Link href="/my-listings" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium hover:underline">
            My Listings page
          </Link>
          , but only if no bids have been placed yet. This ensures fairness for all bidders.
        </p>
      ),
    },
  ];

  const generalFAQs = [
    {
      question: "How do I manage my account settings?",
      answer: (
        <p>
          Update your profile, change your password, and manage preferences in{' '}
          <Link href="/account/settings" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium hover:underline">
            Account Settings
          </Link>
          . On mobile, access this through the &quot;Profile&quot; tab in the bottom navigation.
        </p>
      ),
    },
    {
      question: "Is my data secure on ByeBuy?",
      answer: (
        <p>
          Absolutely! We use enterprise-grade security with Supabase, including Row Level Security (RLS) 
          to protect your personal information. Your privacy and security are our top priorities.
        </p>
      ),
    },
    {
      question: "Who can use ByeBuy?",
      answer: (
        <p>
          ByeBuy is designed specifically for campus communities. We strictly verify student status, 
          our platform is built to serve the unique needs of campus buyers and sellers.
        </p>
      ),
    },
  ];

  const allFAQs = [
    ...buyerFAQs.map(faq => ({ ...faq, category: 'buyer' })),
    ...sellerFAQs.map(faq => ({ ...faq, category: 'seller' })),
    ...generalFAQs.map(faq => ({ ...faq, category: 'general' })),
  ];

  const filteredFAQs = allFAQs.filter(faq =>
    faq.question.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    // Updated page background for dark mode
    <div className="min-h-screen bg-gray-50 dark:bg-bye-dark-bg-primary">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-700 overflow-hidden"> {/* Updated gradient to Indigo/Purple */}
        <div className="absolute inset-0 bg-black/20 dark:bg-black/40"></div> {/* Darker overlay for dark mode */}
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center text-white">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white/20 backdrop-blur-sm rounded-2xl mb-8">
            <QuestionMarkCircleIcon className="w-10 h-10" /> {/* Icon color is white, which is fine */}
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold mb-6 tracking-tight">
            ByeBuy Help Center
          </h1>
          <p className="text-xl sm:text-2xl text-white/90 mb-8 max-w-2xl mx-auto leading-relaxed">
            Your complete guide to buying and selling amazing finds on campus
          </p>
          
          {/* Search Bar */}
          <div className="max-w-2xl mx-auto relative">
            {/* Updated icon color for dark mode */}
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-bye-dark-text-secondary" />
            <input
              type="text"
              placeholder="Search help articles..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              // Updated background, text, placeholder, and focus ring for dark mode
              className="w-full pl-12 pr-4 py-4 bg-white/95 backdrop-blur-sm border-0 rounded-2xl text-gray-900 placeholder-gray-500 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-transparent shadow-xl
                         dark:bg-bye-dark-bg-secondary/95 dark:text-bye-dark-text-primary dark:placeholder-bye-dark-text-secondary"
            />
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Quick Start Features */}
        <section className="mb-20">
          <div className="text-center mb-12">
            {/* Updated text colors for dark mode */}
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-bye-dark-text-primary mb-4">
              Get Started in Minutes
            </h2>
            <p className="text-xl text-gray-600 dark:text-bye-dark-text-secondary max-w-3xl mx-auto">
              Everything you need to know to start your ByeBuy journey
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon={UserGroupIcon}
              title="Join the Community"
              description="Sign up with your email or Google account to join your campus marketplace"
              color="bg-indigo-600" // Mapped from blue-500
            />
            <FeatureCard
              icon={ShoppingCartIcon}
              title="Start Bidding"
              description="Browse active auctions and place bids on items you love"
              color="bg-green-600" // Mapped from green-500
            />
            <FeatureCard
              icon={TagIcon}
              title="Sell Your Items"
              description="Create listings with photos and watch the bids roll in"
              color="bg-purple-600" // Mapped from purple-500
            />
          </div>
        </section>

        {/* Contact Section */}
        <section className="mb-20">
          <div className="text-center mb-12">
            {/* Updated text colors for dark mode */}
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-bye-dark-text-primary mb-4">
              Get In Touch
            </h2>
            <p className="text-xl text-gray-600 dark:text-bye-dark-text-secondary max-w-3xl mx-auto">
              We&#39;d love to hear from you! Choose the option that best describes your message
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <ContactCard
              href={`mailto:${contactEmail}?subject=${encodeURIComponent('[ByeBuy Feature Request]')}`}
              icon={LightBulbIcon}
              title="Feature Request"
              description="Got an amazing idea? Share your suggestions to make ByeBuy even better!"
              color="bg-yellow-600" // Mapped from yellow-500
            />
            <ContactCard
              href={`mailto:${contactEmail}?subject=${encodeURIComponent('[ByeBuy Complaint]')}`}
              icon={ExclamationCircleIcon}
              title="Report an Issue"
              description="Experiencing problems? Let us know so we can fix it quickly."
              color="bg-red-600" // Mapped from red-500
            />
            <ContactCard
              href={`mailto:${contactEmail}?subject=${encodeURIComponent('[ByeBuy General Feedback]')}`}
              icon={ChatBubbleLeftRightIcon}
              title="General Feedback"
              description="Share your thoughts, suggestions, or any other comments with us."
              color="bg-indigo-600" // Mapped from blue-500
            />
          </div>
        </section>

        {/* FAQ Section */}
        <section className="mb-20">
          <div className="text-center mb-12">
            {/* Updated text colors for dark mode */}
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-bye-dark-text-primary mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-xl text-gray-600 dark:text-bye-dark-text-secondary max-w-3xl mx-auto">
              Find quick answers to common questions
            </p>
          </div>

          <div className="space-y-4">
            {filteredFAQs.map((faq, index) => (
              <FAQItem
                key={index}
                question={faq.question}
                answer={faq.answer}
                isOpen={openFAQ === index}
                onToggle={() => setOpenFAQ(openFAQ === index ? null : index)}
              />
            ))}
          </div>

          {filteredFAQs.length === 0 && searchTerm && (
            <div className="text-center py-12">
              {/* Updated icon color for dark mode */}
              <MagnifyingGlassIcon className="w-16 h-16 text-gray-300 dark:text-bye-dark-text-secondary opacity-50 mx-auto mb-4" />
              {/* Updated text colors for dark mode */}
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
          {/* Updated gradient to match theme, and text colors for dark mode */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-700 rounded-3xl p-8 sm:p-12 text-center text-white">
            <SparklesIcon className="w-16 h-16 mx-auto mb-6 opacity-90" /> {/* Icon color is white, which is fine */}
            <h2 className="text-3xl font-bold mb-4">Still need help?</h2>
            <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto">
              Can&#39;t find what you&#39;re looking for? Our community is here to help you succeed on ByeBuy.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/terms"
                // Updated button colors for dark mode
                className="inline-flex items-center justify-center px-6 py-3 bg-white text-indigo-600 font-semibold rounded-xl hover:bg-gray-100 transition-colors duration-200
                           dark:bg-bye-dark-bg-primary dark:text-indigo-400 dark:hover:bg-bye-dark-bg-hover"
              >
                View Terms of Service
              </Link>
              <a
                href={`mailto:${contactEmail}`}
                // Updated button colors for dark mode
                className="inline-flex items-center justify-center px-6 py-3 bg-white/20 backdrop-blur-sm text-white font-semibold rounded-xl hover:bg-white/30 transition-colors duration-200 border border-white/30
                           dark:bg-white/10 dark:text-bye-dark-text-primary dark:hover:bg-white/20 dark:border-white/20"
              >
                Contact Support
              </a>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center py-8 border-t border-gray-200 dark:border-bye-dark-border-primary"> {/* Updated border for dark mode */}
          <div className="flex justify-center items-center space-x-2 mb-4">
            {/* Updated icon color for dark mode */}
            <HeartIcon className="w-5 h-5 text-red-500 dark:text-red-400" />
            {/* Updated text color for dark mode */}
            <span className="text-gray-600 dark:text-bye-dark-text-secondary">Made with love for the campus community</span>
          </div>
          {/* Updated text color for dark mode */}
          <p className="text-sm text-gray-500 dark:text-bye-dark-text-secondary">
            ByeBuy Help Center • Your friendly campus marketplace
          </p>
        </footer>
      </div>
    </div>
  );
}