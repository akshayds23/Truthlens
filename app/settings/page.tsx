'use client';

import { useState, useEffect } from 'react';

interface UserSettings {
  defaultLLMProvider: 'openai' | 'gemini' | 'anthropic' | 'groq' | 'local';
  defaultSearchDepth: 'quick' | 'standard' | 'deep';
  defaultCategory: 'health' | 'politics' | 'science' | 'finance' | 'other';
  storeApiKeysLocally: boolean;
  notificationsEnabled: boolean;
  searchProviders: {
    duckduckgo: boolean;
    serper: boolean;
    brave: boolean;
  };
  apiKeys?: {
    openai?: string;
    gemini?: string;
    anthropic?: string;
    groq?: string;
    serper?: string;
  };
}

const DEFAULT_SETTINGS: UserSettings = {
  defaultLLMProvider: 'groq',
  defaultSearchDepth: 'standard',
  defaultCategory: 'other',
  storeApiKeysLocally: true,
  notificationsEnabled: true,
  searchProviders: {
    duckduckgo: true,
    serper: false,
    brave: false,
  },
};

// Step-by-step guides for each provider
const API_KEY_GUIDES: Record<string, { name: string; url: string; steps: string[] }> = {
  groq: {
    name: 'Groq',
    url: 'https://console.groq.com/keys',
    steps: [
      'Go to console.groq.com and sign up or log in with Google/GitHub.',
      'Click "API Keys" from the left sidebar.',
      'Click "Create API Key" and give it a name (e.g. "TruthLens").',
      'Copy the key (starts with gsk_) and paste it below.',
    ],
  },
  serper: {
    name: 'Serper (Google Search)',
    url: 'https://serper.dev/api-key',
    steps: [
      'Go to serper.dev and sign up for a free account.',
      'After sign-up, your API key is shown on the dashboard.',
      'Copy the key and paste it below.',
      'Free tier includes 2,500 searches/month.',
    ],
  },
  openai: {
    name: 'OpenAI',
    url: 'https://platform.openai.com/api-keys',
    steps: [
      'Go to platform.openai.com and sign in or create an account.',
      'Navigate to API Keys in the left sidebar.',
      'Click "+ Create new secret key" and name it.',
      'Copy the key (starts with sk-) immediately — it won\'t be shown again.',
      'Note: Requires a paid account with credits loaded.',
    ],
  },
  gemini: {
    name: 'Google Gemini',
    url: 'https://aistudio.google.com/app/apikey',
    steps: [
      'Go to aistudio.google.com and sign in with your Google account.',
      'Click "Get API Key" in the left sidebar.',
      'Click "Create API Key" and select a Google Cloud project.',
      'Copy the generated key and paste it below.',
      'Free tier includes generous usage limits.',
    ],
  },
  anthropic: {
    name: 'Anthropic (Claude)',
    url: 'https://console.anthropic.com/settings/keys',
    steps: [
      'Go to console.anthropic.com and sign up or log in.',
      'Navigate to Settings → API Keys.',
      'Click "Create Key" and give it a descriptive name.',
      'Copy the key (starts with sk-ant-) and paste it below.',
      'Note: Requires a paid account.',
    ],
  },
};

export default function Settings() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'config' | 'help'>('config');

  useEffect(() => {
    const stored = localStorage.getItem('userSettings');
    if (stored) {
      try {
        setSettings(JSON.parse(stored));
      } catch (err) {
        console.error('Failed to parse stored settings', err);
      }
    }
  }, []);

  const handleChange = (key: keyof UserSettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setUnsavedChanges(true);
  };

  const handleApiKeyChange = (provider: string, value: string) => {
    setSettings(prev => ({
      ...prev,
      apiKeys: {
        ...prev.apiKeys,
        [provider]: value || undefined,
      }
    }));
    setUnsavedChanges(true);
  };

  const handleSearchProviderChange = (provider: keyof UserSettings['searchProviders'], enabled: boolean) => {
    setSettings(prev => ({
      ...prev,
      searchProviders: {
        ...prev.searchProviders,
        [provider]: enabled,
      }
    }));
    setUnsavedChanges(true);
  };

  const saveSettings = () => {
    localStorage.setItem('userSettings', JSON.stringify(settings));
    setUnsavedChanges(false);
    setSavedMessage('Settings saved successfully!');
    setTimeout(() => setSavedMessage(null), 3000);
  };

  const resetToDefaults = () => {
    if (window.confirm('Reset all settings to defaults?')) {
      setSettings(DEFAULT_SETTINGS);
      setUnsavedChanges(true);
    }
  };

  return (
    <div className="section">
      <div className="mb-6">
        <h1 className="text-4xl font-bold mb-2">Settings</h1>
        <p className="text-gray-600 dark:text-gray-400">Configure your platform preferences and API keys</p>
      </div>

      {savedMessage && (
        <div className="card bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 mb-6">
          <p className="text-green-700 dark:text-green-200">✓ {savedMessage}</p>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800/50 rounded-xl p-1 max-w-xs">
        <button
          onClick={() => setActiveTab('config')}
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'config'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Configuration
        </button>
        <button
          onClick={() => setActiveTab('help')}
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'help'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Help & Guide
        </button>
      </div>

      {/* ── CONFIGURATION TAB ── */}
      {activeTab === 'config' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">

            {/* LLM Provider Settings */}
            <div className="card">
              <h2 className="text-2xl font-semibold mb-4">LLM Preferences</h2>
              <div className="space-y-4">
                <div>
                  <label className="form-label">Default LLM Provider</label>
                  <select
                    value={settings.defaultLLMProvider}
                    onChange={(e) => handleChange('defaultLLMProvider', e.target.value)}
                    className="input"
                  >
                    <option value="groq">Groq (Fastest & Free)</option>
                    <option value="openai">OpenAI (GPT-4)</option>
                    <option value="gemini">Google Gemini</option>
                    <option value="anthropic">Anthropic Claude</option>
                    <option value="local">Local Model (Ollama)</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-2">
                    Select the language model used to analyze evidence and generate verdicts.
                  </p>
                </div>

                <div>
                  <label className="form-label">Default Research Depth</label>
                  <select
                    value={settings.defaultSearchDepth}
                    onChange={(e) => handleChange('defaultSearchDepth', e.target.value)}
                    className="input"
                  >
                    <option value="quick">Quick (Light Scan)</option>
                    <option value="standard">Standard (Balanced Research)</option>
                    <option value="deep">Deep (Thorough & Comprehensive)</option>
                  </select>
                </div>

                <div>
                  <label className="form-label">Default Claim Category</label>
                  <select
                    value={settings.defaultCategory}
                    onChange={(e) => handleChange('defaultCategory', e.target.value)}
                    className="input"
                  >
                    <option value="health">Health</option>
                    <option value="politics">Politics</option>
                    <option value="science">Science</option>
                    <option value="finance">Finance</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Search Providers */}
            <div className="card">
              <h2 className="text-2xl font-semibold mb-4">Search Providers</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Choose which search engines to use for finding evidence. Select multiple for diverse sources.
              </p>
              <div className="space-y-3">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input type="checkbox" checked={settings.searchProviders.duckduckgo}
                    onChange={(e) => handleSearchProviderChange('duckduckgo', e.target.checked)} className="w-4 h-4" />
                  <span>DuckDuckGo (Free, No API key needed)</span>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input type="checkbox" checked={settings.searchProviders.serper}
                    onChange={(e) => handleSearchProviderChange('serper', e.target.checked)} className="w-4 h-4" />
                  <span>Serper / Google Search (Requires API key)</span>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input type="checkbox" checked={settings.searchProviders.brave}
                    onChange={(e) => handleSearchProviderChange('brave', e.target.checked)} className="w-4 h-4" />
                  <span>Brave Search (Requires API key)</span>
                </label>
              </div>
            </div>

            {/* API Keys */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-semibold">API Keys</h2>
                <button onClick={() => setShowApiKeys(!showApiKeys)}
                  className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400">
                  {showApiKeys ? 'Hide' : 'Show'}
                </button>
              </div>

              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 mb-4">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  ⚠️ Keys set here override the backend's <code className="font-mono bg-yellow-100 dark:bg-yellow-800/40 px-1 rounded">.env</code> config for your session. They're stored only in your browser.
                </p>
              </div>

              {showApiKeys && (
                <div className="space-y-4">
                  {['groq', 'serper', 'openai', 'gemini', 'anthropic'].map((provider) => {
                    const guide = API_KEY_GUIDES[provider];
                    return (
                      <div key={provider}>
                        <label className="form-label">{guide.name} API Key</label>
                        <input
                          type="password"
                          placeholder={provider === 'groq' ? 'gsk_...' : provider === 'openai' ? 'sk-...' : provider === 'anthropic' ? 'sk-ant-...' : `Your ${guide.name} API key`}
                          value={settings.apiKeys?.[provider as keyof typeof settings.apiKeys] || ''}
                          onChange={(e) => handleApiKeyChange(provider, e.target.value)}
                          className="input"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Get from{' '}
                          <a href={guide.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">
                            {guide.url.replace('https://', '')}
                          </a>
                          {' · '}
                          <button
                            type="button"
                            onClick={() => setExpandedGuide(expandedGuide === provider ? null : provider)}
                            className="text-purple-600 dark:text-purple-400 hover:underline"
                          >
                            {expandedGuide === provider ? 'Hide guide' : 'How to get this key?'}
                          </button>
                        </p>
                        {expandedGuide === provider && (
                          <div className="mt-2 bg-gray-50 dark:bg-gray-800/40 rounded-lg p-3 border border-gray-200 dark:border-gray-700 fade-in">
                            <ol className="list-decimal list-inside space-y-1.5 text-xs text-gray-600 dark:text-gray-400">
                              {guide.steps.map((step, i) => (
                                <li key={i}>{step}</li>
                              ))}
                            </ol>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="card">
              <h3 className="text-lg font-semibold mb-4">Preferences</h3>
              <div className="space-y-3">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input type="checkbox" checked={settings.notificationsEnabled}
                    onChange={(e) => handleChange('notificationsEnabled', e.target.checked)} className="w-4 h-4" />
                  <span className="text-sm">Enable Notifications</span>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input type="checkbox" checked={settings.storeApiKeysLocally}
                    onChange={(e) => handleChange('storeApiKeysLocally', e.target.checked)} className="w-4 h-4" />
                  <span className="text-sm">Store API Keys Locally</span>
                </label>
              </div>
            </div>

            <div className="card">
              <h3 className="text-lg font-semibold mb-4">Actions</h3>
              <div className="space-y-2">
                <button onClick={saveSettings} disabled={!unsavedChanges}
                  className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed">
                  Save Changes
                </button>
                <button onClick={resetToDefaults} className="btn btn-secondary w-full">
                  Reset to Defaults
                </button>
              </div>
            </div>

            <div className="card bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">💡 Note</h3>
              <p className="text-xs text-blue-800 dark:text-blue-300">
                All settings are stored locally in your browser. API keys set here will override backend environment variables during your session.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── HELP & GUIDE TAB ── */}
      {activeTab === 'help' && (
        <div className="max-w-3xl space-y-6">
          
          {/* How TruthLens Works */}
          <div className="card">
            <h2 className="text-2xl font-semibold mb-4">How TruthLens Works</h2>
            <div className="space-y-4 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              <p>
                TruthLens is a fact-checking platform that helps you verify claims using a combination
                of web research, evidence analysis, and language model reasoning. Here's the high-level flow:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { step: '1', title: 'Submit a Claim', desc: 'Enter any statement you want to verify. Choose a research depth and category to fine-tune the analysis.' },
                  { step: '2', title: 'Research Pipeline', desc: 'We decompose the claim, search the web for evidence, extract content, generate embeddings, and rank evidence by relevance.' },
                  { step: '3', title: 'Get a Verdict', desc: 'The LLM analyzes all evidence and produces a verdict (True, False, Misleading, etc.) with confidence scores and citations.' },
                ].map((item) => (
                  <div key={item.step} className="bg-gray-50 dark:bg-gray-800/40 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                    <div className="text-xs font-mono text-purple-500 mb-1">Step {item.step}</div>
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-1">{item.title}</h4>
                    <p className="text-xs">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Research Depth Explained */}
          <div className="card">
            <h2 className="text-2xl font-semibold mb-4">Research Depth Modes</h2>
            <div className="space-y-3">
              {[
                { mode: 'Quick', time: '~30 seconds', desc: 'Searches a few top sources and gives a fast preliminary verdict. Best for well-known claims.', color: 'text-emerald-500' },
                { mode: 'Standard', time: '~1-2 minutes', desc: 'Searches multiple providers, extracts full article text, and provides a balanced analysis with evidence. Recommended for most use cases.', color: 'text-blue-500' },
                { mode: 'Deep', time: '~2-5 minutes', desc: 'Exhaustive research across all providers with full content extraction, embedding generation, and hybrid retrieval. Best for complex or controversial claims.', color: 'text-purple-500' },
              ].map((item) => (
                <div key={item.mode} className="flex items-start gap-4 bg-gray-50 dark:bg-gray-800/40 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                  <span className={`text-lg font-bold ${item.color} shrink-0 w-20`}>{item.mode}</span>
                  <div className="flex-1">
                    <p className="text-sm text-gray-700 dark:text-gray-300">{item.desc}</p>
                    <p className="text-xs text-gray-500 mt-1">Typical time: {item.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* API Key Setup Guides */}
          <div className="card">
            <h2 className="text-2xl font-semibold mb-2">Setting Up API Keys</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              TruthLens works out of the box with the default backend configuration. However, you can
              set your own API keys for more control over rate limits and provider selection.
            </p>
            <div className="space-y-3">
              {Object.entries(API_KEY_GUIDES).map(([key, guide]) => (
                <div key={key} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedGuide(expandedGuide === `help-${key}` ? null : `help-${key}`)}
                    className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors text-left"
                  >
                    <span className="font-medium text-gray-900 dark:text-white">{guide.name}</span>
                    <svg
                      className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${expandedGuide === `help-${key}` ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {expandedGuide === `help-${key}` && (
                    <div className="px-4 pb-4 fade-in">
                      <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600 dark:text-gray-400">
                        {guide.steps.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ol>
                      <a
                        href={guide.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 mt-3 text-sm text-purple-600 dark:text-purple-400 hover:underline font-medium"
                      >
                        Open {guide.name} Console →
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Export Formats */}
          <div className="card">
            <h2 className="text-2xl font-semibold mb-4">Exporting Results</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              After a fact-check completes, you can export the full report from the results page in three formats:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { format: 'PDF', desc: 'A clean, printable document with your verdict, evidence, and sources. Great for sharing or archiving.', icon: '📄' },
                { format: 'Markdown', desc: 'A text-based format perfect for pasting into notes, wikis, or documentation tools.', icon: '📝' },
                { format: 'JSON', desc: 'The raw structured data — useful for integrating with other tools or for programmatic analysis.', icon: '{ }' },
              ].map((item) => (
                <div key={item.format} className="bg-gray-50 dark:bg-gray-800/40 rounded-xl p-4 border border-gray-200 dark:border-gray-700 text-center">
                  <div className="text-2xl mb-2">{item.icon}</div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-1">{item.format}</h4>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* FAQ */}
          <div className="card">
            <h2 className="text-2xl font-semibold mb-4">Frequently Asked Questions</h2>
            <div className="space-y-4">
              {[
                { q: 'Is TruthLens free to use?', a: 'Yes! TruthLens is free and open-source. If you use the default backend configuration with Groq, there are no costs. Using premium LLM providers (OpenAI, Anthropic) requires your own API key and may incur costs from those providers.' },
                { q: 'Where is my data stored?', a: 'Claim history is stored in the backend database. Your settings and API keys (if saved) are stored locally in your browser\'s localStorage. We never send your API keys to third parties.' },
                { q: 'Which LLM provider should I choose?', a: 'Groq is recommended for most users — it\'s fast and free. OpenAI GPT-4 and Anthropic Claude tend to produce more nuanced analysis for complex claims but require paid API keys.' },
                { q: 'Why did my claim fail?', a: 'Claims can fail if the LLM provider is temporarily unavailable, your API key is invalid, or the claim couldn\'t be adequately researched online. Try again or switch to a different LLM provider.' },
              ].map((item, idx) => (
                <div key={idx}>
                  <h4 className="font-semibold text-gray-900 dark:text-white text-sm mb-1">{item.q}</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{item.a}</p>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
