/**
 * Analytics configuration.
 *
 * DMV Prep uses privacy-respecting behavior analytics to find friction points.
 * Microsoft Clarity (free, unlimited: heatmaps + session replay + rage/dead-click
 * detection) is the primary tool; Google Analytics 4 is optional for acquisition.
 *
 * Both are OFF until you add your IDs below AND the visitor grants consent
 * (see src/components/Analytics.astro). Leaving an ID blank disables that tool.
 *
 * Where to get the IDs:
 *   - Clarity:  https://clarity.microsoft.com  ->  Settings -> Overview -> Project ID
 *   - GA4:      https://analytics.google.com    ->  Admin -> Data streams -> Measurement ID (G-XXXX)
 */
export const CLARITY_PROJECT_ID = '';
export const GA4_MEASUREMENT_ID = '';

export const ANALYTICS_ENABLED = Boolean(CLARITY_PROJECT_ID || GA4_MEASUREMENT_ID);
