# The Knot Capacity

Independent live crowd tracker for The Knot Climbing Gym in Gainesville, Florida.

**Public site:** https://climbtheknot.live/  
**Official gym website (unaffiliated):** https://climbtheknot.com/

## What it shows

- Current count reported by the gym's public capacity endpoint.
- Historical reported counts and inferred staff recounts, shown separately.
- Short-term forecasts through closing, and future-date crowd estimates.
- A weekly heatmap and suggested quieter climbing hours.

**Interpretation:** The gym's reported counter appears to increase with check-ins. Downward corrections are treated as staff recounts and the ending counts are used as stronger historical occupancy observations. Their magnitude does **not** measure the number of departures. Some staff recounts may increase the count, which cannot reliably be identified from public source changes alone. All prediction ranges are estimates, not independently certified headcounts.

## Architecture

| Path | Purpose |
| --- | --- |
| `functions/index.js` | Cloud Functions, hourly schedule, Firestore collection, read-only APIs |
| `functions/health.js` | Schedule-aware source freshness and public status |
| `functions/logic.js` | Crowd categories, observed trend, weekly averages, legacy forecast fallback |
| `functions/recounts.js` | Group downward corrections into one staff recount episode |
| `functions/seasonal.js` | Recount-anchored seasonal forecast, chronological backtest, empirical interval bands |
| `functions/analytics.js` | Daily compact summaries, frozen forecasts, model-specific accuracy scores |
| `functions/history.js` | Historical and fallback future-date APIs |
| `public/` | Static dashboard, CSS and search metadata |
| `tests/` | Node regression checks |
| `.github/workflows/` | Tests, previews, production deploy, cleanup, manual export |

### Storage collections

- `system/current`: latest reading, health, current forecasts and recent observations.
- `system/weekly`: cumulative day/hour and 15-minute aggregates.
- `system/seasonalModel`: completed-day recount profile and historical backtest.
- `days/YYYY-MM-DD`: minute observations, used by history and training.
- `dailySummaries`: 15-minute summaries.
- `forecastSnapshots`: frozen predictions (with model version).
- `forecastScores`: daily scores separated by model.
- `recountEvents`: inferred staff recount episodes.

Firestore client access is denied. The public website uses GET-only Cloud Functions at `/api/status` and `/api/history?date=YYYY-MM-DD`.

### Schedules

Times shown are America/New_York.

- Every minute: `collectOccupancy`, which fetches only during configured gym hours.
- 2:15 AM: `scoreOccupancyForecasts`, which evaluates yesterday's saved forecasts.
- 4:20 AM: `trainSeasonalForecast`, which refreshes the model using up to 60 completed days.

Gym hours are configured in `functions/logic.js` (`HOURS`); verify against the official gym when operating hours change. The scheduled closing-time zero is a modeling assumption, not a measurement.

### Forecasting constraints

The real-time forecast is anchored to the latest reported count; if enough completed days have recount observations, the seasonal model blends recent trend with a learned daily curve. Unsupported hours do not receive arbitrary long-gap interpolations. Prediction intervals use measured errors against later recounts only when enough independent days and comparisons exist. Otherwise, they are explicitly provisional.

`forecastAccuracy` in the status API reflects only the active forecast version; previous models' results are retained in daily `forecastScores`.

## Local development

Node.js 22 required.

```bash
npm ci --prefix functions
npm test --prefix functions
node --check functions/index.js
```

Firebase project: `theknotcapacity`. Deployments occur from merged commits on `main` via GitHub Actions. Do not commit service-account credentials or `.env` secrets. Use the existing GitHub secret `FIREBASE_SERVICE_ACCOUNT_THEKNOTCAPACITY` with the deployment workflow.

## Backup and data export

Historical backup branches are kept under `backup/`. For data backups, use the manual **Export historical Firestore occupancy data** workflow. The export is encrypted before upload and requires `EXPORT_ENCRYPTION_PASSWORD`; never commit extracted data or an unencrypted export.

**Scaling consideration:** The original collector rewrites a growing `days/YYYY-MM-DD` array and cumulative `system/weekly` aggregates. Firestore document size limits may eventually require chunked day records and a data migration. Do not replace these schemas without updating the history, training and export readers together and verifying recovered history first.

## Search indexing

The main public indexable page is `https://climbtheknot.live/`. Its XML sitemap is at `https://climbtheknot.live/sitemap.xml` and is linked from `/robots.txt`. The widget guide is at `/widgets.html` and is also indexed. A sitemap lists URLs for crawlers; it is not a duplicate of the webpage. Submit the full sitemap URL in Google Search Console for the custom domain. The XSL stylesheet only makes the XML more readable in browsers.

## Disclaimer

Knot Capacity is an independent project, not owned or endorsed by The Knot Climbing Gym. Live count and historical reports come from the gym's public capacity feed. No guarantee of actual headcount, future capacity, opening hours or admission is made.

## Member experience and feedback

Today’s recommendation ranks full two-hour sessions using the live forecast and a 30-minute closing buffer. The weekly list ranks one two-hour window per upcoming day using historical hourly averages, excluding the final hour. The live reported count remains authoritative as a source reading, not an exact headcount; inferred recount and experimental occupancy estimate are separate.

POST /api/feedback accepts anonymous crowd reports and suggestions. It uses a random browser token with a 10-minute per-token cooldown and 200 accepted submissions per Eastern day. These are cost controls, not proof of identity or presence. Browser tokens can be reset; origin checks are not authentication. Review abuse and configure stronger bot protection before broad promotion.

Firestore remains deny-all to clients. Administrators can review memberFeedback and feedbackContacts separately in Firebase Console. Never publish contact details or use them to train models. Reports are preliminary, not verified labels; compare with nearby inferred recounts, aggregate independent reports, and backtest before fitting a new model. No automatic notification or marketing messages are sent. Delete contact details after follow-up and periodically purge old feedbackLimits records; set a defined retention policy before public launch.

The existing forecast algorithm is unchanged to preserve historical evaluation. The extra nowcast is experimental and uses same-day recounts and learned departure rates when supported; otherwise the interface labels the current reported count as an unadjusted fallback. Recounts can also be inferred directly from today's history for older API versions. Do not conflate this with verified staff counts. Closed heatmap hours contain no counts and use a distinct striped treatment.

## Launch candidate (separate branch)

No historical documents or active forecast version are migrated. The UI uses the server's gated occupancyEstimate rather than separately computing a second nowcast. The status endpoint allows a 15-second shared cache and strips selected internal state. The weekly heatmap remains a reported-count average.

- Planner: crowd threshold, session duration and preferred period remain in localStorage; today's windows evaluate both average and peak, including the endpoint. Show at most three non-overlapping matching sessions today, one closest alternative if none match, or one historical suggestion when today's forecast is unavailable. Historical suggestions use hourly reported averages, not observed peaks.
- Sharing: one header share button for a timestamped PNG snapshot and campaign-tagged URL; native share, clipboard and download fallbacks. The URL opens current conditions; rich timestamp-specific Open Graph pages are not implemented.
- Installation: web manifest and service worker, existing widget guide. No offline API caching.
- Notifications: deferred; removed the foreground notification and calendar reminder UI and handlers.
- Analytics: optional first-party events and optional GA4, disabled in previews. Counts are estimates of browser activity, not people. GA4 requires a measurement ID in public/launch-config.js. Set up an appropriate privacy notice before enabling; no contact info or exact preferences are sent. Configure Firestore TTL on productVisitors, productSessions and productEventLimits using expiresAt. The daily counters have a global cap, not robust bot protection.
- Private admin: /admin.html requires Firebase Auth with an admin custom claim (server verifies ID token and revocation). Fill public/admin-config.js with the public web app config, enable Email/Password, create an administrator and assign the claim using a trusted Admin SDK environment. Do not place credentials in source. Contact details remain separate in Firestore Console. Dashboard displays daily distinct browser IDs (not 30-day deduplicated visitors), sessions, events, latest feedback and forecast scores.
- Preview channels reuse production read APIs and may not have new functions available until deployed; feedback and admin sign-in are disabled in preview. Analytics is explicitly disabled outside the canonical domain. Do not merge until reviewing tests and configuring services.
- Remaining work: independent headcount validation, shadow model, recount heatmap, special closures, storage migration, durable push, dynamic social previews, stronger anti-abuse and full browser/device testing.

