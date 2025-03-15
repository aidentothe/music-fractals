# Julia Set Audio Visualizer

This is a SvelteKit implementation of the Julia set fractal visualizer that reacts to audio input in real-time with ultra-low latency.

## Features

- Real-time audio visualization using the Web Audio API
- WebGL-based Julia set fractal rendering
- Responsive and high-performance design
- Keyboard controls for interactive parameter adjustment
- Frequency analysis for bass, mid, and treble components
- Multiple fractal modes

## Controls

- **M** - Cycle through fractal modes (0-3)
- **,/.** - Decrease/increase fractal speed
- **-/=** - Decrease/increase color intensity
- **Q/W** - Decrease/increase red intensity
- **A/S** - Decrease/increase green intensity
- **Z/X** - Decrease/increase blue intensity
- **E/R** - Decrease/increase zoom intensity

## Performance Optimizations

- WebGL for hardware-accelerated graphics
- Efficient audio processing using Web Audio API
- Throttled and optimized render loop
- Responsive canvas sizing
- Minimal state updates

## Browser Requirements

- Modern browser with WebGL and Web Audio API support
- Audio permission is required (click anywhere to enable)

## Running the project

```bash
# Install dependencies
npm install

# Start the development server
npm run dev

# Build for production
npm run build
```

## Notes

The Web Audio API can only access microphone audio by default. For true system audio capture (like in the original Python implementation), you would need a browser extension or native companion app.
