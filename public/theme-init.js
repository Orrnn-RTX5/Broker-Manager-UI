// Default to dark mode and apply a saved choice before CSS/React paint.
// Keep this script external so it can run under the Manager's script-src 'self'
// Content Security Policy.
let isDarkMode = true;
try {
  const savedTheme = JSON.parse(localStorage.getItem('theme-storage'));
  isDarkMode = savedTheme?.state?.isDarkMode !== false;
} catch {
  // Keep dark mode if the saved preference cannot be read.
}
document.documentElement.classList.toggle('dark', isDarkMode);
