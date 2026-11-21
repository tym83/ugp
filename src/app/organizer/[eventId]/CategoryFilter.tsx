"use client";

import { useEffect, useRef } from "react";

const normalize = (value: string) => value.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, "");
const controlClass = "rounded border px-2 py-1 text-sm";

function applyFilter(form: HTMLFormElement, containerId: string, counter: HTMLElement | null) {
  const values = new FormData(form);
  const value = (name: string) => String(values.get(name) ?? "");
  const age = value("age");
  const sex = value("sex");
  const discipline = value("discipline");
  const mat = value("mat");
  const weightText = value("weight");
  const weight = Number(weightText);
  const words = value("search").trim().split(/\s+/).filter(Boolean).map(normalize);
  const blocks = document.querySelectorAll<HTMLElement>(`#${CSS.escape(containerId)} [data-cat]`);
  let shown = 0;

  blocks.forEach((block) => {
    const data = block.dataset;
    const matches = (!age || data.age === age)
      && (!sex || data.sex === sex)
      && (!discipline || data.disc === discipline)
      && (!mat || (mat === "none" ? data.mat === "" : data.mat === mat))
      && (!weightText || (Number.isFinite(weight) && data.abs !== "1"
        && (!data.wmin || weight > Number(data.wmin))
        && (!data.wmax || data.open === "1" || weight <= Number(data.wmax))))
      && words.every((word) => normalize(data.cat ?? "").includes(word))
      && (!values.has("participants") || Number(data.count) > 0)
      && (!values.has("bracket") || data.bracket === "1");
    block.hidden = !matches;
    if (matches) shown++;
  });

  if (counter) counter.textContent = `показано ${shown} из ${blocks.length}`;
  try {
    sessionStorage.setItem(`organizer-category-filter:${containerId}`, JSON.stringify(Object.fromEntries(values)));
  } catch {
    // Filtering still works when browser storage is unavailable.
  }
}

export default function CategoryFilter({ containerId, ageGroups, matsCount }: {
  containerId: string;
  ageGroups: string[];
  matsCount: number;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(`organizer-category-filter:${containerId}`) ?? "null");
      if (saved && typeof saved === "object") {
        for (const [name, value] of Object.entries(saved)) {
          if (typeof value !== "string") continue;
          const control = form.elements.namedItem(name);
          if (control instanceof HTMLInputElement && control.type === "checkbox") {
            control.checked = value === "on";
          } else if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement) {
            control.value = value;
          }
        }
      }
    } catch {
      // Ignore unavailable storage and malformed saved filters.
    }
    const apply = () => applyFilter(form, containerId, counterRef.current);
    apply();

    // Reapply after server actions refresh category attributes or replace blocks.
    const container = document.getElementById(containerId);
    const observer = new MutationObserver(apply);
    if (container) observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-cat", "data-age", "data-sex", "data-disc", "data-wmin", "data-wmax", "data-open", "data-abs", "data-mat", "data-count", "data-bracket"],
    });
    return () => observer.disconnect();
  }, [containerId, ageGroups, matsCount]);

  return (
    <form
      ref={formRef}
      className="flex flex-wrap items-center gap-3 text-sm"
      onSubmit={(event) => event.preventDefault()}
      onChange={(event) => applyFilter(event.currentTarget, containerId, counterRef.current)}
    >
      <label className="flex items-center gap-1">Возраст
        <select name="age" className={controlClass}>
          <option value="">все</option>
          {ageGroups.map((age) => <option key={age} value={age}>{age}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-1">Пол
        <select name="sex" className={controlClass}>
          <option value="">все</option><option value="M">муж</option><option value="F">жен</option>
        </select>
      </label>
      <label className="flex items-center gap-1">Дисциплина
        <select name="discipline" className={controlClass}>
          <option value="">все</option><option value="gi">ги</option><option value="nogi">ноу-ги</option>
        </select>
      </label>
      <label className="flex items-center gap-1">Ковёр
        <select name="mat" className={controlClass}>
          <option value="">все</option>
          {Array.from({ length: matsCount }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
          <option value="none">без ковра</option>
        </select>
      </label>
      <label className="flex items-center gap-1">Вес, кг
        <input name="weight" type="number" step="any" className={`${controlClass} w-24`} />
      </label>
      <input name="search" type="search" aria-label="Поиск по названию категории" placeholder="Поиск: до34, 2015" className={`${controlClass} w-48`} />
      <label className="flex items-center gap-1"><input name="participants" type="checkbox" />только с участниками</label>
      <label className="flex items-center gap-1"><input name="bracket" type="checkbox" />только с сеткой</label>
      <button type="button" className="text-blue-600 underline" onClick={() => {
        const form = formRef.current;
        if (!form) return;
        form.reset();
        applyFilter(form, containerId, counterRef.current);
      }}>сбросить</button>
      <span ref={counterRef} role="status" className="text-xs text-gray-500" />
    </form>
  );
}
