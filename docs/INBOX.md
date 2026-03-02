# Inbox

## Purpose

Inbox is a read-only overview of **unseen direct messages** from agents to the human/operator.

It is not a chat thread itself. It acts as a queue that helps you jump into the right DM quickly.

## Behavior

- Shows only DM messages that are incoming to the human/operator target.
- Groups messages by DM thread (`agent:<slug|dna>`), so multiple unseen messages from the same agent are merged.
- Each card shows:
  - sender/receiver header
  - timestamp (top-right)
  - unread count for that thread
  - latest unseen message preview
- Sorted by most recent unseen message first.

## Keyboard Controls (TUI)

- `0` opens Inbox.
- `↑` / `↓` moves selection across Inbox cards.
- `Enter` opens the selected DM thread in `Messages` view.
- `1` selects all-activity.
- `2..9` selects DM rooms in Messages.

## Read/Unread Model

- Inbox unread tracking is per DM thread.
- A thread is marked read up to its latest incoming message when:
  - you open that thread from Inbox (`Enter`), or
  - you switch directly into that DM thread in Messages.
- Current implementation keeps read markers in memory for the active TUI session.
  - Restarting the TUI resets unread markers.

## Composer Behavior

- Inbox hides the message composer.
- To reply, open a DM thread from Inbox and send from Messages view.

## Web Parity

This mirrors the web app intent: Inbox is an overview surface for DM follow-up, while replies happen in the specific DM thread.
