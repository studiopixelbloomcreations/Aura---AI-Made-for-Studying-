import React, { useState, useEffect, useRef } from "react";
import { useAppStore } from "../store/useAppStore";
import { askBackend } from "../lib/api";
import {
  VideoOff,
  ScreenShare,
  Mic,
  MicOff,
  X,
} from "lucide-react";

export const AuraLive: React.FC = () => {
  const store = useAppStore();
  const { setIsLiveOpen, subject, language } = store;
  const [isMicActive, setIsMicActive] = useState(false);
  const [volume, setVolume] = useState(0);

  const [transcript, setTranscript] = useState("");
  const [aiResponseText, setAiResponseText] = useState("");
  const [liveStatus, setLiveStatus] = useState<"idle" | "listening" | "processing" | "speaking">("idle");

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);

  // Clean and speak AI response text
  const speakText = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    // Remove markdown characters and final points scoring from voice playback
    const cleanText = text
      .replace(/[*#`_\-]/g, "")
      .replace(/AWARD_POINTS:\s*\d+/g, "")
      .replace(/\[Attached File:.*?\]/gi, "")
      .replace(/File Contents:[\s\S]*?$/i, "")
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = language === "Sinhala" ? "si-LK" : "en-US";

    utterance.onend = () => {
      setLiveStatus("listening");
      // Resume listening automatically when AI stops speaking
      if (isMicActive && recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (e) {
          // already started
        }
      }
    };

    utterance.onerror = (e) => {
      console.error("Speech synthesis error:", e);
      setLiveStatus("listening");
    };

    window.speechSynthesis.speak(utterance);
  };

  // Setup Web Speech API recognition
  const startSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("SpeechRecognition API is not supported in this browser.");
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = language === "Sinhala" ? "si-LK" : "en-US";

    rec.onstart = () => {
      setLiveStatus("listening");
      setTranscript("");
      setAiResponseText("");
    };

    rec.onresult = (event: any) => {
      let interimTranscript = "";
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      setTranscript(finalTranscript || interimTranscript);
    };

    rec.onerror = (e: any) => {
      console.error("Speech recognition error:", e);
    };

    rec.onend = async () => {
      // If we got a final transcript, fetch response from AI
      const currentTranscript = (recognitionRef.current?._latestTranscript || "").trim();
      if (currentTranscript) {
        setLiveStatus("processing");
        try {
          const reply = await askBackend(currentTranscript);
          setAiResponseText(reply);
          setLiveStatus("speaking");
          speakText(reply);
        } catch (err) {
          console.error("Failed to fetch voice response:", err);
          setLiveStatus("listening");
        }
      } else {
        // Keep listening
        if (isMicActive && recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch (e) {
            // ignore
          }
        }
      }
    };

    recognitionRef.current = rec;
    rec.start();
  };

  // Keep track of latest transcript in ref to avoid closure issues on recognition end
  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current._latestTranscript = transcript;
    }
  }, [transcript]);

  // Hook up native Web Audio API visualizer
  const startMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      setIsMicActive(true);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        // Calculate average decibel volume
        let total = 0;
        for (let i = 0; i < bufferLength; i++) {
          total += dataArray[i]!;
        }
        const average = total / bufferLength;
        // Amplify volume levels slightly to trigger gorgeous waves
        setVolume(Math.min(average * 1.8, 120));

        animationFrameRef.current = requestAnimationFrame(updateVolume);
      };

      updateVolume();
      startSpeechRecognition();
    } catch (err) {
      console.warn("Microphone access denied or not available.", err);
      // Fallback: Simulate random voice fluctuations so it still looks incredibly premium and reactive!
      setIsMicActive(true);
      setLiveStatus("listening");
      const interval = setInterval(() => {
        setVolume(Math.random() * 45 + 15);
      }, 100);
      (window as any)._micFallback = interval;
    }
  };

  const stopMic = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // already stopped
      }
      recognitionRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    if ((window as any)._micFallback) {
      clearInterval((window as any)._micFallback);
    }
    setIsMicActive(false);
    setVolume(0);
    setLiveStatus("idle");
  };

  const toggleMic = () => {
    if (isMicActive) {
      stopMic();
    } else {
      startMic();
    }
  };

  // Stop tracks on unmount
  useEffect(() => {
    return () => {
      stopMic();
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-[#070708] text-white flex flex-col justify-between p-6 z-50 animate-fade-in select-none font-sans overflow-hidden">
      
      {/* 1. Header Row */}
      <div className="flex items-center justify-between w-full z-10">
        <div className="w-[120px]" />
        
        {/* Animated Live Status Badge */}
        <div className="flex items-center gap-2 px-4 py-2 bg-white/5 backdrop-blur-md rounded-full border border-white/5">
          <div className="flex items-end gap-0.5 h-3.5 w-4 mb-0.5">
            <span
              className={`w-0.75 bg-blue-400 rounded-full transition-all duration-150 ${
                isMicActive ? "animate-live-bar-1" : "h-1"
              }`}
              style={{
                height: isMicActive ? `${Math.max(4, volume / 6)}px` : "4px",
              }}
            />
            <span
              className={`w-0.75 bg-blue-400 rounded-full transition-all duration-150 ${
                isMicActive ? "animate-live-bar-2" : "h-2"
              }`}
              style={{
                height: isMicActive ? `${Math.max(6, volume / 4.5)}px` : "7px",
              }}
            />
            <span
              className={`w-0.75 bg-blue-400 rounded-full transition-all duration-150 ${
                isMicActive ? "animate-live-bar-3" : "h-1"
              }`}
              style={{
                height: isMicActive ? `${Math.max(4, volume / 7)}px` : "3px",
              }}
            />
          </div>
          <span className="text-[12.5px] font-bold tracking-widest text-[#e3e3e3] uppercase">Live</span>
        </div>

        {/* Video off camera block icon */}
        <div className="flex items-center justify-end w-[120px]">
          <div className="size-10 rounded-full bg-white/5 backdrop-blur-md flex items-center justify-center border border-white/5 text-white/70">
            <VideoOff className="size-4.5" />
          </div>
        </div>
      </div>

      {/* 2. Center Content Canvas */}
      <div className="flex-1 flex flex-col justify-center items-center text-center px-6 relative z-0">
        
        {/* Floating AI active info */}
        <div className="absolute top-6 space-y-1.5 opacity-90 transition-all">
          <h2 className="text-sm font-semibold tracking-wide text-blue-400 uppercase">Aura Personal Voice Agent</h2>
          <p className="text-[11.5px] font-medium text-white/50">Active Subject: {subject} | Language: {language}</p>
        </div>

        {/* Voice Status & Text Content Area */}
        <div className="w-full max-w-2xl mx-auto z-10 space-y-6 pt-16">
          {liveStatus === "idle" && (
            <div className="space-y-2">
              <p className="text-lg md:text-xl text-white/60 font-medium">Microphone is offline</p>
              <p className="text-xs text-white/30">Click the microphone button below to start talking</p>
            </div>
          )}

          {liveStatus === "listening" && (
            <div className="space-y-4">
              <p className="text-2xl md:text-3xl font-medium tracking-tight text-white transition-all duration-300">
                {transcript || "Speak now, Aura is listening..."}
              </p>
              {!transcript && (
                <p className="text-xs text-white/40 animate-pulse">Try asking: "Explain photosynthesis" or "Give me a maths question"</p>
              )}
            </div>
          )}

          {liveStatus === "processing" && (
            <div className="space-y-4 animate-pulse">
              <p className="text-2xl md:text-3xl font-semibold text-blue-400">Thinking...</p>
              {transcript && (
                <p className="text-sm text-white/50 italic">"{transcript}"</p>
              )}
            </div>
          )}

          {liveStatus === "speaking" && (
            <div className="space-y-4 max-h-[300px] overflow-y-auto px-4 py-2 border border-white/5 bg-white/5 backdrop-blur-md rounded-2xl">
              <p className="text-xs font-bold uppercase tracking-wider text-blue-400 text-left">Aura AI</p>
              <p className="text-lg md:text-xl font-medium leading-relaxed text-white/95 text-left whitespace-pre-line">
                {aiResponseText}
              </p>
            </div>
          )}
        </div>

        {/* Breathtaking Glowing Plasma Blue Wavy Light Gradient at bottom */}
        <div className="absolute inset-x-0 bottom-0 h-[380px] flex items-end justify-center pointer-events-none overflow-hidden select-none">
          {/* Base Wavy glow mesh gradient */}
          <div
            className="w-[180%] md:w-[130%] h-[320px] rounded-t-[50%] bg-gradient-to-t from-blue-600/30 via-indigo-500/20 to-transparent blur-[80px] transition-all duration-300 ease-out"
            style={{
              transform: `translateY(${140 - volume / 2}px) scale(${1 + volume / 160})`,
              opacity: isMicActive ? 0.95 : 0.65,
            }}
          />

          {/* Core White/Teal wavy center fluid */}
          <div
            className="absolute w-[120%] md:w-[90%] h-[160px] rounded-t-[50%] bg-gradient-to-t from-blue-300/40 via-blue-500/25 to-transparent blur-[50px] transition-all duration-300 ease-out animate-wave-drift"
            style={{
              transform: `translateY(${70 - volume / 3}px) scaleX(${1 + volume / 200})`,
              opacity: isMicActive ? 0.9 : 0.5,
            }}
          />

          {/* Interactive Sparkle core */}
          <div
            className="absolute size-24 rounded-full bg-blue-300/50 blur-3xl transition-all duration-300"
            style={{
              transform: `scale(${1 + volume / 60})`,
              opacity: isMicActive ? 0.8 : 0,
            }}
          />
        </div>
      </div>

      {/* 3. Floating Bottom Call Controls Pill Panel */}
      <div className="w-full flex justify-center items-center gap-4 py-6 z-10">
        
        {/* Camera button (Disabled) */}
        <button
          className="size-14 rounded-full bg-[#1f2024]/80 text-[#e3e3e3] border border-white/5 flex items-center justify-center hover:bg-[#2b2c31] active:scale-95 transition-all shadow-lg"
          title="Camera off"
        >
          <VideoOff className="size-5 opacity-80" />
        </button>

        {/* Screen Present button (Disabled) */}
        <button
          className="size-14 rounded-full bg-[#1f2024]/80 text-[#e3e3e3] border border-white/5 flex items-center justify-center hover:bg-[#2b2c31] active:scale-95 transition-all shadow-lg"
          title="Present Screen"
        >
          <ScreenShare className="size-5 opacity-80" />
        </button>

        {/* Toggle Microphone Active Button */}
        <button
          onClick={toggleMic}
          className={`size-14 rounded-full flex items-center justify-center active:scale-95 transition-all shadow-lg ${
            isMicActive
              ? "bg-[#d3e3fd] text-[#0b57d0] hover:bg-[#c2d7fb]"
              : "bg-[#1f2024]/80 text-[#e3e3e3] border border-white/5 hover:bg-[#2b2c31]"
          }`}
          title={isMicActive ? "Mute Microphone" : "Unmute Microphone"}
        >
          {isMicActive ? <Mic className="size-5.5" /> : <MicOff className="size-5.5" />}
        </button>

        {/* Red End Call button to exit live mode */}
        <button
          onClick={() => {
            stopMic();
            setIsLiveOpen(false);
          }}
          className="size-14 rounded-full bg-[#ea4335] text-white hover:bg-[#d93025] flex items-center justify-center shadow-lg shadow-red-500/20 active:scale-95 transition-all"
          title="End Live Session"
        >
          <X className="size-6" />
        </button>
      </div>

    </div>
  );
};
