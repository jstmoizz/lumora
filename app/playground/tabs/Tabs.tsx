"use client";

import { useId, useRef, useState } from "react";

type Tab = {
  id: string;
  label: string;
  content: React.ReactNode;
};

type TabsProps = {
  label: string;
  tabs: Tab[];
};

export default function Tabs({ label, tabs }: TabsProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const activateTab = (index: number) => {
    setActiveIndex(index);
    tabRefs.current[index]?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        activateTab((activeIndex + 1) % tabs.length);
        break;
      case "ArrowLeft":
        event.preventDefault();
        activateTab((activeIndex - 1 + tabs.length) % tabs.length);
        break;
      case "Home":
        event.preventDefault();
        activateTab(0);
        break;
      case "End":
        event.preventDefault();
        activateTab(tabs.length - 1);
        break;
    }
  };

  return (
    <div className="w-full max-w-md">
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={handleKeyDown}
        className="flex gap-2 border-b border-zinc-300 dark:border-zinc-700"
      >
        {tabs.map((tab, index) => {
          const isActive = index === activeIndex;
          const tabId = `${baseId}-tab-${tab.id}`;
          const panelId = `${baseId}-panel-${tab.id}`;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={tabId}
              aria-selected={isActive}
              aria-controls={panelId}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveIndex(index)}
              className={
                isActive
                  ? "border-b-2 border-foreground px-4 py-2 text-sm font-semibold text-foreground"
                  : "border-b-2 border-transparent px-4 py-2 text-sm text-zinc-500 transition-colors hover:text-foreground dark:text-zinc-400"
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab, index) => {
        const isActive = index === activeIndex;
        const tabId = `${baseId}-tab-${tab.id}`;
        const panelId = `${baseId}-panel-${tab.id}`;
        return (
          <div
            key={tab.id}
            role="tabpanel"
            id={panelId}
            aria-labelledby={tabId}
            hidden={!isActive}
            tabIndex={0}
            className="px-1 py-4 text-left text-sm text-zinc-600 dark:text-zinc-400"
          >
            {tab.content}
          </div>
        );
      })}
    </div>
  );
}
