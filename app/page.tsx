"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { IngredientInput } from "@/components/input/ingredient-input";
import { SpeechButton } from "@/components/input/speech-button";
import { Button } from "@/components/ui/button";

function parseIngredients(input: string): string[] {
  return input
    .split(/[，,、\n\s]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function HomePage() {
  const router = useRouter();
  const [inputText, setInputText] = useState("");
  const [speechError, setSpeechError] = useState("");

  const ownedIngredients = useMemo(() => parseIngredients(inputText), [inputText]);

  function handleSubmit() {
    if (!inputText.trim()) return;
    const params = new URLSearchParams({
      q: inputText,
      owned: ownedIngredients.join(","),
    });
    router.push(`/recommend?${params.toString()}`);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-8 sm:px-6">
      <section className="glass-card rounded-3xl p-6 sm:p-8">
        <p className="mb-2 text-sm font-semibold tracking-[0.08em] text-amber-700">AI 智能菜谱辅助</p>
        <h1 className="text-3xl font-bold sm:text-4xl">今天吃什么，按现有食材直接算</h1>
        <p className="mt-3 text-sm leading-6 text-[color:var(--muted)] sm:text-base">
          输入食材或点击麦克风说一句，例如“我现在有西红柿和鸡蛋”，系统会生成 3 个推荐菜。
        </p>

        <div className="mt-6 space-y-3">
          <IngredientInput value={inputText} onChange={setInputText} />
          <div className="flex items-center gap-3">
            <SpeechButton
              onTranscript={(text) => {
                setInputText((prev) => `${prev} ${text}`.trim());
                setSpeechError("");
              }}
              onError={(message) => setSpeechError(message)}
            />
            <Button onClick={handleSubmit} disabled={!ownedIngredients.length}>
              智能推荐
            </Button>
          </div>
          {speechError ? <p className="text-sm text-red-700">{speechError}</p> : null}
        </div>

        <div className="mt-6 text-sm text-[color:var(--muted)]">
          <p>识别到食材：{ownedIngredients.length ? ownedIngredients.join("、") : "尚未输入"}</p>
        </div>
      </section>
    </main>
  );
}
