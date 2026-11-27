// Start playback while the drive/playlist gesture is still active. Loading the
// driving scene first can consume transient user activation on mobile browsers.
export class RadioStation {
  constructor(media, tracks, onChange, onError) {
    this.media = media;
    this.tracks = tracks;
    this.onChange = onChange;
    this.onError = onError;
    this.index = 0;
    this.request = 0;
    this.playing = false;
    this.pending = false;
    media.volume = 0.45;
    media.preload = "none";
    media.addEventListener("ended", () => this.play(this.index + 1));
  }
  async play(i = this.index) {
    const request = ++this.request;
    this.index = (i + this.tracks.length) % this.tracks.length;
    const t = this.tracks[this.index],
      media = this.media;
    const formats = media.canPlayType('audio/ogg; codecs="vorbis"')
      ? [t.src, t.fallbackSrc]
      : [t.fallbackSrc, t.src];
    this.pending = true;
    let error;
    for (const url of formats) {
      try {
        if (media.src !== url) media.src = url;
        await media.play();
        if (request !== this.request) return;
        this.playing = true;
        this.pending = false;
        this.onChange();
        return;
      } catch (cause) {
        if (request !== this.request) return;
        error = cause;
        if (cause.name === "NotAllowedError") break;
      }
    }
    this.playing = false;
    this.pending = false;
    this.onChange();
    this.onError(error);
  }
  pause() {
    ++this.request;
    this.pending = false;
    this.media.pause();
    this.playing = false;
    this.onChange();
  }
  startDrive(enabled) {
    if (enabled && !this.playing && !this.pending) return this.play();
  }
}
