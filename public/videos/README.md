# Dormant moon background asset

`moon.mp4` belongs to `src/components/moon-background.tsx`. The production
`App` does not currently mount that component, so this video is not part of the
active interface or the frontend re-foundation plan.

The checked-in MP4 is about 25 MB. Before reactivating it, decide whether the
composition still needs it, then measure initial transfer, decode cost,
scrolling, page restoration, and background/foreground recovery on a real
iPhone. Generate alternate formats or a poster only for a selected composition;
do not treat the dormant component's old styling values as design-system
defaults.
