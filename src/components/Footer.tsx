// src/components/Footer.tsx
export default function Footer() {
  return (
    <footer className="bg-gray-800 text-gray-300 text-sm py-4 mt-8">
      <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row
                      justify-between items-center gap-2">
        <span>© {new Date().getFullYear()} Bidly • Campus Auctions</span>

        <a
          href="https://www.linkedin.com/in/iraghavt/"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-white underline"
        >
          Raghav&apos;s LinkedIn
        </a>
      </div>
    </footer>
  );
}
