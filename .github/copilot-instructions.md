# Progress Management App Review Instructions

This repository is a personal progress and goal management application.

Prioritize correctness, data integrity, and predictable user behavior.

## Data integrity

Carefully check for:

- accidental data loss
- duplicate records
- inconsistent state between client and server
- invalid state transitions
- orphaned records
- stale cached data
- race conditions
- optimistic update rollback failures

Never allow a UI action to appear successful when persistence has failed.

## Dates and time

Date and time logic is critical.

Check:

- timezone handling
- JST vs UTC conversions
- day boundaries
- week boundaries
- month boundaries
- leap years
- recurring tasks
- streak calculations
- "today", "yesterday", and overdue calculations

Avoid comparing formatted date strings when real timestamps should be used.

## Progress calculations

Check all progress and statistics calculations.

Examples:

- completed / total
- percentages
- streaks
- daily totals
- weekly totals
- goal completion
- historical statistics

Check zero denominators, empty datasets, deleted records,
and values outside expected ranges.

## State transitions

Verify that entities cannot enter impossible states.

Examples:

- completed task becoming incomplete
- archived project receiving new tasks
- deleted task still affecting statistics
- completed goal exceeding 100%
- duplicated completion events

## UX

Flag cases where:

- user actions have no visible feedback
- errors are silently ignored
- destructive actions are too easy
- loading states are missing
- empty states are confusing
- form validation is unclear

## Review style

Focus on actual bugs and realistic failure modes.

For each issue:
1. Explain what can go wrong.
2. Give a concrete reproduction scenario.
3. Suggest a minimal fix.

Do not report trivial style preferences unless they affect maintainability or correctness.
