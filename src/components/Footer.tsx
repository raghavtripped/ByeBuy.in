// src/components/Footer.tsx
export default function Footer() {
  return (
    <footer className="bg-gray-800 text-gray-300 text-sm py-4 mt-8">
      <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-2">
        <span>© {new Date().getFullYear()} Bidly • Campus Auctions</span>
        <a
          href="https://github.com/raghavtripped/bidly"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-white underline"
        >
          GitHub Repo
        </a>
      </div>
    </footer>
  );
}
