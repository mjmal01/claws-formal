# CLAWS Midnight Eclipse — System Specification

## Overview

This project is a local-first interactive web application designed for the CLAWS formal event "Midnight Eclipse."

The system integrates:

* NFC card scanning
* Real-time interaction logic (direction, number, symbol)
* Live voting during speeches
* Award broadcasting
* A final interactive terminal-based game

The system operates across four phases:

1. Dinner (light interaction)
2. Speeches + Awards (structured interaction + voting)
3. Mingling (passive interaction)
4. Afterparty (full game unlock)

The system must feel:

* seamless
* cinematic
* social-first (not app-heavy)

---

# Core Concepts

Each attendee has a **Card (Node)**.

Each node has:

* id (string)
* name (string)
* constellation (IRIS, NOVA, VEGA, CORVUS, HOSHI, AURA, PROMETHEUS, ATLAS)
* symbol (same as constellation key)
* number (1–6)
* direction (N, E, S, W)
* isPolaris (boolean)
* title (string, keepsake only)

---

# Event Phases

## Phase 1: DINNER

Goal:

* encourage same-table interaction
* build constellation awareness

Active Systems:

* Symbol grouping (Rule 4A)
* Sequence detection (Rule 4B)
* Light pair interactions

UI State:

* "Connected"
* "Awaiting alignment"

---

## Phase 2: SPEECHES + AWARDS

Goal:

* structured flow
* integrate voting + NFC broadcast

Flow per team:

1. Video plays
2. Lead speaks
3. Leadership passing
4. Polaris recognition
5. Voting round (optional)
6. Award broadcast

---

## Phase 3: MINGLING

Goal:

* passive interaction
* social exploration

Systems:

* still active but no forced UI

---

## Phase 4: AFTERPARTY

Goal:

* full system activation
* terminal puzzle

Systems:

* all rules active
* constellation alignment required

---

# Game Mechanics

## Direction Rules

Opposites:

* N + S
* E + W

Same:

* N + N
* E + E

Adjacent:

* N + E, E + S, S + W, W + N

---

## Number Rules

Numbers only activate when paired with direction.

* Same number + same direction → Rare
* Same number + opposite direction → Rare
* Same number + adjacent direction → Mid

---

## Symbol Rules

Same symbol = same constellation

Rule 4A (Grouping):

* 2–3 → small clue
* 4–5 → mid clue
* full team → major unlock

Rule 4B (Sequence):

* ordered numbers within same symbol
* forward or reverse sequences
* longer chain = stronger clue

---

## Polaris Rules

Polaris = anchor nodes (1–3 per team)

Effects:

* clarifies clues
* upgrades combos
* unlocks final constellation direction

---

# Interaction Engine

## Pair Evaluation

Input: 2 cards

Returns:

* list of triggered rules

Rules:

* opposite direction
* same direction
* same number + same direction
* same number + opposite direction
* same number + adjacent direction
* Polaris interaction

---

## Group Evaluation

Input: array of cards

Group by symbol

Evaluate:

* symbol count (Rule 4A)
* number sequences (Rule 4B)
* Polaris presence
* full constellation

---

## Result Resolution

* multiple rules can trigger
* prioritize based on phase

Dinner priority:

1. symbol grouping
2. sequences
3. Polaris
4. direction rules
5. number-direction rules

Afterparty priority:

1. number-direction rare combos
2. Polaris upgrades
3. sequences
4. full constellation

---

# Real-Time System

## Connection Model

Each client:

* scans NFC → opens web app
* registers cardId
* subscribes to event channel

---

## Events

* PHASE_CHANGE
* VOTING_STARTED
* VOTE_SUBMITTED
* VOTING_CLOSED
* AWARD_RESULT
* CLUE_UNLOCKED
* TERMINAL_UPDATE

---

# Voting System

## Voting Round Structure

* id
* team
* title
* options (cardIds)
* votes (map of voterId → selectedId)
* status (open / closed)

---

## Flow

1. Admin starts voting
2. All clients receive voting UI
3. Users submit vote
4. Admin closes voting
5. System tallies
6. Broadcast winner

---

# Award Broadcast System

## Behavior

Admin triggers award

Server broadcasts:

* awardName
* winnerCardIds

Clients:

* if cardId matches → winner screen
* else → standby screen

---

# Terminal System (Afterparty)

## Purpose

Final puzzle:

* determine constellation → direction mapping

---

## Input

User enters:

* constellation alignments

Example:
IRIS → N
VEGA → E
ATLAS → W

---

## Validation

Check against solution object:

{
IRIS: "N",
VEGA: "E",
ATLAS: "W"
}

---

## Success State

Display:

POLARIS ACQUIRED
ALL CONSTELLATIONS ALIGNED
MIDNIGHT ECLIPSE COMPLETE

---

# Data Files

## cards.json

All attendee data

## constellations.json

Team sizes + Polaris requirements

## clues.json

Clue buckets:

* dinner
* rare
* terminal

---

# Suggested Tech Stack

## Frontend

* React (or Next.js)

## Backend (optional)

* Node + Express
* or fully client-side for MVP

## Realtime

* WebSockets OR
* Supabase Realtime

## Storage

* local JSON (MVP)
* optional SQLite

---

# File Structure

/src
/data
cards.json
constellations.json
clues.json
/logic
directions.js
pairRules.js
groupRules.js
clueEngine.js
votingEngine.js
progressEngine.js
/pages
ScanPage.jsx
LivePage.jsx
VotingPage.jsx
TerminalPage.jsx
AdminPanel.jsx

---

# Design Principles

* no instructions needed
* everything is discoverable
* interactions are fast
* no step should block the event flow
* prioritize social interaction over UI complexity

---

# MVP Scope

Build first:

* NFC scan → load card
* live connection
* pair evaluation
* group evaluation
* voting system
* award broadcast

Then add:

* terminal
* advanced clue logic
* persistence

---

# Final Note

This system is not just a game.

It is:

* a social layer
* a recognition system
* a narrative arc

Every interaction should feel:
intentional, fast, and slightly magical.
