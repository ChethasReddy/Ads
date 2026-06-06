"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

const adMarkers = [
  { label: "Ad 1", time: 30 },
  { label: "Ad 2", time: 90 },
];

function formatTime(timeInSeconds: number) {
  const safeTime = Number.isFinite(timeInSeconds) ? Math.max(0, timeInSeconds) : 0;
  const minutes = Math.floor(safeTime / 60);
  const seconds = Math.floor(safeTime % 60);

  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

export default function GetStartedPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(180);

  const markers = useMemo(
    () =>
      adMarkers.map((marker) => ({
        ...marker,
        left: `${(marker.time / duration) * 100}%`,
      })),
    [duration]
  );

  function syncTime() {
    if (!videoRef.current) {
      return;
    }

    setCurrentTime(videoRef.current.currentTime);
  }

  function syncDuration() {
    if (!videoRef.current || !Number.isFinite(videoRef.current.duration)) {
      return;
    }

    setDuration(videoRef.current.duration);
  }

  function handleTimelineChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextTime = Number(event.target.value);

    if (!videoRef.current) {
      return;
    }

    videoRef.current.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  function jumpTo(time: number) {
    if (!videoRef.current) {
      return;
    }

    videoRef.current.currentTime = time;
    setCurrentTime(time);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#1b1b1b] px-4 py-6 text-[#fff8d6]">
      <section className="w-full max-w-5xl border-2 border-[#f3e8a6] bg-[#1b1b1b] p-3 font-mono shadow-[10px_10px_0px_0px_#000]">
        <div className="border-2 border-[#f3e8a6]">
          <div className="flex items-center justify-between gap-4 border-b-2 border-[#f3e8a6] px-3 py-3 text-sm sm:text-lg">
            <div className="flex items-center gap-2">
              <span>MomentSense Ads</span>
            </div>
            <div className="flex items-center gap-3 sm:gap-5">
              <span>Memory: On</span>
              <button
                type="button"
                className="border-l-2 border-[#f3e8a6] pl-3 text-[#fff8d6] transition-colors duration-150 hover:text-white"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="grid min-h-[18rem] grid-cols-1 border-b-2 border-[#f3e8a6] md:grid-cols-[1.65fr_1fr]">
            <div className="border-b-2 border-[#f3e8a6] px-5 py-6 md:border-b-0 md:border-r-2 md:border-[#f3e8a6]">
              <div className="flex h-full flex-col gap-4">
                <p className="text-lg sm:text-2xl">Video Player</p>
                <div className="relative flex-1 overflow-hidden border-2 border-[#f3e8a6] bg-black">
                  <video
                    ref={videoRef}
                    src="/video.mp4"
                    className="h-full min-h-[13rem] w-full object-cover"
                    controls
                    playsInline
                    preload="metadata"
                    onTimeUpdate={syncTime}
                    onLoadedMetadata={syncDuration}
                  />
                </div>
                <p className="max-w-md text-base leading-relaxed sm:text-xl">
                  Tavus Agent pops up here as floating picture-in-picture.
                </p>
              </div>
            </div>

            <aside className="flex flex-col justify-start px-3 py-4 text-lg sm:px-4 sm:text-2xl">
              <div className="space-y-3 border-l-2 border-[#7bdff6] pl-3">
                <p>Context Intelligence</p>
                <p>Preference Memory</p>
                <p>Next Ad Strategy</p>
              </div>
            </aside>
          </div>

          <div className="px-3 py-4 sm:px-4 sm:py-5">
            <div className="flex flex-col gap-4 text-sm sm:text-lg">
              <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                <span>{`Timeline: ${formatTime(currentTime)}`}</span>
                <div className="relative flex-1 min-w-[12rem]">
                  <div className="pointer-events-none absolute left-0 top-1/2 h-[2px] w-full -translate-y-1/2 bg-[#f3e8a6]" />
                  {markers.map((marker) => (
                    <button
                      key={marker.label}
                      type="button"
                      aria-label={`Jump to ${marker.label}`}
                      className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#fff8d6] bg-white"
                      style={{ left: marker.left }}
                      onClick={() => jumpTo(marker.time)}
                    />
                  ))}
                  <input
                    type="range"
                    min={0}
                    max={duration}
                    step={0.1}
                    value={Math.min(currentTime, duration)}
                    onChange={handleTimelineChange}
                    className="relative h-4 w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-[2px] [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:mt-[-7px] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#1b1b1b] [&::-webkit-slider-thumb]:bg-[#ff6b6b] [&::-moz-range-track]:h-[2px] [&::-moz-range-track]:bg-transparent [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[#1b1b1b] [&::-moz-range-thumb]:bg-[#ff6b6b]"
                  />
                </div>
                <span>{formatTime(duration)}</span>
                <span className="ml-auto hidden text-[#ff7a7a] sm:inline">|</span>
              </div>

              <div className="relative h-8">
                {markers.map((marker) => (
                  <button
                    key={`${marker.label}-label`}
                    type="button"
                    className="absolute top-0 -translate-x-1/2 transition-colors duration-150 hover:text-white"
                    style={{ left: marker.left }}
                    onClick={() => jumpTo(marker.time)}
                  >
                    {marker.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-4 font-sans text-xs font-black uppercase tracking-[0.18em] text-white sm:text-sm">
          <Link href="/" className="hover:text-[#ffd93d]">
            Back
          </Link>
          <button
            type="button"
            className="border-2 border-[#f3e8a6] bg-[#ff6b6b] px-4 py-2 text-black transition-transform duration-150 hover:-translate-y-0.5"
          >
            Start Session
          </button>
        </div>
      </section>
    </main>
  );
}
