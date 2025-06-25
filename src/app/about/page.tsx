'use client';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-bye-dark-bg-primary">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-8">
          About ByeBuy
        </h1>

        <div className="space-y-8 text-gray-600 dark:text-bye-dark-text-secondary">
          <section>
            <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-bye-dark-text-primary mb-4">
              Our Mission
            </h2>
            <p className="text-lg leading-relaxed mb-4">
              ByeBuy is transforming how students buy and sell items on campus. We&apos;re creating a 
              trusted, efficient marketplace that brings the excitement of auctions to campus commerce.
            </p>
            <p className="text-lg leading-relaxed">
              Our platform helps students find great deals on items they need, while helping others 
              declutter and earn money from items they no longer use.
            </p>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-bye-dark-text-primary mb-4">
              How It Works
            </h2>
            <div className="grid sm:grid-cols-2 gap-6">
              <div className="bg-gray-50 dark:bg-bye-dark-bg-secondary p-6 rounded-xl border border-gray-200 dark:border-bye-dark-border-primary">
                <h3 className="font-semibold text-gray-900 dark:text-bye-dark-text-primary mb-2">For Buyers</h3>
                <ul className="list-disc list-inside space-y-2">
                  <li>Browse active auctions</li>
                  <li>Place competitive bids</li>
                  <li>Win items at great prices</li>
                  <li>Easy campus pickup</li>
                </ul>
              </div>
              <div className="bg-gray-50 dark:bg-bye-dark-bg-secondary p-6 rounded-xl border border-gray-200 dark:border-bye-dark-border-primary">
                <h3 className="font-semibold text-gray-900 dark:text-bye-dark-text-primary mb-2">For Sellers</h3>
                <ul className="list-disc list-inside space-y-2">
                  <li>List items in minutes</li>
                  <li>Set your minimum price</li>
                  <li>Watch bids roll in</li>
                  <li>Meet buyers on campus</li>
                </ul>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-bye-dark-text-primary mb-4">
              Our Values
            </h2>
            <div className="grid sm:grid-cols-3 gap-6">
              <div className="bg-gray-50 dark:bg-bye-dark-bg-secondary p-6 rounded-xl border border-gray-200 dark:border-bye-dark-border-primary">
                <h3 className="font-semibold text-gray-900 dark:text-bye-dark-text-primary mb-2">Trust</h3>
                <p>Building a safe and reliable marketplace for our campus community.</p>
              </div>
              <div className="bg-gray-50 dark:bg-bye-dark-bg-secondary p-6 rounded-xl border border-gray-200 dark:border-bye-dark-border-primary">
                <h3 className="font-semibold text-gray-900 dark:text-bye-dark-text-primary mb-2">Sustainability</h3>
                <p>Promoting reuse and reducing waste in our community.</p>
              </div>
              <div className="bg-gray-50 dark:bg-bye-dark-bg-secondary p-6 rounded-xl border border-gray-200 dark:border-bye-dark-border-primary">
                <h3 className="font-semibold text-gray-900 dark:text-bye-dark-text-primary mb-2">Community</h3>
                <p>Connecting students and fostering a helpful campus environment.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-bye-dark-text-primary mb-4">
              Get Started
            </h2>
            <p className="text-lg leading-relaxed">
              Ready to join the ByeBuy community? Sign up now to start buying and selling on campus. 
              Have questions? Visit our Help Center or contact our support team.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
