'use client';

import { useState } from 'react';
import { CheckIcon, PencilSimpleIcon, XIcon } from '@phosphor-icons/react';

export function PillMetadataEditor({
  title,
  description,
  tags,
  onSave,
}: {
  title: string;
  description?: string | null;
  tags: string[];
  onSave: (changes: { title: string; description: string | null; tags: string[] }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftDescription, setDraftDescription] = useState(description ?? '');
  const [draftTags, setDraftTags] = useState(tags.join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function startEditing() {
    setDraftTitle(title);
    setDraftDescription(description ?? '');
    setDraftTags(tags.join(', '));
    setError('');
    setEditing(true);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const nextTags = [
        ...new Set(
          draftTags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      ];
      await onSave({
        title: draftTitle.trim(),
        description: draftDescription.trim() || null,
        tags: nextTags,
      });
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your changes could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <form className="pill-metadata-form" onSubmit={submit}>
        <label className="field" htmlFor="pill-metadata-title">
          <span>Study Pill title</span>
          <input
            id="pill-metadata-title"
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            maxLength={100}
            required
          />
        </label>
        <label className="field" htmlFor="pill-metadata-description">
          <span>Description</span>
          <textarea
            id="pill-metadata-description"
            value={draftDescription}
            onChange={(event) => setDraftDescription(event.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Add a little context for this Study Pill"
          />
        </label>
        <label className="field" htmlFor="pill-metadata-tags">
          <span>
            Tags <small>(separate with commas)</small>
          </span>
          <input
            id="pill-metadata-tags"
            value={draftTags}
            onChange={(event) => setDraftTags(event.target.value)}
            maxLength={400}
            placeholder="biology, exam review"
          />
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="pill-metadata-actions">
          <button
            type="button"
            className="quiet-button"
            onClick={() => setEditing(false)}
            disabled={saving}
          >
            <XIcon size={16} /> Cancel
          </button>
          <button type="submit" className="quiet-button" disabled={saving}>
            <CheckIcon size={16} /> {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="pill-metadata-display">
      <div className="pill-title-line">
        <h1>{title}</h1>
        <button
          type="button"
          className="icon-button"
          onClick={startEditing}
          aria-label="Edit Study Pill title and description"
        >
          <PencilSimpleIcon size={16} />
        </button>
      </div>
      {description ? (
        <p className="document-intro text-[15px]">{description}</p>
      ) : (
        <button type="button" className="add-description-placeholder" onClick={startEditing}>
          Add a description
        </button>
      )}
      {tags.length ? (
        <div className="pill-meta-tags" aria-label="Study Pill tags">
          {tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
