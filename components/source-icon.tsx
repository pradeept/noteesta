import {
  FileAudioIcon,
  FileDocIcon,
  FileImageIcon,
  FilePdfIcon,
  FileVideoIcon,
  YoutubeLogoIcon,
} from '@phosphor-icons/react';
import type { SourceKind } from '@/lib/types';

const icons = {
  audio: FileAudioIcon,
  video: FileVideoIcon,
  pdf: FilePdfIcon,
  document: FileDocIcon,
  image: FileImageIcon,
  youtube: YoutubeLogoIcon,
};

export function SourceIcon({ kind, size = 18 }: { kind: SourceKind; size?: number }) {
  const Icon = icons[kind];
  return <Icon size={size} weight="duotone" aria-hidden="true" />;
}
