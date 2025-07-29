# Fractal Music Visualizer

Fractals that react to audio input in real time

<img width="2954" height="1978" alt="image" src="https://github.com/user-attachments/assets/11dcad28-a0c3-4c4b-9bb9-08ff19a276f6" />

## Features

- Real-time audio visualization using the Web Audio API
- WebGL-based Julia set fractal rendering
- Keyboard controls
- Frequency maps (bass, mid, treble -> red, green, blue)
- Multiple fractal modes

## Controls

- **M** - Cycle through fractal modes (0-3)
- **,/.** - Adjust fractal speed
- **-/=** - Adjust color intensity
- **Q/W** - Adjust red intensity
- **A/S** - Adjust green intensity
- **Z/X** - Adjust blue intensity
- **E/R** - Adjust zoom intensity

## Performance Optimizations

- WebGL for hardware-accelerated graphics
- Efficient audio processing using Web Audio API
- Throttled and optimized render loop
- Responsive canvas sizing
- Minimal state updates

## Browser Requirements

- Modern browser with WebGL and Web Audio API support
- Audio permission is required (click anywhere to enable)
