// Audio capture utilities with multiple source options

export async function initSystemAudio() {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  
  // Option 1: System audio via screen capture (works on desktop)
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: false,
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: 48000
      }
    });
    
    return { audioContext, stream, type: 'system' };
  } catch (err) {
    console.log('System audio not available, falling back to microphone');
  }
  
  // Option 2: Microphone fallback
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });
    return { audioContext, stream, type: 'microphone' };
  } catch (err) {
    throw new Error('No audio source available');
  }
}

export async function initSpotifyMetadata() {
  // Web API for currently playing track
  const CLIENT_ID = 'your_spotify_client_id';
  const REDIRECT_URI = window.location.origin + '/callback';
  const SCOPES = 'user-read-currently-playing user-read-playback-state';
  
  // OAuth flow
  const authUrl = `https://accounts.spotify.com/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=${SCOPES}&response_type=token`;
  
  return {
    authUrl,
    getCurrentTrack: async (token) => {
      const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        return {
          title: data.item?.name,
          artist: data.item?.artists[0]?.name,
          album: data.item?.album?.name,
          albumArt: data.item?.album?.images[0]?.url,
          progress: data.progress_ms,
          duration: data.item?.duration_ms,
          isPlaying: data.is_playing
        };
      }
      return null;
    }
  };
}

export function extractAudioFeatures(analyser) {
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(dataArray);
  
  // Advanced audio feature extraction
  const nyquist = analyser.context.sampleRate / 2;
  const binHz = nyquist / analyser.frequencyBinCount;
  
  // Spectral centroid (brightness)
  let weightedSum = 0;
  let magnitudeSum = 0;
  for (let i = 0; i < dataArray.length; i++) {
    const magnitude = dataArray[i] / 255;
    weightedSum += i * magnitude;
    magnitudeSum += magnitude;
  }
  const spectralCentroid = magnitudeSum > 0 ? (weightedSum / magnitudeSum) * binHz : 0;
  
  // Peak frequency
  let maxMagnitude = 0;
  let peakBin = 0;
  for (let i = 0; i < dataArray.length; i++) {
    if (dataArray[i] > maxMagnitude) {
      maxMagnitude = dataArray[i];
      peakBin = i;
    }
  }
  const peakFrequency = peakBin * binHz;
  
  // RMS (loudness)
  const rms = Math.sqrt(dataArray.reduce((sum, val) => sum + (val/255) ** 2, 0) / dataArray.length);
  
  return {
    spectralCentroid,
    peakFrequency,
    rms,
    rawData: dataArray
  };
}