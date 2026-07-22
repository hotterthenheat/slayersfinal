import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/*
  iOS-style cover-flow carousel (provided by the user, adapted to the house
  grammar). Accepts either image cards (`src`) or branded cards (`accent` +
  `title` + `sub`) so it can showcase the terminal's desks without off-brand
  stock photos. Holo silver replaces the original blue accent.
*/

export interface CoverItem {
  src?: string;
  title: string;
  sub?: string;
  accent?: string;
}

interface CardCoverFlowProps {
  className?: string;
  images?: CoverItem[];
}

// Desk accents mirror the canonical per-desk tokens used across the app
// (flip / king / darkpool / select / warn) so the carousel reads as the same
// product, not a re-skinned one.
const DEFAULT_ITEMS: CoverItem[] = [
  { title: 'Pulse', sub: 'Live workspace', accent: '#7DD3FC' }, // flip
  { title: 'Compass', sub: 'Choose the trade', accent: '#EA00FF' }, // king
  { title: 'Trace', sub: 'Flow & dark pool', accent: '#2dd4bf' }, // darkpool
  { title: 'Pinpoint', sub: 'Dealer positioning', accent: '#E4E8F4' }, // select
  { title: 'Prove It', sub: 'The receipts', accent: '#FF9500' }, // warn
];

export default function CardCoverFlow({ className = '', images = DEFAULT_ITEMS }: CardCoverFlowProps) {
  const [activeIndex, setActiveIndex] = useState(Math.floor(images.length / 2));

  const toPrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveIndex(prev => Math.max(0, prev - 1));
  };
  const toNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveIndex(prev => Math.min(images.length - 1, prev + 1));
  };
  const toSlide = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    setActiveIndex(index);
  };

  return (
    <div
      className={`w-full h-full flex flex-col items-center justify-center relative overflow-hidden select-none bg-zinc-950/40 rounded-2xl ${className}`}
      style={{ perspective: '1000px' }}
    >
      <div className="w-full flex justify-center items-center relative h-[160px] [transform-style:preserve-3d]">
        {images.map((item, i) => {
          const isActive = activeIndex === i;
          const offset = i - activeIndex;
          const absOffset = Math.abs(offset);
          const isPast = i < activeIndex;

          return (
            <motion.div
              key={i}
              className="absolute w-[92px] aspect-[3/4] cursor-pointer"
              initial={false}
              animate={{
                x: offset * 34,
                rotateY: isActive ? 0 : isPast ? 38 : -38,
                z: isActive ? 50 : -absOffset * 50,
                scale: isActive ? 1.1 : 1 - absOffset * 0.08,
                opacity: absOffset > 2 ? 0 : 1 - absOffset * 0.25,
              }}
              transition={{ type: 'spring', stiffness: 200, damping: 25 }}
              style={{ zIndex: 100 - absOffset }}
              onClick={e => toSlide(e, i)}
            >
              {item.src ? (
                <img
                  src={item.src}
                  alt={item.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover rounded-xl shadow-2xl border border-white/10"
                />
              ) : (
                <div
                  className="w-full h-full rounded-xl shadow-2xl border border-white/10 overflow-hidden flex flex-col items-center justify-center gap-1 relative"
                  style={{ background: `linear-gradient(155deg, ${(item.accent ?? '#E4E8F4') + '2b'}, #0a0a0a 72%)` }}
                >
                  <span className="font-mono text-[11px] font-bold uppercase tracking-widest" style={{ color: item.accent ?? '#E4E8F4' }}>
                    {item.title}
                  </span>
                  {item.sub && <span className="text-[8px] text-white/55 uppercase tracking-wider text-center px-2">{item.sub}</span>}
                </div>
              )}
              <motion.div
                className="absolute -bottom-6 left-[-20px] right-[-20px] text-center text-[10px] font-semibold text-white/80 whitespace-nowrap overflow-hidden text-ellipsis"
                animate={{ opacity: isActive ? 1 : 0, y: isActive ? 0 : -5 }}
              >
                {item.title}
              </motion.div>
            </motion.div>
          );
        })}
      </div>

      <div className="mt-6 w-fit px-1.5 py-0.5 flex items-center gap-2 justify-center text-zinc-300 rounded-full bg-white/5 backdrop-blur-md border border-white/10 shadow-sm z-20">
        <button onClick={toPrev} className="p-1 cursor-pointer hover:bg-white/10 rounded-full transition-colors border-0 bg-transparent text-neutral-300 hover:text-white">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <div className="flex justify-center items-center gap-1">
          {images.map((_, i) => (
            <div
              key={i}
              onClick={e => toSlide(e, i)}
              className={`rounded-full cursor-pointer h-1 transition-all duration-300 ${activeIndex === i ? 'w-4 bg-white' : 'w-1 bg-white/30 hover:bg-white/50'}`}
            />
          ))}
        </div>
        <button onClick={toNext} className="p-1 cursor-pointer hover:bg-white/10 rounded-full transition-colors border-0 bg-transparent text-neutral-300 hover:text-white">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
