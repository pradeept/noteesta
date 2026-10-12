'use client';

import { useState } from 'react';
import { Dialog, DropdownMenu, RadioGroup, Slider } from 'radix-ui';
import {
  CheckIcon,
  GearSixIcon,
  MoonIcon,
  PaletteIcon,
  SunIcon,
  XIcon,
} from '@phosphor-icons/react';

const palettes = [
  { id: 'grove', label: 'Grove' },
  { id: 'fern', label: 'Fern' },
  { id: 'clay', label: 'Clay' },
  { id: 'ocean', label: 'Ocean' },
] as const;

export function ThemePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (palette: string) => void;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="quiet-button palette-trigger"
          aria-label="Choose dashboard color theme"
        >
          <PaletteIcon size={18} /> <span>Theme</span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu-content palette-menu" sideOffset={7} align="end">
          <DropdownMenu.Label className="menu-label">Dashboard colors</DropdownMenu.Label>
          {palettes.map((palette) => (
            <DropdownMenu.Item
              key={palette.id}
              className="menu-item"
              onSelect={() => onChange(palette.id)}
            >
              <i className={`palette-swatch palette-${palette.id}`} aria-hidden="true" />
              {palette.label}
              {value === palette.id ? <CheckIcon size={16} className="menu-check" /> : null}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function ReadingSettingsDialog({
  open,
  readingSize,
  readerBackground,
  onSize,
  onBackground,
  onClose,
}: {
  open: boolean;
  readingSize: number;
  readerBackground: string;
  onSize: (size: number) => void;
  onBackground: (background: string) => void;
  onClose: () => void;
}) {
  const [dark, setDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark',
  );

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    localStorage.setItem('noteesta-theme', next ? 'dark' : 'light');
  }

  return (
    <Dialog.Root open={open} onOpenChange={(value) => !value && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="radix-dialog-content reading-settings-dialog">
          <div className="file-library-heading">
            <div>
              <p className="dialog-kicker">
                <GearSixIcon size={16} /> Reading preferences
              </p>
              <Dialog.Title className="radix-dialog-title">Make it comfortable</Dialog.Title>
              <Dialog.Description className="radix-dialog-description">
                Tune the reading surface without changing your dashboard palette.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="icon-button" aria-label="Close reading preferences">
                <XIcon />
              </button>
            </Dialog.Close>
          </div>
          <div className="reading-settings-body">
            <div className="settings-field">
              <span>
                Text size <output>{readingSize}px</output>
              </span>
              <Slider.Root
                className="settings-slider"
                min={15}
                max={21}
                step={1}
                value={[readingSize]}
                onValueChange={(value) => value[0] !== undefined && onSize(value[0])}
                aria-label="Text size"
              >
                <Slider.Track className="settings-slider-track">
                  <Slider.Range className="settings-slider-range" />
                </Slider.Track>
                <Slider.Thumb className="settings-slider-thumb" />
              </Slider.Root>
            </div>
            <fieldset className="reader-background-options">
              <legend>Page background</legend>
              <RadioGroup.Root
                value={readerBackground}
                onValueChange={onBackground}
                aria-label="Reading page background"
              >
                {[
                  { id: 'canvas', label: 'Canvas' },
                  { id: 'paper', label: 'Warm paper' },
                  { id: 'mist', label: 'Soft mist' },
                ].map((option) => (
                  <RadioGroup.Item
                    key={option.id}
                    value={option.id}
                    className={`reader-background-choice background-${option.id}`}
                  >
                    <RadioGroup.Indicator>
                      <CheckIcon size={16} weight="bold" />
                    </RadioGroup.Indicator>
                    <span>{option.label}</span>
                  </RadioGroup.Item>
                ))}
              </RadioGroup.Root>
            </fieldset>
            <button type="button" className="theme-choice" onClick={toggleTheme}>
              {dark ? <MoonIcon size={20} /> : <SunIcon size={20} />}
              <span>
                <strong>{dark ? 'Dark appearance' : 'Light appearance'}</strong>
                <small>Switch the dashboard between light and dark</small>
              </span>
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
