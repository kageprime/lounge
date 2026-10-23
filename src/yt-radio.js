// YouTube IFrame Player API Radio Engine for Miami Nights Synthwave Suite.
// Pure ES module: zero build, dynamic script injection, resilient event model.

export const MIAMI_PLAYLIST = [
  { id: 'rDBbaGCCIhk', title: 'Accelerated', artist: 'Miami Nights 1984', album: 'Early Summer', mood: 'Peak Outrun' },
  { id: 'gGkCgZ_rRps', title: 'Sunset', artist: 'The Midnight', album: 'Endless Summer', mood: 'Golden Hour' },
  { id: 'MV_3Dpw-BRY', title: 'Nightcall', artist: 'Kavinsky', album: 'Drive Original', mood: 'Midnight Cruise' },
  { id: '4xS787QZk44', title: 'Overdrive', artist: 'Lazerhawk', album: 'Redline', mood: 'High Octane' },
  { id: 'nLzjm9E1Chg', title: 'Ocean Drive', artist: 'Miami Nights 1984', album: 'Turbulence', mood: 'Coastal Breeze' },
  { id: '-EDtTf6O0v8', title: 'Tech Noir', artist: 'Gunship', album: 'GUNSHIP', mood: 'Cyber Noir' },
  { id: '8u7sYwSNDnE', title: 'Summer Love', artist: 'Trevor Something', album: 'Synthetic Love', mood: 'Late Night Chill' },
  { id: '4xDzrJKXOOY', title: 'Synthwave Radio 24/7', artist: 'Lofi Girl / Synthwave Boy', album: 'Live Stream', mood: 'Continuous Live' }
];

export class YouTubeRadio {
  constructor(options = {}) {
    this.playlist = [...MIAMI_PLAYLIST];
    this.trackIndex = 0;
    this.player = null;
    this.isReady = false;
    this.isPlaying = false;
    this.volume = options.volume ?? 70;
    this.listeners = new Map();
    this.containerId = options.containerId || 'ytPlayerHost';
  }

  init() {
    if (typeof window === 'undefined') return;

    // Check if YouTube API is already loaded or in progress
    if (window.YT && window.YT.Player) {
      this._createPlayer();
      return;
    }

    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prevReady) prevReady();
      this._createPlayer();
    };

    if (!document.getElementById('yt-iframe-api')) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  }

  _createPlayer() {
    try {
      const initialTrack = this.playlist[this.trackIndex];
      this.player = new window.YT.Player(this.containerId, {
        height: '100%',
        width: '100%',
        videoId: initialTrack.id,
        playerVars: {
          autoplay: 0,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          enablejsapi: 1,
          origin: window.location.origin || '*'
        },
        events: {
          onReady: () => {
            this.isReady = true;
            this.player.setVolume(this.volume);
            this._emit('ready', { track: this.getCurrentTrack() });
          },
          onStateChange: (event) => {
            // YT.PlayerState: 1 = PLAYING, 2 = PAUSED, 0 = ENDED, 3 = BUFFERING
            const playing = event.data === 1;
            this.isPlaying = playing;
            this._emit('state', { isPlaying: this.isPlaying, state: event.data });
            if (event.data === 0) {
              // Auto-advance to next track on finish
              this.next();
            }
          },
          onError: (err) => {
            this._emit('error', err);
          }
        }
      });
    } catch (e) {
      // Graceful fallback if blocked or headless
      this._emit('error', e);
    }
  }

  getCurrentTrack() {
    return this.playlist[this.trackIndex] || this.playlist[0];
  }

  play(idx = null) {
    if (idx !== null && idx >= 0 && idx < this.playlist.length) {
      this.trackIndex = idx;
      if (this.isReady && this.player?.loadVideoById) {
        this.player.loadVideoById(this.playlist[this.trackIndex].id);
        this.player.playVideo();
      }
    } else if (this.isReady && this.player?.playVideo) {
      this.player.playVideo();
    }
    this.isPlaying = true;
    this._emit('track', { track: this.getCurrentTrack(), isPlaying: true });
  }

  pause() {
    if (this.isReady && this.player?.pauseVideo) {
      this.player.pauseVideo();
    }
    this.isPlaying = false;
    this._emit('state', { isPlaying: false });
  }

  toggle() {
    if (this.isPlaying) this.pause();
    else this.play();
  }

  next() {
    this.trackIndex = (this.trackIndex + 1) % this.playlist.length;
    this.play(this.trackIndex);
  }

  prev() {
    this.trackIndex = (this.trackIndex - 1 + this.playlist.length) % this.playlist.length;
    this.play(this.trackIndex);
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(100, v | 0));
    if (this.isReady && this.player?.setVolume) {
      this.player.setVolume(this.volume);
    }
    this._emit('volume', { volume: this.volume });
  }

  loadCustom(input) {
    if (!input) return false;
    // Extract video ID from URL or raw 11-char ID
    let vidId = input.trim();
    const match = input.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    if (match) vidId = match[1];

    if (!vidId || vidId.length < 5) return false;
    const customTrack = {
      id: vidId,
      title: `Custom Radio Link [${vidId.slice(0, 6)}…]`,
      artist: 'User Broadcast',
      album: 'Miami Nights Feed',
      mood: 'Custom Stream'
    };
    this.playlist.unshift(customTrack);
    this.trackIndex = 0;
    this.play(0);
    return true;
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(fn);
  }

  _emit(event, data) {
    const fns = this.listeners.get(event) || [];
    for (const fn of fns) {
      try { fn(data); } catch (e) { /* ignore */ }
    }
  }
}
