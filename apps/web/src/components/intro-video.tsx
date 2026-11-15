'use client';

import { useRef, useState } from 'react';
import { PlayIcon } from '@phosphor-icons/react/dist/csr/Play';

export function IntroVideo() {
  const video = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(false);

  async function play() {
    setStarting(true);
    setError(false);
    try {
      await video.current?.play();
    } catch {
      setStarting(false);
      setError(true);
    }
  }

  return (
    <>
      <div className="marketing-video-frame">
        <video
          ref={video}
          className="marketing-video-player"
          controls
          playsInline
          preload="none"
          poster="/media/noteesta-intro-poster.jpg"
          width={1920}
          height={1080}
          tabIndex={started ? 0 : -1}
          aria-label="An introduction to Noteesta"
          aria-describedby="video-description"
          onPlaying={() => {
            if (!started) video.current?.focus();
            setStarted(true);
            setStarting(false);
          }}
          onError={() => {
            setStarting(false);
            setError(true);
          }}
        >
          <source src="/media/noteesta-intro.mp4" type="video/mp4" />
          <track src="/media/noteesta-intro.vtt" kind="captions" srcLang="en" label="English" />
          <p>
            <a href="/media/noteesta-intro.mp4">Download the Noteesta intro video.</a>
          </p>
        </video>
        {!started ? (
          <button
            type="button"
            className="marketing-video-play"
            aria-label="Play the 43-second Noteesta film"
            disabled={starting}
            onClick={() => void play()}
          >
            <span className="marketing-video-play-label">
              <PlayIcon size={17} weight="fill" aria-hidden="true" />
              {starting ? 'Starting film…' : 'Play film'}
              <span className="marketing-video-duration">0:43</span>
            </span>
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="marketing-video-error" role="status">
          The film could not start. <a href="/media/noteesta-intro.mp4">Open the video directly.</a>
        </p>
      ) : null}
    </>
  );
}
