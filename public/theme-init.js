// Apply the saved theme before CSS/React paint. Keep this script external so it
// can run under the Manager's script-src 'self' Content Security Policy.
try {
  const savedTheme = JSON.parse(localStorage.getItem('theme-storage'));
  if (savedTheme?.state?.isDarkMode === true) {
    document.documentElement.classList.add('dark');
  }
} catch (_) {}
