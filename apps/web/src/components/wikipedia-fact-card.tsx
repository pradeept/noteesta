'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowSquareOutIcon, LightbulbIcon } from '@phosphor-icons/react';

type Fact = { title: string; summary: string; url: string; topic: string };
const topics = [
  {
    name: 'Science',
    weight: 60,
    titles: [
      'Photosynthesis',
      'Neutron star',
      'Mitosis',
      'Plate tectonics',
      'Aurora',
      'DNA replication',
      'Coral reef',
      'Tardigrade',
      'Earth atmosphere',
      'Ocean current',
      'Volcano',
      'Mycorrhiza',
      'Light-year',
      'Electromagnetic induction',
      'Antibiotic',
      'Thermodynamics',
      'Rainforest',
      'Immune system',
      'Solar eclipse',
      'Molecular biology',
    ],
  },
  {
    name: 'Mathematics',
    weight: 25,
    titles: [
      'Prime number',
      'Golden ratio',
      'Fibonacci sequence',
      'Pi',
      'Pythagorean theorem',
      'Fractal',
      'Probability',
      'Topology',
      'Pascal triangle',
      'Symmetry',
    ],
  },
  {
    name: 'History',
    weight: 10,
    titles: [
      'Antikythera mechanism',
      'Silk Road',
      'Library of Alexandria',
      'Mohenjo-daro',
      'Printing press',
    ],
  },
  { name: 'Computing', weight: 5, titles: ['Binary number', 'Encryption', 'Computer network'] },
];

async function getFact(seen: Set<string>): Promise<Fact | null> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const roll = Math.random() * 100;
    let limit = 0;
    const topic =
      topics.find((item) => {
        limit += item.weight;
        return roll < limit;
      }) ?? topics[0];
    const candidates = topic.titles.filter((title) => !seen.has(title));
    const title = candidates[Math.floor(Math.random() * candidates.length)];
    if (!title) {
      seen.clear();
      continue;
    }
    seen.add(title);
    try {
      const response = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replaceAll(' ', '_'))}`,
        { headers: { Accept: 'application/json' } },
      );
      if (!response.ok) continue;
      const data = (await response.json()) as {
        title?: string;
        extract?: string;
        type?: string;
        content_urls?: { desktop?: { page?: string } };
      };
      if (data.type !== 'standard' || !data.extract || !data.content_urls?.desktop?.page) continue;
      return {
        title: data.title ?? title,
        summary: data.extract,
        url: data.content_urls.desktop.page,
        topic: topic.name,
      };
    } catch {
      return null;
    }
  }
  return null;
}

export function WikipediaFactCard() {
  const [fact, setFact] = useState<Fact | null>(null);
  const [paused, setPaused] = useState(false);
  const reduce = useReducedMotion();
  const pausedRef = useRef(false);
  const hoverRef = useRef(false);
  const focusRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;
    const seen = new Set<string>();
    let queue: Fact[] = [];

    async function fillQueue() {
      const results = await Promise.all([getFact(seen), getFact(seen), getFact(seen)]);
      if (!cancelled) queue = results.filter((item): item is Fact => item !== null);
    }

    async function start() {
      await fillQueue();
      if (cancelled) return;
      setFact(queue.shift() ?? null);
      interval = setInterval(() => {
        if (pausedRef.current) return;
        const next = queue.shift();
        if (next) setFact(next);
        void getFact(seen).then((item) => {
          if (item && !cancelled) queue.push(item);
        });
      }, 8000);
    }

    void start();
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, []);

  function setPauseState(value: boolean) {
    pausedRef.current = value;
    setPaused(value);
  }

  if (!fact)
    return (
      <div className="fact-card fact-loading" aria-hidden="true">
        <LightbulbIcon size={18} /> A small fact is on its way…
      </div>
    );

  return (
    <a
      className={`fact-card ${paused ? 'paused' : ''}`}
      href={fact.url}
      target="_blank"
      rel="noreferrer"
      onMouseEnter={() => {
        hoverRef.current = true;
        setPauseState(true);
      }}
      onMouseLeave={() => {
        hoverRef.current = false;
        setPauseState(focusRef.current);
      }}
      onFocus={() => {
        focusRef.current = true;
        setPauseState(true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          focusRef.current = false;
          setPauseState(hoverRef.current);
        }
      }}
      aria-label={`${fact.title}, from Wikipedia. Opens in a new tab.`}
    >
      <span className="fact-card-topline">
        <LightbulbIcon size={17} weight="duotone" /> A little curiosity <small>{fact.topic}</small>
      </span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={fact.title}
          className="fact-card-content"
          initial={reduce ? false : { rotateX: -70, opacity: 0, y: 5 }}
          animate={{ rotateX: 0, opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { rotateX: 70, opacity: 0, y: -5 }}
          transition={{ duration: reduce ? 0 : 0.36, ease: [0.2, 0.75, 0.25, 1] }}
        >
          <strong>{fact.title}</strong>
          <span>{fact.summary}</span>
          <small>
            Wikipedia <ArrowSquareOutIcon size={13} />
          </small>
        </motion.span>
      </AnimatePresence>
    </a>
  );
}
