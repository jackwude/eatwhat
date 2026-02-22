"use client";

import { Mic, MicOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

declare global {
  interface Window {
    webkitSpeechRecognition?: new () => SpeechRecognition;
    SpeechRecognition?: new () => SpeechRecognition;
  }

  interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
  }

  interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start: () => void;
    stop: () => void;
    onresult: ((ev: SpeechRecognitionEvent) => void) | null;
    onerror: ((ev: { error: string }) => void) | null;
    onend: (() => void) | null;
  }
}

type Props = {
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
};

export function SpeechButton({ onTranscript, onError }: Props) {
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const supported = useMemo(() => {
    if (typeof window === "undefined") return false;
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }, []);

  useEffect(() => {
    if (!supported) return;

    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "zh-CN";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const text = Array.from(event.results)
        .map((result) => result[0]?.transcript || "")
        .join(" ")
        .trim();

      if (text) {
        onTranscript(text);
      }
    };

    recognition.onerror = (event) => {
      setRecording(false);
      onError(`语音输入不可用：${event.error}。已降级为文本输入。`);
    };

    recognition.onend = () => setRecording(false);
    recognitionRef.current = recognition;

    return () => recognition.stop();
  }, [onError, onTranscript, supported]);

  function handleClick() {
    if (!supported) {
      onError("当前浏览器不支持 Web Speech API，请使用文本输入。");
      return;
    }

    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }

    try {
      recognitionRef.current?.start();
      setRecording(true);
    } catch {
      onError("语音识别启动失败，请检查麦克风权限。已降级为文本输入。");
    }
  }

  return (
    <Button type="button" className="min-w-28" onClick={handleClick}>
      {recording ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
      {recording ? "停止录音" : "语音输入"}
    </Button>
  );
}
