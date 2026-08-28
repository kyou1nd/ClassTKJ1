/* WebClass API configuration.
 * The Node/Express server also serves the frontend, so using the same origin
 * keeps login working on Render without hard-coding a deployment URL.
 */
window.WEBCLASS_API_URL = window.WEBCLASS_API_URL || (window.location.origin + '/api');
