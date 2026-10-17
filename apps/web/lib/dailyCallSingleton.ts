import Daily, { type DailyCall, type DailyParticipant } from "@daily-co/daily-js";
import { tavusLog, tavusWarn } from "./tavusDebug";

declare global {
  interface Window {
    __tavusDailyCallObject?: DailyCall | null;
  }
}

/** Tear down the singleton Daily call object (Tavus embed docs pattern). */
const cleanupTasks = new WeakMap<DailyCall, Promise<void>>();
export function destroyDailyCall(call = window.__tavusDailyCallObject): Promise<void> {
  if (!call) {
    return Promise.resolve();
  }
  const pending = cleanupTasks.get(call);
  if (pending) return pending;
  tavusLog("destroying Daily call object");
  if (window.__tavusDailyCallObject === call) window.__tavusDailyCallObject = null;
  const task = (async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([call.leave(), new Promise<void>((resolve) => { timer = setTimeout(resolve, 2000); })]);
    } catch {
      tavusWarn("Daily leave failed; destroying captured call");
    } finally {
      clearTimeout(timer);
      try { await call.destroy(); } catch { tavusWarn("Daily call already destroyed"); }
    }
  })();
  cleanupTasks.set(call, task);
  return task;
}

export function getDailyCall(): DailyCall {
  if (!window.__tavusDailyCallObject) {
    tavusLog("creating new Daily call object");
    // A previous instance may still be finishing asynchronous cleanup.
    window.__tavusDailyCallObject = Daily.createCallObject({ allowMultipleCallInstances: true });
  }

  return window.__tavusDailyCallObject;
}

export function getReplicaParticipant(
  participants: Record<string, DailyParticipant>,
): DailyParticipant | null {
  for (const [id, participant] of Object.entries(participants)) {
    if (id !== "local") {
      return participant;
    }
  }

  return null;
}

export function describeParticipantTracks(participant: DailyParticipant): {
  videoState: string;
  audioState: string;
  userName: string;
  sessionId: string;
} {
  return {
    videoState: participant.tracks.video?.state ?? "none",
    audioState: participant.tracks.audio?.state ?? "none",
    userName: participant.user_name ?? "unknown",
    sessionId: participant.session_id,
  };
}

export function attachParticipantMedia(
  participant: DailyParticipant,
  videoEl: HTMLVideoElement | null,
  audioEl: HTMLAudioElement | null,
): boolean {
  const info = describeParticipantTracks(participant);
  tavusLog("replica track state", info);

  let attached = false;
  const videoTrack = participant.tracks.video?.persistentTrack;
  if (videoEl && videoTrack && participant.tracks.video?.state === "playable") {
    videoEl.srcObject = new MediaStream([videoTrack]);
    void videoEl.play().then(
      () => tavusLog("replica video playing"),
      (err) => tavusWarn("replica video play() blocked or failed", err),
    );
    attached = true;
  } else if (videoEl) {
    tavusWarn("replica video not playable yet", {
      state: participant.tracks.video?.state,
      hasTrack: Boolean(videoTrack),
    });
  }

  const audioTrack = participant.tracks.audio?.persistentTrack;
  if (audioEl && audioTrack && participant.tracks.audio?.state === "playable") {
    audioEl.srcObject = new MediaStream([audioTrack]);
    void audioEl.play().then(
      () => tavusLog("replica audio playing — you should hear the agent now"),
      (err) =>
        tavusWarn(
          "replica audio play() blocked (browser autoplay?) — try clicking the page or saying hi",
          err,
        ),
    );
    attached = true;
  } else if (audioEl) {
    tavusWarn("replica audio not playable yet", {
      state: participant.tracks.audio?.state,
      hasTrack: Boolean(audioTrack),
    });
  }

  return attached;
}
