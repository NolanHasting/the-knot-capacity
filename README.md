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

The planner ranks up to three non-overlapping sessions using the live forecast, the selected session length and the visitor’s crowd limit. When forecast coverage is insufficient, it shows one upcoming session based on historical hourly averages. The reported count, inferred recount and experimental occupancy estimate are shown separately.

POST /api/feedback accepts anonymous crowd reports and suggestions. It uses a random browser token with a 10-minute per-token cooldown and 200 accepted submissions per Eastern day. These are cost controls, not proof of identity or presence. Browser tokens can be reset; origin checks are not authentication. Review abuse and configure stronger bot protection before broad promotion.

Firestore remains deny-all to clients. Administrators can review memberFeedback and feedbackContacts separately in Firebase Console. Never publish contact details or use them to train models. Reports are preliminary, not verified labels; compare with nearby inferred recounts, aggregate independent reports, and backtest before fitting a new model. No automatic notification or marketing messages are sent. Delete contact details after follow-up and periodically purge old feedbackLimits records; set a defined retention policy before public launch.

The experimental nowcast uses same-day inferred recounts and learned departure rates when supported. When it is unavailable, the estimate field is blank and the source reading stays visible. Closed heatmap hours contain no counts and use a distinct striped treatment.

## Launch candidate

The homepage leads with the current crowd, the next-hour outlook and the planner. The current reading and recent-crowd details expand on demand. Now, Plan and Trends link to dedicated sections. Each chart and the weekly heatmap have one Tab stop. Arrow keys move within the chart or heatmap.

The launch branch uses the backend's gated experimental estimate. If it is unavailable, the reported count remains visible and the estimate is left blank. The weekly heatmap still shows averages of reported counts. V4, historical Firestore documents and stored forecast scores require no migration.

- Quieter Later distinguishes a missing forecast, closed hours, insufficient time before closing, and a forecast with no meaningfully quieter hour. The planner checks the average and peak over each full session. Both features exclude the closing taper and skip windows with large coverage gaps. The planner uses one labeled historical suggestion when it has no supported session today.
- The header share button tries to share a timestamped PNG and campaign-tagged link together. Clipboard and download fallbacks keep the link available. The link always opens the current tracker.
- Hosting previews use production read APIs and do not deploy Cloud Functions. Feedback, analytics and administrator sign-in are disabled in the preview UI. The launch backend accepts browser feedback and analytics requests from the canonical tracker origin. The deployment workflow runs production jobs from `main`.
- The status API permits up to 15 seconds of shared caching for successful responses, bounded by the age of a live reading and the next minute boundary. Check the deployed endpoint's `Cache-Control` and cache hit headers after a release.
- The public GA4 measurement ID lives in `public/launch-config.js`. The site loads the Google tag directly after visitors opt in on the production domain. Turn off Enhanced Measurement to keep collection to the tracker’s own events. First-party analytics use opt-in browser identifiers, broad channels and 30-minute inactivity sessions. Configure Firestore TTL on `productVisitors`, `productSessions` and `productEventLimits` using `expiresAt` for 90, 7 and 2 days respectively. Set a retention period for daily aggregates and feedback, and publish the privacy notice before enabling analytics.
- To configure `/admin.html`, fill in the public Firebase web app config in `public/admin-config.js`, enable Email/Password authentication, create an administrator, and use a trusted Admin SDK environment to set the user's `admin: true` custom claim. The backend checks the claim and token revocation. Feedback contacts stay separate in Firestore Console. Verify the authenticated flow against a staging Firebase project before release.
- The dashboard displays daily distinct browsers, sessions, events, recent feedback, forecast scores and source health. Cross-day unique visitors, cohort retention and campaign-level attribution are pending. Traffic caps bound the accepted event volume, and origin checks constrain normal browser use. They do not verify that an event came from a real visitor.

### Launch setup

1. In GA4, open **Admin → Data streams**, select the web stream for `https://climbtheknot.live`, and turn off **Enhanced measurement**. After production deployment, opt in under **Privacy & settings**, open **Plan**, and look for `page_view` and `plan_view` in Realtime. The Firebase Hosting preview leaves analytics off.
2. In Firebase project settings, register or select a web app and copy its web SDK configuration object into `public/admin-config.js`. In **Authentication**, enable **Email/Password** and create the admin's account. A project administrator should set the account's `admin: true` claim with the Firebase Admin SDK using trusted credentials. The user must sign in again after the claim is set. Keep passwords and service-account keys out of the repository.
3. In Firestore, enable TTL on the three analytics collections listed above. Decide how long to keep daily aggregates, feedback and optional contact details, then reflect those periods in the privacy notice. A starting proposal is 12 months for daily aggregates, 90 days for feedback and contact deletion once replies are complete.
4. Use an isolated Firebase project for hosted end-to-end checks and verify that the deployed status endpoint produces cache hits. For local API and authorization checks, run the smoke test below from the repository with dependencies installed. It checks administrator access, feedback contact separation, date bounds and analytics event deduplication in a demo project.

   ```bash
   firebase emulators:exec --project demo-knot-launch --only auth,firestore,functions,hosting 'npm run test:emulator --prefix functions'
   ```
