# Moon Background Video

## Setup Instructions

1. **Download your moon video** and save it here as `moon.mp4`

2. **Optional: Create optimized formats**
   - WebM for better compression: 
     ```bash
     ffmpeg -i moon.mp4 -c:v libvpx-vp9 -crf 40 -b:v 0 moon.webm
     ```
   - Extract a poster frame:
     ```bash
     ffmpeg -i moon.mp4 -ss 00:00:00 -vframes 1 moon-poster.jpg
     ```

3. **Adjust the effect** - Edit `/src/components/moon-background.tsx`:
   - `opacity: 0.15` - Lower = more subtle
   - `brightness(0.4)` - Lower = darker
   - `contrast(1.2)` - Higher = more dramatic
   - `width: 40vw` - Adjust moon size
   - `mix-blend-mode: screen` - Try `overlay`, `lighten`, `difference`
   - Remove `url(#dither-filter)` if you want less retro effect

## Video Requirements

- **Perfect loop** ✓ (you mentioned you have this)
- **Recommended size:** 800x800px or smaller
- **Format:** MP4 (H.264) for best compatibility
- **File size:** Keep under 5MB for faster loading
- **Framerate:** 24-30fps is plenty for a background

## Tips

- Use a tool like HandBrake or ffmpeg to compress the video
- Test on mobile - lower opacity if needed
- The dither filter is applied via SVG - it's performant but optional
