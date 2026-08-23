# Lumensia V1.5.6 — NPC Goal V2

This release turns V1.5.5 NPC goals from passive state into evidence-based multi-turn progression.

Planned user-visible behavior:
- goals can advance or regress with explicit reasons;
- goals can become blocked, completed, abandoned, or explicitly reopened;
- new goals reset progress instead of inheriting stale metadata;
- recent finished/replaced goals remain visible in bounded NPC goal history;
- debug output shows the latest progress delta and reason;
- Event Director guards remain authoritative;
- one canonical model call per turn remains unchanged.
