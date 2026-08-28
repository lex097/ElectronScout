# ElectronScout

A scouting app for FIRST Robotics Competition teams.

[Download on the App Store](https://apps.apple.com/us/app/electronscout/id6757549969)

## What it does

ElectronScout helps your team collect and make sense of match data at competitions. Scouts record what happens on the field, and the app turns those notes into team stats, rankings, and picklists you can actually use during alliance selection.

It's built to work at venues with bad Wi-Fi. Everything you enter is saved on your phone right away and syncs up when you get a connection back, so you never lose data mid-match.

## Highlights

- **Offline-first** — scout a whole event with no signal and sync later
- **Match scouting** — quick data entry tailored to the current season's game
- **Team analytics** — stats and trends pulled together from your scouting plus public data
- **Picklists** — build and reorder your pick list as a group
- **Scouter schedules** — assign who's scouting which matches
- **QR sharing** — pass data between devices without a network
- **Match betting** — friendly wagers on match outcomes with virtual currency

## Season updates

The app is tuned to each year's FRC game. When a new season starts, the game-specific scoring and metrics get updated and a new version ships.

## Tech

Built with React Native and Expo, with a Supabase backend. Match data lives in a local SQLite database first and syncs to the server in the background.
