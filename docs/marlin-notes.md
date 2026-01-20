# Marlin Notes

- The streamer expects a single "ok" line per command (standard Marlin behavior).
- Commands are sent in absolute positioning mode (G90) with millimeter units (G21).
- The plotter should be configured to allow safe Z travel at the configured zUp height.
- If you use software endstops or limits, ensure xMax in config matches the usable range.
- Consider disabling automatic bed leveling and other moves that might inject unexpected commands.
