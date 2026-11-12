'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  EyeIcon,
  EyeSlashIcon,
  KeyIcon,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Brand } from '@/components/brand';
import { UserMenu } from '@/components/user-menu';
import { useSession } from '@/components/app-providers';
import { keys, useAISettings } from '@/lib/queries';
import { removeProviderKey, saveProviderKey, testProviderKey, updateAISettings } from '@/lib/api';
import { keyLinks, providerLabels, providerOrder, tierLabels } from '@/lib/ai-providers';
import { sessionEpoch } from '@/lib/session';
import type { GenerationOption, ProviderStatus } from '@/lib/types';

export function AISettingsPage() {
  const { user } = useSession();
  return user ? <AccountSettings key={user.id} userId={user.id} /> : null;
}

function AccountSettings({ userId }: { userId: string }) {
  const query = useAISettings();
  const client = useQueryClient();
  const [savingDefault, setSavingDefault] = useState(false);
  const data = query.data;
  async function refresh() {
    await Promise.all(
      ['ai-settings', 'models'].map((domain) =>
        client.invalidateQueries({ queryKey: [...keys.root(userId), domain] }),
      ),
    );
  }
  async function chooseDefault(value: string) {
    const option = data?.models.find((model) => `${model.provider}:${model.model}` === value);
    if (!option) return;
    const epoch = sessionEpoch();
    setSavingDefault(true);
    try {
      await updateAISettings({ provider: option.provider, model: option.model });
      if (epoch !== sessionEpoch()) return;
      await refresh();
      toast.success('Default model saved.');
    } catch (error) {
      if (epoch === sessionEpoch())
        toast.error(error instanceof Error ? error.message : 'Could not save the default model.');
    } finally {
      setSavingDefault(false);
    }
  }
  return (
    <div className="settings-page">
      <a className="skip-link" href="#settings-content">
        Skip to settings
      </a>
      <header className="settings-header">
        <Brand href="/workspace" />
        <UserMenu />
      </header>
      <main id="settings-content" className="settings-content">
        <Link href="/workspace" className="settings-back">
          <ArrowLeftIcon size={16} /> Back to your workspace
        </Link>
        <h1>Settings</h1>
        <p className="settings-intro">Choose the models behind your study space.</p>
        {query.isPending ? (
          <div className="document-skeleton" role="status" aria-label="Loading settings">
            <i />
            <i />
            <i />
          </div>
        ) : null}
        {query.isError ? (
          <div className="settings-notice" role="alert">
            <p>{query.error.message}</p>
            <button className="quiet-button" type="button" onClick={() => void query.refetch()}>
              Try again
            </button>
          </div>
        ) : null}
        {data ? (
          <>
            <section className="settings-section" aria-labelledby="default-model-title">
              <div className="settings-section-heading">
                <h2 id="default-model-title">Default model</h2>
                <p>Used for new Study Pills. You can choose a different model in the workspace.</p>
              </div>
              <label className="settings-default-label" htmlFor="default-generation">
                <span id="default-generation-label">Generation model</span>
                <select
                  id="default-generation"
                  aria-labelledby="default-generation-label"
                  className="settings-select"
                  value={`${data.defaultGeneration.provider}:${data.defaultGeneration.model}`}
                  disabled={savingDefault}
                  onChange={(event) => void chooseDefault(event.target.value)}
                  aria-describedby="default-model-help"
                >
                  {providerOrder.map((provider) => (
                    <optgroup key={provider} label={providerLabels[provider]}>
                      {data.models
                        .filter((model) => model.provider === provider)
                        .map((model) => (
                          <option
                            key={model.model}
                            value={`${provider}:${model.model}`}
                            disabled={!model.available}
                          >
                            {model.label} · {tierLabels[model.tier ?? 'balanced']}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <p id="default-model-help" className="settings-help">
                {savingDefault
                  ? 'Saving your default…'
                  : 'Generation, chat, and interactive 3D use the selected model. Without a personal key, requests use the configured Ollama model.'}
              </p>
            </section>
            <section className="settings-section" aria-labelledby="provider-keys-title">
              <div className="settings-section-heading">
                <h2 id="provider-keys-title">Your API keys</h2>
                <p>
                  Connect a provider to use its models. Usage is billed to your provider account.
                </p>
              </div>
              <p className="settings-help settings-key-note">
                <KeyIcon size={18} aria-hidden="true" /> Keys are encrypted on the server and are
                never shown again. Replace or remove them here at any time.
              </p>
              {!data.keysEnabled ? (
                <p className="settings-notice" role="status">
                  Personal keys are unavailable until your administrator configures key encryption
                  on the API and worker. You can continue using Ollama.
                </p>
              ) : null}
              <div className="settings-provider-list">
                {data.providers.map((provider) => (
                  <ProviderRow
                    key={provider.provider}
                    status={provider}
                    models={data.models.filter((model) => model.provider === provider.provider)}
                    enabled={data.keysEnabled}
                    refresh={refresh}
                  />
                ))}
              </div>
            </section>
            <section
              className="settings-section settings-notes"
              aria-labelledby="local-search-title"
            >
              <h2 id="local-search-title">Embeddings stay with Ollama</h2>
              <p>
                Ollama’s existing embedding model still indexes your sources and finds relevant
                passages. Keep Ollama running on the backend, even when a hosted model writes your
                notes.
              </p>
              <p>
                Flagship presets offer higher-capability options alongside balanced and faster
                models. A successful connection test checks model access and structured output; it
                does not measure study quality. Selected source text is sent to your generation
                provider.
              </p>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}

function ProviderRow({
  status,
  models,
  enabled,
  refresh,
}: {
  status: ProviderStatus;
  models: GenerationOption[];
  enabled: boolean;
  refresh: () => Promise<void>;
}) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState<'save' | 'test' | 'remove' | null>(null);
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [model, setModel] = useState(
    () => (models.find((item) => item.tier === 'balanced') ?? models[0])?.model ?? '',
  );
  const tested = status.testedModels.includes(model);
  async function run(action: 'save' | 'test' | 'remove') {
    const epoch = sessionEpoch();
    setBusy(action);
    setError('');
    try {
      // Call directly: mutation caches must never retain a plaintext API key.
      if (action === 'save') await saveProviderKey(status.provider, apiKey);
      if (action === 'test') await testProviderKey(status.provider, model);
      if (action === 'remove') await removeProviderKey(status.provider);
      if (epoch !== sessionEpoch()) return;
      if (action === 'save') setEditing(false);
      if (action === 'remove') setConfirmRemove(false);
      await refresh();
      toast.success(
        action === 'test'
          ? `${status.label} connection works.`
          : action === 'save'
            ? `${status.label} key saved.`
            : `${status.label} key removed.`,
      );
    } catch (failure) {
      if (epoch === sessionEpoch())
        setError(failure instanceof Error ? failure.message : 'Something went wrong. Try again.');
    } finally {
      setApiKey('');
      setVisible(false);
      setBusy(null);
    }
  }
  return (
    <div className="settings-provider" aria-labelledby={`${id}-title`}>
      <div className="settings-provider-heading">
        <div>
          <h3 id={`${id}-title`}>{status.label}</h3>
          <p className="settings-provider-status">
            {status.configured ? `Key saved · ••••${status.suffix ?? ''}` : 'No personal key'}
          </p>
        </div>
        <div className="settings-row-actions">
          <button
            className="quiet-button"
            type="button"
            disabled={!enabled || Boolean(busy)}
            onClick={() => {
              setEditing(!editing);
              setApiKey('');
              setVisible(false);
              setError('');
            }}
          >
            {editing ? 'Cancel' : status.configured ? 'Replace key' : 'Add key'}
          </button>
          {status.configured ? (
            <button
              className="quiet-button"
              type="button"
              disabled={Boolean(busy)}
              onClick={() => setConfirmRemove(!confirmRemove)}
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>
      {editing ? (
        <form
          className="settings-key-form"
          onSubmit={(event) => {
            event.preventDefault();
            void run('save');
          }}
        >
          <label htmlFor={`${id}-key`}>{status.label} API key</label>
          <div className="settings-key-input">
            <input
              id={`${id}-key`}
              name="providerKey"
              type={visible ? 'text' : 'password'}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              minLength={8}
              maxLength={4096}
              required
              disabled={Boolean(busy)}
              aria-describedby={`${id}-key-help`}
            />
            <button
              type="button"
              className="icon-button"
              aria-label={visible ? 'Hide API key' : 'Show API key'}
              aria-pressed={visible}
              onClick={() => setVisible(!visible)}
            >
              {visible ? <EyeSlashIcon size={19} /> : <EyeIcon size={19} />}
            </button>
          </div>
          <div className="settings-key-footer">
            <p id={`${id}-key-help`} className="settings-help">
              <a href={keyLinks[status.provider]} target="_blank" rel="noreferrer">
                Get a {status.label} key ↗
              </a>
              {status.provider === 'zai'
                ? ' · Use a standard API key, not a Coding Plan key.'
                : status.provider === 'huggingface'
                  ? ' · Allow calls to Inference Providers.'
                  : ''}
            </p>
            <button className="primary-button" type="submit" disabled={!enabled || Boolean(busy)}>
              {busy === 'save' ? 'Saving…' : 'Save key'}
            </button>
          </div>
        </form>
      ) : null}
      {status.configured && !editing ? (
        <div className="settings-test-row">
          <label htmlFor={`${id}-model`} className="sr-only">
            {status.label} test model
          </label>
          <select
            id={`${id}-model`}
            className="settings-select"
            value={model}
            disabled={Boolean(busy)}
            onChange={(event) => {
              setModel(event.target.value);
              setError('');
            }}
          >
            {models.map((item) => (
              <option key={item.model} value={item.model}>
                {item.label.replace(`${status.label} · `, '')} ·{' '}
                {tierLabels[item.tier ?? 'balanced']}
              </option>
            ))}
          </select>
          <button
            className="quiet-button"
            type="button"
            disabled={!enabled || Boolean(busy)}
            onClick={() => void run('test')}
          >
            {busy === 'test' ? 'Testing…' : 'Test connection'}
          </button>
          {tested ? (
            <span className="settings-tested">
              <CheckCircleIcon size={16} /> Connection tested
            </span>
          ) : null}
        </div>
      ) : null}
      {confirmRemove ? (
        <div className="settings-remove-confirm">
          <p>Remove this key? New requests will use Ollama until you add another.</p>
          <button
            className="quiet-button"
            type="button"
            disabled={Boolean(busy)}
            onClick={() => setConfirmRemove(false)}
          >
            Cancel
          </button>
          <button
            className="quiet-button"
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void run('remove')}
          >
            {busy === 'remove' ? 'Removing…' : 'Confirm removal'}
          </button>
        </div>
      ) : null}
      {error ? (
        <p className="settings-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
