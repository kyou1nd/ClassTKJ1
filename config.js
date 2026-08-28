/* WebClass API configuration.
 * Abasthan serves the frontend and API from the same service. If the same
 * files are opened from GitHub Pages, use the deployed Abasthan API instead.
 */
(() => {
  const current = window.location.origin;
  const fallbackApi = 'https://wriggler-hasty-eagle.abasthan.app/api';
  const isGithubPages = /(^|\.)github\.io$/i.test(window.location.hostname);
  window.WEBCLASS_API_URL = window.WEBCLASS_API_URL || (isGithubPages ? fallbackApi : current + '/api');
})();
