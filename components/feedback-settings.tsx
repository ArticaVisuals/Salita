'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  readFeedbackPreferences,
  saveFeedbackPreferences,
} from '@/lib/feedback-cues';

export function FeedbackSettings() {
  const [preferences, setPreferences] = useState(readFeedbackPreferences);
  const canVibrate = typeof navigator.vibrate === 'function';

  const options = [
    {
      key: 'sounds',
      title: 'Sound effects',
      detail: 'Short cues for answers and milestones.',
    },
    {
      key: 'vibration',
      title: 'Vibration',
      detail: 'A tap for answers and milestones.',
    },
  ] as const;

  return (
    <section className="mb-6 rounded-[16px] border border-border bg-card p-5 sm:p-6">
      <h2 className="text-xl font-bold">Practice feedback</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Applies to this device.
      </p>
      <div className="mt-4 divide-y divide-border">
        {options
          .filter(({ key }) => key === 'sounds' || canVibrate)
          .map(({ key, title, detail }) => (
            <div
              key={key}
              className="flex items-center justify-between gap-4 py-2"
            >
              <div>
                <p className="text-sm font-bold">{title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                role="switch"
                aria-label={title}
                aria-checked={preferences[key]}
                className="min-h-11 min-w-16 font-bold aria-checked:border-primary aria-checked:bg-[var(--f-pink-3)] aria-checked:text-[var(--f-berry-ink)]"
                onClick={() => {
                  const updated = { ...preferences, [key]: !preferences[key] };
                  saveFeedbackPreferences(updated);
                  setPreferences(updated);
                }}
              >
                {preferences[key] ? 'On' : 'Off'}
              </Button>
            </div>
          ))}
      </div>
    </section>
  );
}
