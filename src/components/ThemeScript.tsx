// src/components/ThemeScript.tsx
// (NO "use client")

const script = `
if (typeof window !== 'undefined') {
  try {
    var stored = localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.classList.toggle('dark', stored === 'dark');
    } else {
      var prefers = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', prefers);
    }
  } catch (_) {}
}
`;

export default function ThemeScript() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: script }} />
      <script id="theme-check" dangerouslySetInnerHTML={{ __html: `
        (function() {
          document.documentElement.classList.toggle('dark', document.documentElement.classList.contains('dark'));
        })();
      `}} />
    </>
  );
}
