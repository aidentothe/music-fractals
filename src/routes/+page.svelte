<script>
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import '../app.css';

  // Utility function for linear interpolation
  function lerp(val, a1, b1, a2, b2) {
    return a2 + ((b2 - a2) * (val - a1)) / (b1 - a1);
  }

  // Create a lognormal kernel for filtering centered at `mean` with std deviation `std`
  function makeLogNormalKernel(n, mean, std) {
    const x = Array.from({ length: n }, (_, i) => i);
    const sigma = std / mean;
    const mu = Math.log(mean) + sigma ** 2;
    const kernel = x.map((v) =>
      Math.exp(-((Math.log(v + 1) - mu) ** 2) / (2 * sigma ** 2))
    );
    return kernel;
  }

  // State variables
  let canvas;
  let gl;
  let shaderProgram;
  let audioContext;
  let analyser;
  let audioSource;
  let mouseX = 0;
  let mouseY = 0;
  let width = 0;
  let height = 0;
  let resizeObserver;
  let animationFrameId;
  let isAudioInitialized = false;

  // Audio analysis values
  let bass = 0;
  let mid = 0;
  let treble = 0;

  // Audio filters
  let bassFilter = [];
  let midFilter = [];
  let trebleFilter = [];

  // Settings
  export let fractalMode = 2;
  export let fractalSpeed = 1.5;
  export let colorIntensity = 0.4;
  export let redIntensity = 2;
  export let greenIntensity = 0.6;
  export let blueIntensity = 0.1;
  export let zoomIntensity = 2;

  // Shader uniforms
  let arg = Math.PI / 2;
  let zoom = 1;

  // FPS calculation
  let fps = 0;
  let lastFrameTime = 0;
  let frameCount = 0;
  let lastFpsUpdate = 0;

  // Fragment shader code
  const fragmentShaderSource = `
    precision mediump float;
    
    uniform vec2 u_resolution;
    uniform vec2 u_mouse;
    uniform float u_time;
    uniform float r;
    uniform float g;
    uniform float b;
    uniform vec2 c;
    uniform float zoom;
    
    vec2 mul_c(vec2 a, vec2 b) {
      // Complex multiplication
      return vec2(a.x * b.x - a.y * b.y, a.x * b.y + b.x * a.y);
    }
    
    float in_julia(vec2 z, vec2 c) {
      for (int i = 0; i < 200; i++) {
        z = mul_c(z, z) + c;
        if (length(z) > 100.0) {
          return pow(float(i) / 2.0, 0.5) * 0.15;
        }
      }
      return 1.0;
    }
    
    vec3 hsv2rgb(vec3 c) {
      vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }
    
    vec4 gradient(float x) {
      return vec4(x*r, x*g, x*b, 1.0);
    }
    
    void main() {
      vec2 st = (gl_FragCoord.xy-u_resolution.xy/2.0)/u_resolution.y;
      vec2 z = (st) * (2.5 + zoom * 5.0);
      
      vec4 color = gradient(in_julia(z, c));
      gl_FragColor = color;
    }
  `;

  // Vertex shader code
  const vertexShaderSource = `
    attribute vec2 a_position;
    
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  function initWebGL() {
    gl = canvas.getContext('webgl', { antialias: false });

    if (!gl) {
      console.error('WebGL not supported');
      return;
    }

    // Create shader program
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vertexShaderSource);
    gl.compileShader(vertexShader);

    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fragmentShaderSource);
    gl.compileShader(fragmentShader);

    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      console.error(
        'Fragment shader compilation error:',
        gl.getShaderInfoLog(fragmentShader)
      );
    }

    shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
      console.error(
        'Shader program linking error:',
        gl.getProgramInfoLog(shaderProgram)
      );
    }

    gl.useProgram(shaderProgram);

    // Create a buffer for the vertices
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    // Rectangle that covers the entire canvas
    const positions = [-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0];

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    // Set up attributes
    const positionAttributeLocation = gl.getAttribLocation(
      shaderProgram,
      'a_position'
    );
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
  }

  async function initAudio() {
    try {
      // Create audio context
      audioContext = new (window.AudioContext || window.webkitAudioContext)();

      // Get user audio permission for capturing system audio
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Create an audio source from the stream
      audioSource = audioContext.createMediaStreamSource(stream);

      // Create an analyser
      analyser = audioContext.createAnalyser();
      analyser.smoothingTimeConstant = 0;
      analyser.fftSize = 512; // Must be a power of 2
      const bufferLength = analyser.frequencyBinCount;

      // Connect the source to the analyser
      audioSource.connect(analyser);

      // Create the audio processing filters
      const fftSize = analyser.frequencyBinCount;
      const sampleRate = audioContext.sampleRate;

      // Log-normal distribution (mean (Hz), std deviation)
      const bassFreqs = [200, 120];
      const midFreqs = [1000, 500];
      const trebleFreqs = [10000, 5000];

      // Hertz to discrete-fft space scale factor
      const scale = fftSize / sampleRate;

      // Create filters for bass, mid, and treble
      bassFilter = makeLogNormalKernel(
        fftSize,
        bassFreqs[0] * scale,
        bassFreqs[1] * scale
      );
      midFilter = makeLogNormalKernel(
        fftSize,
        midFreqs[0] * scale,
        midFreqs[1] * scale
      );
      trebleFilter = makeLogNormalKernel(
        fftSize,
        trebleFreqs[0] * scale,
        trebleFreqs[1] * scale
      );

      isAudioInitialized = true;
    } catch (err) {
      console.error('Error initializing audio:', err);
    }
  }

  function processAudio() {
    if (!analyser) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    // Convert to float and normalize
    const fftSize = analyser.frequencyBinCount;
    const floatArray = Array.from(dataArray).map((val) => val / 255.0);

    // Calculate mean volume
    const meanVol =
      floatArray.reduce((sum, val) => sum + val ** 2, 0) / floatArray.length;

    // Calculate bass, mid, and treble using filters
    let newBass = 0;
    let newMid = 0;
    let newTreble = 0;

    for (let i = 0; i < fftSize; i++) {
      newBass += bassFilter[i] * floatArray[i];
      newMid += midFilter[i] * floatArray[i];
      newTreble += trebleFilter[i] * floatArray[i];
    }

    // Smoothing factor (0 to 1): 0 -> slower, 1 -> faster tracking
    const smoothing = 0.05;

    // Interpolate new values for bass, midrange, and treble intensities
    bass = lerp(smoothing, 0, 1, bass, newBass);
    mid = lerp(smoothing, 0, 1, mid, newMid);
    treble = lerp(smoothing, 0, 1, treble, newTreble);

    return { meanVol, bass, mid, treble };
  }

  function mapArg(meanVol) {
    // Map arg to interesting areas of the Julia set based on fractal mode
    if (fractalMode === 0) {
      // Add volume (loop around)
      arg = arg + meanVol * fractalSpeed;
      const y = arg;
      return [0.7885 * Math.cos(y), 0.7885 * Math.sin(y)];
    } else if (fractalMode === 1) {
      // Fixed starting point
      arg = lerp(0.1, 0, 1, arg, Math.PI / 2 + meanVol * fractalSpeed);
      const y = arg;
      return [0.7885 * Math.cos(y), 0.7885 * Math.sin(y)];
    } else if (fractalMode === 2) {
      // Add volume (loop around), but only keep a fixed interval
      arg = lerp(0.1, 0, 1, arg, arg + meanVol * fractalSpeed);
      const y = (Math.sin(arg) * Math.PI) / 2 + Math.PI;
      return [0.7885 * Math.cos(y), 0.7885 * Math.sin(y)];
    } else if (fractalMode === 3) {
      // Add volume (loop around), but only keep a fixed interval
      // Also factor mouse into it
      arg += meanVol * fractalSpeed;
      const y = (Math.sin(arg) * Math.PI) / 2 + Math.PI;
      const mouseXNorm = (mouseX / width - 0.5) * 0.5;
      const mouseYNorm = (mouseY / height - 0.5) * 0.5;
      return [
        0.7885 * Math.cos(y) + mouseXNorm,
        0.7885 * Math.sin(y) + mouseYNorm,
      ];
    }

    return [arg, 0];
  }

  function render(timestamp) {
    if (!gl || !shaderProgram) return;

    // Calculate FPS
    if (timestamp - lastFpsUpdate > 1000) {
      fps = Math.round((frameCount * 1000) / (timestamp - lastFpsUpdate));
      frameCount = 0;
      lastFpsUpdate = timestamp;
    }
    frameCount++;

    // Process audio
    let audioData = { meanVol: 0, bass, mid, treble };
    if (isAudioInitialized) {
      audioData = processAudio() || audioData;
    }

    // Resize canvas to match display dimensions for sharp rendering
    if (
      canvas.width !== canvas.clientWidth * 2 ||
      canvas.height !== canvas.clientHeight * 2
    ) {
      canvas.width = canvas.clientWidth * 2;
      canvas.height = canvas.clientHeight * 2;
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    // Update shader uniforms
    const uResolution = gl.getUniformLocation(shaderProgram, 'u_resolution');
    gl.uniform2f(uResolution, canvas.width, canvas.height);

    const uTime = gl.getUniformLocation(shaderProgram, 'u_time');
    gl.uniform1f(uTime, timestamp * 0.001);

    const uMouse = gl.getUniformLocation(shaderProgram, 'u_mouse');
    gl.uniform2f(uMouse, mouseX, mouseY);

    // Update color intensity based on audio
    const COLOR_CLIP = 300;

    const rUniform = gl.getUniformLocation(shaderProgram, 'r');
    gl.uniform1f(
      rUniform,
      Math.min(
        COLOR_CLIP,
        lerp(audioData.bass * colorIntensity * redIntensity, 0, 1, 0.3, 1)
      )
    );

    const gUniform = gl.getUniformLocation(shaderProgram, 'g');
    gl.uniform1f(
      gUniform,
      Math.min(
        COLOR_CLIP,
        lerp(audioData.mid * colorIntensity * greenIntensity, 0, 1, 0.3, 1)
      )
    );

    const bUniform = gl.getUniformLocation(shaderProgram, 'b');
    gl.uniform1f(
      bUniform,
      Math.min(
        COLOR_CLIP,
        lerp(audioData.treble * colorIntensity * blueIntensity, 0, 1, 0.3, 1)
      )
    );

    // Julia set parameter
    const juliaC = mapArg(audioData.meanVol);
    const cUniform = gl.getUniformLocation(shaderProgram, 'c');
    gl.uniform2f(cUniform, juliaC[0], juliaC[1]);

    // Zoom parameter
    zoom = lerp(0.1, 0, 1, zoom, audioData.meanVol);
    const zoomUniform = gl.getUniformLocation(shaderProgram, 'zoom');
    gl.uniform1f(zoomUniform, zoom * zoomIntensity);

    // Draw the scene
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Request next frame with high priority
    animationFrameId = requestAnimationFrame(render);
  }

  function handleMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  }

  function handleKeyDown(event) {
    // Fractal mode
    if (event.key === 'm') {
      fractalMode = (fractalMode + 1) % 4;
    }

    // Fractal speed adjustment
    if (event.key === ',') {
      fractalSpeed = Math.max(0, fractalSpeed - 0.05);
    }
    if (event.key === '.') {
      fractalSpeed = Math.min(2, fractalSpeed + 0.05);
    }

    // Color adjustment
    if (event.key === '-') {
      colorIntensity = Math.max(0, colorIntensity - 0.01);
    }
    if (event.key === '=') {
      colorIntensity = Math.min(5, colorIntensity + 0.01);
    }

    // Red adjustment
    if (event.key === 'q') {
      redIntensity = Math.max(0, redIntensity - 0.1);
    }
    if (event.key === 'w') {
      redIntensity = Math.min(5, redIntensity + 0.1);
    }

    // Green adjustment
    if (event.key === 'a') {
      greenIntensity = Math.max(0, greenIntensity - 0.1);
    }
    if (event.key === 's') {
      greenIntensity = Math.min(5, greenIntensity + 0.1);
    }

    // Blue adjustment
    if (event.key === 'z') {
      blueIntensity = Math.max(0, blueIntensity - 0.1);
    }
    if (event.key === 'x') {
      blueIntensity = Math.min(5, blueIntensity + 0.1);
    }

    // Zoom adjustment
    if (event.key === 'e') {
      zoomIntensity = Math.max(0, zoomIntensity - 0.1);
    }
    if (event.key === 'r') {
      zoomIntensity = Math.min(10, zoomIntensity + 0.1);
    }
  }

  onMount(() => {
    if (browser) {
      // Initialize WebGL
      initWebGL();

      // Start audio after user interaction (required by most browsers)
      const startAudio = () => {
        if (!isAudioInitialized) {
          initAudio();
          document.removeEventListener('click', startAudio);
          document.removeEventListener('keydown', startAudio);
        }
      };

      document.addEventListener('click', startAudio);
      document.addEventListener('keydown', startAudio);

      // Handle resize for responsive canvas
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          width = entry.contentRect.width;
          height = entry.contentRect.height;

          // Update canvas dimensions for pixel-perfect rendering
          canvas.width = width * 2;
          canvas.height = height * 2;
          gl.viewport(0, 0, canvas.width, canvas.height);
        }
      });

      resizeObserver.observe(canvas);

      // Start the render loop with high priority
      animationFrameId = requestAnimationFrame(render);

      // Add event listeners
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      // Cleanup
      if (resizeObserver) {
        resizeObserver.disconnect();
      }

      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }

      if (audioContext) {
        audioContext.close();
      }

      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('keydown', handleKeyDown);
    };
  });
</script>

<div class="relative w-screen h-screen">
  <canvas bind:this={canvas} class="absolute block w-screen h-screen"></canvas>

  <div
    class="absolute top-2.5 left-2.5 bg-black/50 p-2.5 rounded text-xs pointer-events-none"
  >
    <div>{fps} fps</div>
    <div>[M] Fractal mode: {fractalMode}</div>
    <div>[,.] Fractal speed: {fractalSpeed.toFixed(2)}</div>
    <div>[-=] Color intensity: {colorIntensity.toFixed(2)}</div>
    <div>[qw] Red intensity: {redIntensity.toFixed(1)}</div>
    <div>[as] Green intensity: {greenIntensity.toFixed(1)}</div>
    <div>[zx] Blue intensity: {blueIntensity.toFixed(1)}</div>
    <div>[er] Zoom intensity: {zoomIntensity.toFixed(1)}</div>
    <div>Bass: {bass.toFixed(3)}</div>
    <div>Midrange: {mid.toFixed(3)}</div>
    <div>Treble: {treble.toFixed(3)}</div>

    {#if !isAudioInitialized}
      <div class="mt-2.5 text-yellow-300 font-bold">
        Click anywhere to enable audio
      </div>
    {/if}
  </div>
</div>
