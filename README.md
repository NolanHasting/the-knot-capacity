# Climb the Knot

A live crowd tracker for The Knot Climbing Gym in Gainesville, Florida. The gym publishes its current count. Climb the Knot saves those readings so climbers can answer two more questions before heading over: **Is it getting busier? Would I have a quieter session later?** [Open the tracker](https://climbtheknot.live/)

## What climbers see

- **Right now.** The gym’s reported count, the last likely recount, and an estimate of how many people are inside. The note below the estimate tells you where it comes from.
- **Later today.** A chart follows the count from opening to the latest reading, then projects the crowd through closing. Recount markers let you see where the gym’s number dropped.
- **Across the week.** A heatmap shows which hours tend to be busy. A date picker lets you revisit a particular day or look ahead to a future session.

## How a reading reaches the dashboard

| Layer | Implementation |
| --- | --- |
| Collection | A scheduled Node.js Cloud Function polls the gym’s public feed every minute during opening hours. A Firestore transaction records each minute once, even if the job retries. |
| Storage | Firestore keeps the current reading in `system/current`, the minute history in `days/YYYY-MM-DD`, and weekday averages in `system/weekly`. Keeping these separately lets the dashboard load the current count without downloading a day of history. |
| API | Firebase Hosting routes `/api/status` and `/api/history?date=YYYY-MM-DD` to Cloud Functions. The browser and widget read from the same backend. |
| Interface | HTML, CSS, and browser JavaScript in `public/` render the count, charts, heatmap, and session planner. The status response tells the interface when a reading is live, delayed, or offline. |
| Delivery | GitHub Actions runs regression tests and builds Hosting previews for pull requests. Merging to `main` deploys Hosting and Functions. |

## Reading a counter without checkout data

A change from 48 to 40 is the most useful clue in the feed. It suggests someone corrected the counter to 40. Eight people could have left gradually while others checked in. The feed gives no way to reconstruct those individual visits. If the correction happens in several steps, the tracker marks the final count once.

**Estimating the crowd now.** The model learns a departure rate from the size and spacing of larger corrections. After two qualifying samples, it can apply that rate to the time since the latest recount that day. If the gym reports 42 and the learned rate is one person every five minutes, 20 minutes since the recount gives an estimate of **~38**. The correction is capped at one hour. Until there is enough evidence, the estimate uses the gym’s count. If the feed goes stale, it uses the historical hourly average when available, then the last reported count. See [recount detection](functions/recounts.js) and [estimate selection](functions/health.js).

**Forecasting the rest of the day.** The forecast starts at the reported count. Recent movement helps predict the next few minutes. Farther out, the model uses the shape of past climbing days. Each night it builds 15-minute profiles from up to 60 completed days of inferred recounts, weighting recent days and matching weekdays more heavily. The tracker uses a weekly baseline until it has at least six recounts across three days. The curve reaches zero at scheduled closing by assumption. See [forecast implementation](functions/seasonal.js).

**Checking the predictions.** The backend saves forecasts before later readings arrive and scores them by model version the next morning. A separate backtest trains on earlier days, starts a forecast at a recount, and compares the prediction with a later recount. For example, a prediction of 35 against a recount of 42 is a seven-person error. At each forecast horizon, the model needs 25 comparisons across at least four days before it uses the 80th percentile of those errors to set the shaded range. Sparse history gets a provisional range. Accuracy here measures agreement with inferred recounts. The gym has no independent headcount in this dataset. See [forecast scoring](functions/analytics.js).

## Local development

Use Node.js 22. From the repository root run

```bash
npm ci --prefix functions
npm test --prefix functions
```

For integration checks with the Firebase CLI installed, run

```bash
firebase emulators:exec --project demo-knot-launch --only auth,firestore,functions,hosting 'npm run test:emulator --prefix functions'
```
