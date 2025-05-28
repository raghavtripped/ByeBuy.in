// src/app/terms/page.tsx
'use client';

import React from 'react';

export default function TermsOfServicePage() {
  const companyName = "ByeBuy";
  // const websiteUrl = "https://byebuy.in"; // Remove if unused
  const contactEmail = "raghav@byebuy.in";
  const lastRevisionDate = "May 24, 2024"; // Update this date upon any revisions

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 py-10">
      <header className="mb-8 sm:mb-10 pb-4 border-b border-gray-200 dark:border-bye-dark-border-primary text-center">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-bye-dark-text-primary tracking-tight">
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-bye-dark-text-secondary">
          Last Revised: {lastRevisionDate}
        </p>
      </header>

      <main className="prose dark:prose-invert max-w-none text-gray-700 dark:text-bye-dark-text-primary leading-relaxed">
        <p>
          Welcome to {companyName}! These Terms of Service (&quot;Terms&quot;) govern your access to and use of the {companyName} website and mobile applications (collectively, the &quot;Service&quot;). By accessing or using the Service, you agree to be bound by these Terms. If you do not agree to these Terms, please do not use the Service.
        </p>

        <h2 className="text-2xl font-semibold mt-8 mb-4 text-gray-800 dark:text-bye-dark-text-primary">1. Acceptance of Terms</h2>
        <p>
          This Service is provided by {companyName} (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). These Terms constitute a legally binding agreement between you and {companyName}. You must be at least 18 years old or the age of legal majority in your jurisdiction to use the Service. By using the Service, you represent and warrant that you meet this age requirement.
        </p>

        <h2 className="text-2xl font-semibold mt-8 mb-4 text-gray-800 dark:text-bye-dark-text-primary">2. Changes to Terms</h2>
        <p>
          We reserve the right to modify these Terms at any time. We will notify you of any changes by posting the new Terms on the Service and updating the &quot;Last Revised&quot; date. Your continued use of the Service after such modifications constitutes your acceptance of the revised Terms.
        </p>

        <h2 className="text-2xl font-semibold mt-8 mb-4 text-gray-800 dark:text-bye-dark-text-primary">3. User Accounts</h2>
        <ul>
          <li>You may need to register for an account to access certain features of the Service.</li>
          <li>You agree to provide accurate, current, and complete information during the registration process and to update such information to keep it accurate, current, and complete.</li>
          <li>You are responsible for safeguarding your password and for all activities that occur under your account. You agree to notify us immediately of any unauthorized use of your account.</li>
          <li>We reserve the right to suspend or terminate your account if any information provided during the registration process or thereafter proves to be inaccurate, false, or incomplete, or if you violate these Terms.</li>
        </ul>

        <h2 className="text-2xl font-semibold mt-8 mb-4 text-gray-800 dark:text-bye-dark-text-primary">4. The Service as a Marketplace</h2>
        <ul>
          <li>{companyName} provides an online platform that connects buyers and sellers within the campus community for the purpose of conducting auctions.</li>
          <li>We are a <strong>facilitator</strong> only. We are not a party to any transaction between buyers and sellers. We do not own, sell, or deliver items listed on the Service.</li>
          <li>We are not responsible for the quality, safety, legality, or accuracy of items listed, nor for the truth or accuracy of listings, the ability of sellers to sell items, or the ability of buyers to pay for items.</li>
          <li>All transactions and agreements for sale are solely between the buyer and seller.</li>
        </ul>

        <h2 className="text-2xl font-semibold mt-8 mb-4 text-gray-800 dark:text-bye-dark-text-primary">5. Listing and Bidding Rules</h2>
        <h3>5.1. For Sellers:</h3>
        <ul>
          <li>You must have the legal right to sell any item you list.</li>
          <li>Listings must be accurate, complete, and truthful, including item description, condition, photos, minimum bid, and end time.</li>
          <li>You are responsible for setting clear auction rules (e.g., pickup location, payment methods) in your listing description.</li>
          <li>Once bids are placed on an active listing, you may not change the minimum bid price or &quot;Buy Now&quot; price.</li>
          <li>Listings can only be deleted if no bids have been placed.</li>
          <li>You agree to sell the item to the winning bidder at the winning bid price.</li>
          <li>You are responsible for coordinating payment and item handover with the winning bidder.</li>
        </ul>
        <h3>5.2. For Buyers:</h3>
        <ul>
          <li>All bids placed on the Service are <strong>binding commitments</strong>.</li>
          <li>If you place the winning bid, you are legally obligated to purchase the item at your winning bid price.</li>
          <li>You are responsible for coordinating payment and item pickup/delivery with the seller.</li>
          <li>Failure to complete a transaction after winning an auction may result in account suspension or termination.</li>
        </ul>
        <h3>5.3. Auction Mechanics:</h3>
        <ul>
          <li>Auctions automatically end at the specified end time.</li>
          <li>A &quot;Buy Now&quot; price, if offered, allows a buyer to instantly win the auction by bidding at or above that price.</li>
          <li>The highest bidder at the auction&apos;s end time wins, provided their bid meets the minimum price.</li>
        </ul>

        <h2 className="2xl font-semibold mt-8 mb-4 text-gray-800 dark:text-bye-dark-text-primary">6. Prohibited Conduct</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the Service for any illegal or unauthorized purpose.</li>
          <li>List or sell items that are illegal, dangerous, stolen, or violate any third-party rights (e.g., intellectual property).</li>
          <li>Engage in shill bidding (bidding on your own items or having others bid on your behalf).</li>
          <li>Interfere with the proper working of the Service, including by introducing viruses or other malicious code.</li>
          <li>Harass, abuse, or harm another person or group.</li>
          <li>Collect or store personal data about other users without their express consent.</li>
          <li>Impersonate any person or entity.</li>
          <li>Circumvent any fees or processes established by the Service.</li>
        </ul>

        <h2 className="2xl font-semibold mt-8 mb-4 text-gray-800 dark:text-bye-dark-text-primary">7. Fees</h2>
        <p>
          Currently, {companyName} does not charge fees for listing items or placing bids. We reserve the right to introduce fees in the future, which will be communicated clearly in advance.
        </p>

        <h2 className="2xl font-semibold mt-8 mb-4 text-gray-800 dark:text-bye-dark-text-primary">8. Content Ownership and License</h2>
        <ul>
          <li>You retain all ownership rights to the content you submit to the Service (e.g., listing descriptions, photos).</li>
          <li>By submitting content, you grant {companyName} a worldwide, non-exclusive, royalty-free, transferable license to use, reproduce, distribute, prepare derivative works of, display, and perform your content in connection with the Service and {companyName}&apos;s (and its successors&apos; and affiliates&apos;) business, including without limitation for promoting and redistributing part or all of the Service (and derivative works thereof) in any media formats and through any media channels.</li>
        </ul>

        <h2 className="2xl font-semibold mt-8 mb-4 text-gray-800 dark:text-bye-dark-text-primary">9. Disclaimers</h2>
        <p>
          THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING, BUT NOT LIMITED TO, IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. {companyName} DOES NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE.
        </p>
        <p>
          {companyName} does not endorse any users or items listed on the Service. We are not responsible for the conduct of any users or for any items or services exchanged through the Service.
        </p>

        <h2 className="2xl font-semibold mt-8 mb-4 text-gray-800 dark:text-bye-dark-text-primary">10. Limitation of Liability</h2>
        <p>
          TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL {companyName} BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, RESULTING FROM (A) YOUR ACCESS TO OR USE OF OR INABILITY TO ACCESS OR USE THE SERVICE; (B) ANY CONDUCT OR CONTENT OF ANY THIRD PARTY ON THE SERVICE; (C) ANY CONTENT OBTAINED FROM THE SERVICE; OR (D) UNAUTHORIZED ACCESS, USE, OR ALTERATION OF YOUR TRANSMISSIONS OR CONTENT.
        </p>

        <h2 className="2xl font-semibold mt-8 mb-4 text-gray-800 dark:text-bye-dark-text-primary">11. Indemnification</h2>
        <p>
          You agree to indemnify, defend, and hold harmless {companyName}, its affiliates, officers, directors, employees, and agents from and against any and all claims, liabilities, damages, losses, and expenses, including reasonable attorneys&apos; fees and costs, arising out of or in any way connected with (a) your access to or use of the Service; (b) your violation of these Terms; (c) your violation of any third-party right, including without limitation any intellectual property right, publicity, confidentiality, property, or privacy right; or (d) any dispute or issue between you and any third party.
        </p>

        <h2 className="2xl font-semibold mt-8 mb-4 text-gray-800 dark:text-bye-dark-text-primary">12. Governing Law and Dispute Resolution</h2>
        <p>
          These Terms shall be governed by the laws of India, without regard to its conflict of law principles.
        </p>
        <p>
          Any dispute arising from or relating to the subject matter of these Terms shall be resolved by negotiation between the parties. If negotiation fails, the dispute shall be submitted to binding arbitration in accordance with the provisions of the Arbitration and Conciliation Act, 1996, as amended. The arbitration shall be conducted in [City, State, e.g., Indore, Madhya Pradesh]. The decision of the arbitrator(s) shall be final and binding on both parties.
        </p>
        <p>
          For disputes not subject to arbitration, you agree to submit to the exclusive jurisdiction of the courts located in [City, State, e.g., Indore, Madhya Pradesh].
        </p>

        <h2 className="2xl font-semibold mt-8 mb-4 text-gray-800 dark:text-bye-dark-text-primary">13. General Provisions</h2>
        <ul>
          <li><strong>Entire Agreement:</strong> These Terms constitute the entire agreement between you and {companyName} regarding the Service.</li>
          <li><strong>Severability:</strong> If any provision of these Terms is found to be invalid or unenforceable, that provision will be limited or eliminated to the minimum extent necessary, and the remaining provisions of these Terms will remain in full force and effect.</li>
          <li><strong>No Waiver:</strong> No waiver of any term of these Terms shall be deemed a further or continuing waiver of such term or any other term.</li>
          <li><strong>Assignment:</strong> These Terms are personal to you and may not be assigned or transferred by you without our prior written consent. We may assign or transfer these Terms without your consent.</li>
        </ul>

        <h2 className="2xl font-semibold mt-8 mb-4 text-gray-800 dark:text-bye-dark-text-primary">14. Contact Information</h2>
        <p>
          If you have any questions about these Terms, please contact us at{' '}
          <a href={`mailto:${contactEmail}`} className="text-indigo-600 dark:text-indigo-400 hover:underline">
            {contactEmail}
          </a>.
        </p>
      </main>

      <footer className="mt-10 pt-6 border-t border-gray-200 dark:border-bye-dark-border-primary text-center text-gray-600 dark:text-bye-dark-text-secondary">
        <p className="text-sm">
          © {new Date().getFullYear()} {companyName}. All rights reserved.
        </p>
      </footer>
    </div>
  );
}